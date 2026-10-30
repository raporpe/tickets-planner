import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Columns3,
  ExternalLink,
  Loader2,
  MessageSquare,
  PencilLine,
  Plus,
  Sparkles,
  Square,
  SquarePen,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TypeLabel } from '@/components/work-item';
import { RichView } from '@/components/rich-text';
import { api } from '@/api';
import { useDetail } from '@/lib/detail';
import { cn } from '@/lib/utils';

const TOOL_LABELS = {
  get_item: (a) => `Read #${a?.id}`,
  get_tree: (a) => `Explored items under #${a?.id}`,
  search_items: (a) => (a?.text ? `Searched “${a.text}”` : 'Searched work items'),
  list_my_items: () => 'Listed your items',
  list_features: () => 'Listed board Features',
  list_sprints: () => 'Listed sprints',
  propose_changes: () => 'Prepared a proposal',
};

function reduce(state, ev) {
  if (ev.type === 'reset') return { entries: [], lastSeq: -1 };
  // A replacement server session restarts its sequence numbers; keep the transcript.
  if (ev.type === 'new_session') return { ...state, lastSeq: -1 };
  if (ev.type === 'local_error') return { ...state, entries: [...state.entries, { kind: 'error', key: `le${Date.now()}`, text: ev.message }] };
  if (ev.seq <= state.lastSeq) return state;
  const entries = [...state.entries];
  const next = { entries, lastSeq: ev.seq };
  const find = (pred) => entries.findIndex(pred);
  switch (ev.type) {
    case 'user':
      entries.push({ kind: 'user', key: `u${ev.seq}`, text: ev.text });
      break;
    case 'delta':
    case 'message': {
      const i = find((e) => e.kind === 'assistant' && e.id === ev.messageId);
      if (i < 0) entries.push({ kind: 'assistant', key: `a${ev.seq}`, id: ev.messageId, text: ev.text, streaming: ev.type === 'delta' });
      else entries[i] = { ...entries[i], text: ev.type === 'delta' ? entries[i].text + ev.text : ev.text, streaming: ev.type === 'delta' };
      break;
    }
    case 'tool':
      entries.push({ kind: 'tool', key: `t${ev.seq}`, id: ev.id, name: ev.name, args: ev.args, status: 'running' });
      break;
    case 'tool_done': {
      const i = find((e) => e.kind === 'tool' && e.id === ev.id);
      if (i >= 0) entries[i] = { ...entries[i], status: ev.success ? 'done' : 'failed', error: ev.error };
      break;
    }
    case 'proposal':
      entries.push({ kind: 'proposal', key: `p${ev.seq}`, proposal: ev.proposal });
      break;
    case 'error':
      entries.push({ kind: 'error', key: `e${ev.seq}`, text: ev.message });
      break;
    case 'idle':
      return { lastSeq: ev.seq, entries: entries.map((e) => (e.streaming ? { ...e, streaming: false } : e)) };
    default:
  }
  return next;
}

const itemLabel = (t) => (t?.id ? `#${t.id}` : t?.ref ? `new “${t.title}”` : '');

function ChangeDetails({ change }) {
  const bits = [];
  if (change.title && change.kind === 'update') bits.push(`title → “${change.title}”`);
  if (change.kind === 'update') {
    if (change.state) bits.push(`state → ${change.state}`);
    if (change.sprint) bits.push(`sprint → ${change.sprint.name}`);
    if (change.priority) bits.push(`priority ${change.priority}`);
  }
  if (change.parent && change.kind === 'update') bits.push(`parent → ${itemLabel(change.parent)}`);
  for (const t of change.addTags || []) bits.push(`+ ${t}`);
  for (const t of change.removeTags || []) bits.push(`− ${t}`);
  const rich = [
    ['description', 'Description'],
    ['acceptanceCriteria', 'Acceptance criteria'],
    ['reproSteps', 'Repro steps'],
  ].filter(([k]) => change[k]);
  return (
    <>
      {bits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {bits.map((b) => (
            <span key={b} className="rounded bg-muted px-1.5 py-px text-[11px] text-foreground/85">
              {b}
            </span>
          ))}
        </div>
      )}
      {rich.map(([k, label]) => (
        <details key={k} className="group text-[12px]">
          <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
            {change.kind === 'update' ? `Rewrite ${label.toLowerCase()}` : label}
          </summary>
          <RichView markdown html={change[k]} className="mt-1 rounded-md border bg-background/60 px-2.5 py-2 text-[12px]" />
        </details>
      ))}
    </>
  );
}

function Result({ result }) {
  if (!result) return null;
  if (!result.ok)
    return (
      <p className="text-[12px] text-destructive">
        <X className="mr-1 inline size-3" />
        {result.error}
      </p>
    );
  return (
    <p className="text-[12px] text-emerald-400">
      <Check className="mr-1 inline size-3" />
      {result.kind === 'create' ? 'Created ' : 'Done '}
      {result.id && (
        <a href={result.url} target="_blank" rel="noreferrer" className="tabular-nums underline-offset-2 hover:underline">
          #{result.id} <ExternalLink className="inline size-3" />
        </a>
      )}
      {result.warning && <span className="block text-amber-300">{result.warning}</span>}
    </p>
  );
}

function ChangeRow({ change, index, included, onToggle, title, onTitle, result, locked, nested }) {
  const { openItem } = useDetail();
  const target = change.target;
  const Icon = { create: Plus, update: PencilLine, comment: MessageSquare, feature_column: Columns3 }[change.kind];
  const link = (t) =>
    t?.id ? (
      <button type="button" className="text-muted-foreground tabular-nums hover:text-primary hover:underline" onClick={() => openItem(t.id)}>
        #{t.id}
      </button>
    ) : (
      <span className="text-muted-foreground">new</span>
    );

  return (
    <li className={cn('flex gap-2 py-2', nested && 'ml-5 border-l pl-3', !included && 'opacity-50')}>
      <Checkbox
        checked={included}
        onCheckedChange={(v) => onToggle(index, !!v)}
        disabled={locked}
        aria-label={`Include change ${index + 1}`}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {change.kind === 'create' ? (
            <>
              <TypeLabel type={change.type} />
              {locked ? (
                <span className="truncate text-[13px] font-medium">{title}</span>
              ) : (
                <Input
                  value={title}
                  onChange={(e) => onTitle(index, e.target.value)}
                  aria-label="Title"
                  className="h-7 min-w-0 flex-1 px-2 text-[13px]"
                />
              )}
            </>
          ) : (
            <span className="min-w-0 truncate text-[13px]">
              {link(target)} <span className="font-medium">{target?.title}</span>
            </span>
          )}
        </div>
        {change.kind === 'create' && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {change.parent && (
              <span className="min-w-0 truncate">
                under {link(change.parent)} {change.parent.title}
              </span>
            )}
            {change.sprint?.name && <span className="text-foreground/80">{change.sprint.name}</span>}
            {change.state && <span>{change.state}</span>}
            {change.priority && <span>P{change.priority}</span>}
            {change.tags?.map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-px text-foreground/80">
                {t}
              </span>
            ))}
          </div>
        )}
        {change.kind === 'comment' && <RichView markdown html={change.text} className="rounded-md border bg-background/60 px-2.5 py-2 text-[12px]" />}
        {change.kind === 'feature_column' && <p className="text-[12px]">Move to column <span className="font-medium">{change.column}</span></p>}
        <ChangeDetails change={change} />
        {change.reason && <p className="text-[11px] text-muted-foreground">{change.reason}</p>}
        <Result result={result} />
      </div>
    </li>
  );
}

function ProposalCard({ proposal, onApplied }) {
  const { changes } = proposal;
  const [included, setIncluded] = useState(() => changes.map(() => true));
  const [titles, setTitles] = useState(() => changes.map((c) => c.title || ''));
  const [status, setStatus] = useState('pending');
  const [results, setResults] = useState(null);

  const dependents = useCallback(
    (ref) => changes.map((c, i) => (c.parent?.ref === ref || c.target?.ref === ref ? i : -1)).filter((i) => i >= 0),
    [changes],
  );

  const toggle = (index, on) => {
    setIncluded((prev) => {
      const next = [...prev];
      const visit = (i) => {
        next[i] = on;
        const c = changes[i];
        if (!on && c.kind === 'create') dependents(c.ref).forEach(visit);
        const up = c.parent?.ref || c.target?.ref;
        if (on && up) {
          const p = changes.findIndex((x) => x.kind === 'create' && x.ref === up);
          if (p >= 0 && !next[p]) visit(p);
        }
      };
      visit(index);
      return next;
    });
  };

  const count = included.filter(Boolean).length;
  const locked = status !== 'pending';

  async function apply() {
    const refs = new Set(changes.filter((c, i) => included[i] && c.kind === 'create').map((c) => c.ref));
    const selected = changes
      .map((c, i) => ({ c: { ...c, title: c.kind === 'create' ? titles[i].trim() : c.title }, i }))
      .filter(({ i }) => included[i])
      .map(({ c }) => (c.related ? { ...c, related: c.related.filter((r) => !r.ref || refs.has(r.ref)) } : c));
    if (selected.some((c) => c.kind === 'create' && !c.title)) return toast.error('Every new item needs a title.');
    setStatus('applying');
    try {
      const r = await api.applyProposal(proposal.id, selected);
      const byOriginal = changes.map(() => null);
      let k = 0;
      included.forEach((on, i) => {
        if (on) byOriginal[i] = r.results[k++];
      });
      setResults(byOriginal);
      setStatus('applied');
      if (r.failed) toast.error(`${r.applied} change${r.applied === 1 ? '' : 's'} applied, ${r.failed} failed.`);
      else toast.success(`${r.applied} change${r.applied === 1 ? '' : 's'} applied in Azure DevOps.`);
      onApplied?.();
    } catch (e) {
      setStatus('pending');
      toast.error(e.message, { duration: 10000 });
    }
  }

  async function discard() {
    setStatus('discarded');
    await api.discardProposal(proposal.id).catch(() => {});
  }

  return (
    <section className="rounded-lg border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.3)]" aria-label="Proposed changes">
      <header className="flex items-start gap-2 border-b px-3 py-2.5">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">
            {changes.length} proposed change{changes.length === 1 ? '' : 's'}
          </h3>
          {proposal.summary && <p className="mt-0.5 text-[12px] text-muted-foreground">{proposal.summary}</p>}
        </div>
      </header>
      <ul className="divide-y px-3">
        {changes.map((c, i) => (
          <ChangeRow
            key={i}
            change={c}
            index={i}
            included={included[i]}
            onToggle={toggle}
            title={titles[i]}
            onTitle={(idx, v) => setTitles((t) => t.map((x, j) => (j === idx ? v : x)))}
            result={results?.[i]}
            locked={locked}
            nested={c.kind === 'create' && !!c.parent?.ref}
          />
        ))}
      </ul>
      <footer className="flex items-center gap-2 border-t px-3 py-2">
        {status === 'applied' ? (
          <p className="text-[12px] text-muted-foreground">Applied. The board has been refreshed.</p>
        ) : status === 'discarded' ? (
          <p className="text-[12px] text-muted-foreground">Discarded. Nothing was written.</p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">Nothing is written until you apply.</p>
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={discard} disabled={status === 'applying'}>
              Discard
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={apply} disabled={!count || status === 'applying'}>
              {status === 'applying' && <Loader2 className="animate-spin" />}
              Apply {count} change{count === 1 ? '' : 's'}
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}

function ToolLine({ entry }) {
  const label = (TOOL_LABELS[entry.name] || (() => entry.name))(entry.args);
  return (
    <li className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      {entry.status === 'running' ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : entry.status === 'failed' ? (
        <X className="size-3 text-destructive" aria-hidden />
      ) : (
        <Check className="size-3" aria-hidden />
      )}
      <span className="truncate">{label}</span>
      {entry.status === 'failed' && entry.error && <span className="truncate text-destructive/80">· {entry.error}</span>}
    </li>
  );
}

// Consecutive tool calls collapse into one quiet activity list.
function groupEntries(entries) {
  const out = [];
  for (const e of entries) {
    if (e.kind === 'tool') {
      const last = out.at(-1);
      if (last?.kind === 'tools') last.items.push(e);
      else out.push({ kind: 'tools', key: e.key, items: [e] });
    } else out.push(e);
  }
  return out;
}

const SUGGESTIONS = {
  item: ['Break this down into subtasks', 'Summarise this item and what is left to do', 'Check this item against the ticket methodology'],
  general: ['What should go into the next sprint?', 'Which of my open items have no Feature?', 'Create a Task from my notes: '],
};

export function AssistantPanel({ open, onClose, request, data, onApplied }) {
  const [state, dispatch] = useReducer(reduce, { entries: [], lastSeq: -1 });
  const [session, setSession] = useState(null);
  const [context, setContext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(null);
  const scroller = useRef(null);
  const inputRef = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;

  const contextItem = useMemo(() => {
    if (!context) return null;
    return data?.items.find((i) => i.id === context.id) || data?.features.find((f) => f.id === context.id) || context;
  }, [context, data]);

  const reset = useCallback((ctx = null) => {
    const old = sessionRef.current;
    if (old) api.agentClose(old.id).catch(() => {});
    setSession(null);
    setBusy(false);
    setContext(ctx);
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    const es = api.agentEvents(session.id);
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      dispatch(ev);
      if (ev.type === 'idle' || ev.type === 'error') setBusy(false);
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setBusy(false);
        setSession(null);
        dispatch({ type: 'local_error', message: 'Lost the connection to the assistant. Your next message starts a new chat.' });
      }
    };
    return () => es.close();
  }, [session]);

  useEffect(() => () => sessionRef.current && api.agentClose(sessionRef.current.id).catch(() => {}), []);

  const send = useCallback(
    async (text, ctx = context) => {
      const msg = text.trim();
      if (!msg || busy || starting) return;
      setInput('');
      setBusy(true);
      try {
        let s = sessionRef.current;
        if (!s) {
          setStarting(true);
          const created = await api.agentStart(ctx?.id).finally(() => setStarting(false));
          s = { id: created.id };
          setModel(created.model);
          dispatch({ type: 'new_session' });
          sessionRef.current = s;
          setSession(s);
        }
        await api.agentSend(s.id, msg);
      } catch (e) {
        setBusy(false);
        if (e.status === 404) setSession(null);
        setInput(msg);
        toast.error(e.message, { duration: 10000 });
      }
    },
    [busy, starting, context],
  );

  // Opened from a work item: start a fresh chat about it, optionally with a prompt.
  useEffect(() => {
    if (!request) return;
    const ctx = request.itemId ? { id: request.itemId, title: request.title } : null;
    reset(ctx);
    if (request.prompt) setTimeout(() => send(request.prompt, ctx), 0);
    else setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.entries]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const stop = () => session && api.agentAbort(session.id).catch((e) => toast.error(e.message));
  const groups = groupEntries(state.entries);
  const waiting = busy && !state.entries.at(-1)?.streaming && state.entries.at(-1)?.kind !== 'tool';

  return (
    <aside
      className={cn('flex h-full w-[440px] shrink-0 flex-col border-l bg-card/40', !open && 'hidden')}
      aria-label="Assistant"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h2 className="text-[14px] font-semibold tracking-tight">Assistant</h2>
        {model && <span className="truncate text-[11px] text-muted-foreground">GitHub Copilot · {model}</span>}
        <div className="ml-auto flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => reset(null)} aria-label="New chat">
                <SquarePen className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon-sm" className="size-7" onClick={onClose} aria-label="Close assistant">
            <X className="size-3.5" />
          </Button>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {groups.length === 0 ? (
          <div className="flex flex-col gap-3 pt-6">
            <p className="text-[13px] text-pretty">
              {contextItem
                ? `Ask about #${contextItem.id} or have it broken down.`
                : 'Ask about your tickets, plan the next sprint, or describe work to turn into tickets.'}
            </p>
            <p className="text-[12px] text-muted-foreground text-pretty">
              It reads Azure DevOps live and follows your ticket methodology. Changes come back as a proposal you review; nothing is written until you apply it.
            </p>
            <div className="flex flex-col items-start gap-1.5 pt-1">
              {SUGGESTIONS[contextItem ? 'item' : 'general'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => (s.endsWith(': ') ? (setInput(s), inputRef.current?.focus()) : send(s))}
                  className="rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {s.replace(/: $/, '…')}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((g) => {
              if (g.kind === 'user')
                return (
                  <p key={g.key} className="ml-8 self-end rounded-lg bg-muted px-3 py-2 text-[13px] whitespace-pre-wrap">
                    {g.text}
                  </p>
                );
              if (g.kind === 'assistant') return <RichView key={g.key} markdown html={g.text} className="text-[13px]" />;
              if (g.kind === 'tools')
                return (
                  <ul key={g.key} className="flex flex-col gap-0.5">
                    {g.items.map((t) => (
                      <ToolLine key={t.key} entry={t} />
                    ))}
                  </ul>
                );
              if (g.kind === 'proposal') return <ProposalCard key={g.key} proposal={g.proposal} onApplied={onApplied} />;
              return (
                <p key={g.key} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  {g.text}
                </p>
              );
            })}
            {waiting && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden /> {starting ? 'Starting Copilot…' : 'Thinking…'}
              </p>
            )}
          </div>
        )}
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {contextItem && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>About</span>
            <span className="min-w-0 truncate rounded bg-muted px-1.5 py-px text-foreground/85">
              #{contextItem.id} {contextItem.title}
            </span>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/50">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={busy ? 'Working…' : 'Ask or describe work…'}
            aria-label="Message the assistant"
            className="max-h-40 min-h-8 flex-1 resize-none border-0 bg-transparent p-1 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {busy ? (
            <Button type="button" size="icon-sm" variant="secondary" className="size-7 shrink-0" onClick={stop} aria-label="Stop">
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon-sm" className="size-7 shrink-0" disabled={!input.trim() || starting} aria-label="Send">
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
      </form>
    </aside>
  );
}
