import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, Loader2, MessageSquare, Pencil, Plus, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { FeaturePicker, SprintSelect, StatePill, StateSelect, TypeLabel } from '@/components/work-item';
import { RichEditor, RichView } from '@/components/rich-text';
import { HierarchyTree, MissingParent } from '@/components/hierarchy';
import { api } from '@/api';
import { useDetail } from '@/lib/detail';
import { cn } from '@/lib/utils';

const FIELD_LABELS = {
  'System.Description': 'Description',
  'Microsoft.VSTS.TCM.ReproSteps': 'Repro steps',
  'Microsoft.VSTS.Common.AcceptanceCriteria': 'Acceptance criteria',
};

function fieldsFor(detail) {
  const show = ['System.Description'];
  if (detail.type === 'Bug' || detail.fields['Microsoft.VSTS.TCM.ReproSteps']) show.push('Microsoft.VSTS.TCM.ReproSteps');
  if (detail.type === 'User Story' || detail.fields['Microsoft.VSTS.Common.AcceptanceCriteria']) show.push('Microsoft.VSTS.Common.AcceptanceCriteria');
  return show;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(d) {
  if (!d) return '';
  const s = (new Date(d).getTime() - Date.now()) / 1000;
  const steps = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [86400 * 30, 'day'],
    [86400 * 365, 'month'],
    [Infinity, 'year'],
  ];
  const div = { second: 1, minute: 60, hour: 3600, day: 86400, month: 86400 * 30, year: 86400 * 365 };
  const [, unit] = steps.find(([lim]) => Math.abs(s) < lim);
  return rtf.format(Math.round(s / div[unit]), unit);
}
const fullDate = (d) => (d ? new Date(d).toLocaleString() : '');

function Meta({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px]">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function When({ date, by }) {
  return (
    <>
      <span title={fullDate(date)}>{ago(date)}</span>
      {by && <span className="block truncate text-xs text-muted-foreground">by {by}</span>}
    </>
  );
}

function Hierarchy({ detail, item, features, onPick, disabled, onOpen }) {
  return (
    <section aria-label="Hierarchy">
      <SectionHeader
        action={
          item && (
            <FeaturePicker item={item} features={features} onPick={onPick} disabled={disabled} label="Change Feature" className="-mr-2 max-w-64" />
          )
        }
      >
        Hierarchy
      </SectionHeader>
      <HierarchyTree ancestors={detail.ancestors} self={detail} children={detail.children} onOpen={onOpen} />
      {detail.ancestors.length === 0 && <MissingParent type={detail.type} className="mt-1.5" />}
    </section>
  );
}

const PR_STATUS = {
  active: { label: 'Active', Icon: GitPullRequest, tone: 'text-emerald-600 dark:text-emerald-400', pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' },
  draft: { label: 'Draft', Icon: GitPullRequestDraft, tone: 'text-muted-foreground', pill: 'bg-muted text-muted-foreground' },
  completed: { label: 'Merged', Icon: GitMerge, tone: 'text-violet-600 dark:text-violet-400', pill: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300' },
  abandoned: { label: 'Abandoned', Icon: GitPullRequestClosed, tone: 'text-muted-foreground', pill: 'bg-muted text-muted-foreground line-through' },
};

function PullRequestRow({ pr, who, onUnlink }) {
  const s = PR_STATUS[pr.status] || PR_STATUS.active;
  if (pr.error) {
    return (
      <li className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground">
        <GitPullRequest className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          PR {pr.id} · {pr.error}
        </span>
        <UnlinkButton onClick={onUnlink} />
      </li>
    );
  }
  return (
    <li className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/60">
      <s.Icon className={cn('mt-0.5 size-4 shrink-0', s.tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <a href={pr.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[13px] font-medium hover:text-primary hover:underline">
            {pr.title}
          </a>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">!{pr.id}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground" title={`${pr.source} → ${pr.target}`}>
          <span title={fullDate(pr.closed || pr.created)}>
            {pr.closed ? `${pr.status === 'completed' ? 'Merged' : 'Closed'} ${ago(pr.closed)}` : `Opened ${ago(pr.created)}`}
          </span>{' '}
          by {who(pr.author)} · {pr.repo} → {pr.target}
        </div>
      </div>
      <span className={cn('mt-px inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium', s.pill)}>{s.label}</span>
      <UnlinkButton onClick={onUnlink} />
    </li>
  );
}

function UnlinkButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Unlink pull request"
      title="Unlink from this work item"
      className="-mr-1 shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Unlink className="size-3.5" />
    </button>
  );
}

function PullRequests({ prs, who, onLink, onUnlink, onEditingChange }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onEditingChange(adding && !!value.trim()), [adding, value, onEditingChange]);

  async function submit(e) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    const ok = await onLink(value.trim());
    setBusy(false);
    if (ok) {
      setValue('');
      setAdding(false);
    }
  }

  return (
    <section aria-label="Pull requests">
      <SectionHeader
        action={
          !adding && (
            <Button size="xs" variant="ghost" className="-mr-2 text-muted-foreground" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Link PR
            </Button>
          )
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <GitPullRequest className="size-3.5" /> Pull requests
          {prs.length > 0 && <span className="tabular-nums">{prs.length}</span>}
        </span>
      </SectionHeader>
      {adding && (
        <form onSubmit={submit} className="mb-2 flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setValue('');
                setAdding(false);
              }
            }}
            placeholder="Paste a PR URL or number"
            aria-label="Pull request URL or number"
            disabled={busy}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-[13px] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <Button size="sm" type="submit" disabled={busy || !value.trim()}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} Link
          </Button>
          <Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => (setValue(''), setAdding(false))}>
            Cancel
          </Button>
        </form>
      )}
      {prs.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {prs.map((pr) => (
            <PullRequestRow key={pr.artifact} pr={pr} who={who} onUnlink={() => onUnlink(pr)} />
          ))}
        </ul>
      ) : (
        !adding && <p className="text-[13px] text-muted-foreground">No linked pull requests.</p>
      )}
    </section>
  );
}

function SectionHeader({ children, action }) {
  return (
    <div className="mb-2 flex min-h-7 items-center gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
      <div className="ml-auto min-w-0">{action}</div>
    </div>
  );
}

function TitleEditor({ title, onSave, onEditingChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(title), [title]);
  useEffect(() => onEditingChange(editing), [editing, onEditingChange]);

  async function save() {
    const v = value.replace(/\s+/g, ' ').trim();
    if (!v || v === title) return setEditing(false);
    setSaving(true);
    const ok = await onSave(v);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <SheetTitle asChild>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group/title -mx-1.5 w-full rounded px-1.5 py-0.5 text-left text-lg leading-snug font-semibold hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {title}
          <Pencil className="ml-1.5 inline size-3.5 align-baseline text-muted-foreground opacity-40 transition-opacity group-hover/title:opacity-100 group-focus-visible/title:opacity-100" />
        </button>
      </SheetTitle>
    );
  }
  return (
    <div>
      <SheetTitle className="sr-only">{title}</SheetTitle>
      <Textarea
        autoFocus
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setValue(title);
            setEditing(false);
          }
        }}
        aria-label="Title"
        className="min-h-0 resize-none text-lg! leading-snug font-semibold"
        rows={2}
      />
    </div>
  );
}

function FieldSection({ refName, html, markdown, onSave, onEditingChange }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => onEditingChange(editing), [editing, onEditingChange]);

  return (
    <section>
      <SectionHeader
        action={
          !editing && (
            <Button variant="ghost" size="xs" data-detail-edit onClick={() => setEditing(true)} title="Edit (E)">
              <Pencil /> Edit
            </Button>
          )
        }
      >
        {FIELD_LABELS[refName]}
      </SectionHeader>
      {editing ? (
        <RichEditor
          markdown={markdown}
          initialHtml={html || ''}
          placeholder={`Write the ${FIELD_LABELS[refName].toLowerCase()}…`}
          saving={saving}
          onCancel={() => setEditing(false)}
          onSave={async (value) => {
            setSaving(true);
            const ok = await onSave(value);
            setSaving(false);
            if (ok) setEditing(false);
          }}
          minHeight="min-h-40"
        />
      ) : (
        <div className="py-1">
          <RichView html={html} markdown={markdown} empty={`No ${FIELD_LABELS[refName].toLowerCase()}.`} />
        </div>
      )}
    </section>
  );
}

function Comment({ comment, mine, onSave, onEditingChange }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => onEditingChange(editing), [editing, onEditingChange]);
  const edited = comment.modifiedDate && comment.version > 1;
  const initials = (comment.createdBy?.name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
          mine ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium">{comment.createdBy?.name}</span>
          <time className="text-xs text-muted-foreground" dateTime={comment.createdDate} title={fullDate(comment.createdDate)}>
            {ago(comment.createdDate)}
          </time>
          {edited && (
            <span className="text-xs text-muted-foreground" title={fullDate(comment.modifiedDate)}>
              · edited
            </span>
          )}
          {mine && !editing && (
            <Button variant="ghost" size="xs" className="ml-auto h-6" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
        <div className="mt-1">
          {editing ? (
            <RichEditor
              markdown={comment.format === 'markdown'}
              initialHtml={comment.text}
              placeholder="Edit comment…"
              saving={saving}
              onCancel={() => setEditing(false)}
              onSave={async (text) => {
                setSaving(true);
                const ok = await onSave(comment.id, text, comment.format);
                setSaving(false);
                if (ok) setEditing(false);
              }}
              minHeight="min-h-20"
            />
          ) : (
            <RichView html={comment.text} markdown={comment.format === 'markdown'} />
          )}
        </div>
      </div>
    </li>
  );
}

function NewComment({ onAdd, onEditingChange }) {
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => onEditingChange(active), [active, onEditingChange]);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-left text-[13px] text-muted-foreground hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Add a comment…
      </button>
    );
  }
  return (
    <RichEditor
      placeholder="Add a comment…"
      saveLabel="Comment"
      saving={saving}
      onCancel={() => setActive(false)}
      onSave={async (text) => {
        if (!text || !text.replace(/<[^>]+>|&nbsp;|\s/g, '')) return;
        setSaving(true);
        const ok = await onAdd(text);
        setSaving(false);
        if (ok) setActive(false);
      }}
      minHeight="min-h-20"
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-7 w-3/4" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
      <Skeleton className="h-32" />
      <Skeleton className="h-20" />
    </div>
  );
}

export function ItemDetail({ id, data, features, pendingIds, onUpdate, onItemPatched, onClose }) {
  const { openItem } = useDetail();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const editors = useRef(new Set());
  const [, force] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const item = data?.items.find((i) => i.id === id);
  const who = (p) => (p?.id && p.id === data?.me?.id ? 'you' : p?.name);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.detail(id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setDetail(null);
    setConfirming(false);
    editors.current = new Set();
    load();
  }, [load]);

  // Keep state/sprint in the header in sync with board edits.
  useEffect(() => {
    if (item && detail && item.id === detail.id && (item.state !== detail.state || item.iterationPath !== detail.iterationPath)) {
      setDetail((d) => ({ ...d, state: item.state, iterationPath: item.iterationPath }));
    }
  }, [item, detail]);

  // Re-read the hierarchy after the parent is changed from the Feature picker.
  const parentId = item?.parentId;
  const lastParent = useRef(parentId);
  useEffect(() => {
    if (lastParent.current !== parentId && detail?.id === id) api.detail(id).then((fresh) => setDetail((d) => (d?.id === id ? { ...d, ancestors: fresh.ancestors, parent: fresh.parent, rev: fresh.rev } : d)), () => {});
    lastParent.current = parentId;
  }, [parentId, id, detail?.id]);

  const trackEditing = useCallback(
    (key) => (on) => {
      const had = editors.current.has(key);
      if (on && !had) editors.current.add(key);
      else if (!on && had) editors.current.delete(key);
      else return;
      force((n) => n + 1);
    },
    [],
  );
  const trackers = useRef(new Map());
  const tracker = (key) => {
    if (!trackers.current.has(key)) trackers.current.set(key, trackEditing(key));
    return trackers.current.get(key);
  };

  function requestClose() {
    if (editors.current.size) return setConfirming(true);
    onClose();
  }

  // E edits the first text field; J / K step to the next / previous card on the page.
  useEffect(() => {
    if (!id) return;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'e') {
        const edit = document.querySelector('[data-detail-edit]');
        if (edit) {
          e.preventDefault();
          edit.click();
        }
      } else if (k === 'j' || k === 'k') {
        e.preventDefault();
        if (editors.current.size) return setConfirming(true);
        const known = new Set(data?.items.map((i) => i.id));
        const ids = [...new Set([...document.querySelectorAll('[data-item-id]')].map((el) => Number(el.dataset.itemId)))].filter((n) => known.has(n));
        const at = ids.indexOf(id);
        const next = at === -1 ? ids[0] : ids[at + (k === 'j' ? 1 : -1)];
        if (next) openItem(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, data, openItem]);

  /**
   * Saves with optimistic concurrency. ADO bumps the revision on unrelated changes (e.g. comments),
   * so on conflict re-read and retry when the field being saved is still what we started from.
   */
  async function saveFields(patch, unchanged) {
    try {
      const r = await api.update(detail.id, { ...patch, rev: detail.rev });
      return r;
    } catch (e) {
      if (e.status !== 409) throw e;
      const fresh = await api.detail(detail.id);
      if (!unchanged(fresh)) {
        setDetail(fresh);
        const err = new Error(`${fresh.changedBy?.name || 'Someone'} changed this ${ago(fresh.changedDate)}. Their version is shown; your text is still in the editor.`);
        err.conflict = true;
        throw err;
      }
      return api.update(detail.id, { ...patch, rev: fresh.rev });
    }
  }

  async function saveTitle(title) {
    try {
      const r = await saveFields({ title }, (fresh) => fresh.title === detail.title);
      setDetail((d) => ({ ...d, title: r.title, rev: r.rev }));
      onItemPatched(detail.id, { title: r.title });
      toast.success(`#${detail.id} title updated`);
      return true;
    } catch (e) {
      toast.error(`#${detail.id}: title not saved`, { description: e.message });
      return false;
    }
  }

  async function saveField(ref, html) {
    try {
      const r = await saveFields({ fields: { [ref]: html }, markdown: detail.markdown || [] }, (fresh) => (fresh.fields[ref] || '') === (detail.fields[ref] || ''));
      setDetail((d) => ({ ...d, rev: r.rev, fields: { ...d.fields, [ref]: html } }));
      toast.success(`#${detail.id} ${FIELD_LABELS[ref].toLowerCase()} saved`);
      return true;
    } catch (e) {
      toast.error(`#${detail.id}: ${FIELD_LABELS[ref].toLowerCase()} not saved`, { description: e.message });
      return false;
    }
  }

  async function addComment(text) {
    try {
      const c = await api.addComment(detail.id, text);
      setDetail((d) => ({ ...d, comments: [c, ...d.comments], commentCount: d.commentCount + 1 }));
      return true;
    } catch (e) {
      toast.error(`#${detail.id}: comment not posted`, { description: e.message });
      return false;
    }
  }

  async function linkPullRequest(ref) {
    try {
      const r = await api.linkPullRequest(detail.id, ref);
      setDetail((d) => ({ ...d, rev: r.rev, pullRequests: [r.pullRequest, ...d.pullRequests.filter((p) => p.artifact !== r.pullRequest.artifact)] }));
      toast.success(`PR ${r.pullRequest.id} linked to #${detail.id}`);
      return true;
    } catch (e) {
      toast.error(`#${detail.id}: PR not linked`, { description: e.message });
      return false;
    }
  }

  async function unlinkPullRequest(pr) {
    try {
      const r = await api.unlinkPullRequest(detail.id, pr.artifact);
      setDetail((d) => ({ ...d, rev: r.rev, pullRequests: d.pullRequests.filter((p) => p.artifact !== pr.artifact) }));
      toast.success(`PR ${pr.id} unlinked from #${detail.id}`, pr.url ? { action: { label: 'Undo', onClick: () => linkPullRequest(pr.url) } } : undefined);
    } catch (e) {
      toast.error(`#${detail.id}: PR not unlinked`, { description: e.message });
    }
  }

  async function editComment(commentId, text, format) {
    try {
      const c = await api.editComment(detail.id, commentId, text, format);
      setDetail((d) => ({ ...d, comments: d.comments.map((x) => (x.id === c.id ? c : x)) }));
      return true;
    } catch (e) {
      toast.error(`#${detail.id}: comment not saved`, { description: e.message });
      return false;
    }
  }

  const pending = item ? pendingIds.has(item.id) : false;

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent
        className="gap-0 sm:max-w-2xl"
        onEscapeKeyDown={(e) => {
          if (!editors.current.size) return;
          e.preventDefault();
          // Escape inside an editor cancels that edit; only ask when it comes from elsewhere.
          const t = e.target;
          if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;
          setConfirming(true);
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!detail ? (
          <>
            <SheetTitle className="sr-only">Work item {id}</SheetTitle>
            <SheetDescription className="sr-only">Loading work item details</SheetDescription>
            {error ? (
              <div className="m-5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Could not load #{id}: {error}{' '}
                <button type="button" className="underline underline-offset-2" onClick={load}>
                  Try again
                </button>
              </div>
            ) : (
              <DetailSkeleton />
            )}
          </>
        ) : (
          <>
            <header className="flex flex-col gap-2 border-b px-5 pt-3 pb-3">
              <div className="flex h-7 items-center gap-2 pr-8">
                <TypeLabel type={detail.type} />
                <a
                  href={detail.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums hover:text-primary hover:underline"
                >
                  {detail.id} <ExternalLink className="size-3" />
                </a>
                {item ? (
                  <StateSelect item={item} states={data.states[item.type]} onChange={(p) => onUpdate(item, p)} disabled={pending} />
                ) : (
                  <StatePill state={detail.state} />
                )}
                {detail.priority != null && (
                  <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground tabular-nums" title={`Priority ${detail.priority}`}>
                    P{detail.priority}
                  </span>
                )}
                {pending && (
                  <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Saving…
                  </span>
                )}
                <button
                  type="button"
                  className="ml-auto rounded-sm p-1 text-muted-foreground opacity-80 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
                  onClick={load}
                  disabled={loading}
                  aria-label="Reload from Azure DevOps"
                  title="Reload from Azure DevOps"
                >
                  <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                </button>
              </div>
              <TitleEditor title={detail.title} onSave={saveTitle} onEditingChange={tracker('title')} />
              <SheetDescription className="sr-only">
                {detail.type} {detail.id} details
              </SheetDescription>
              {item && (
                <div className="-ml-2 flex flex-wrap items-center gap-2">
                  <SprintSelect
                    item={item}
                    data={data}
                    onChange={(p) => onUpdate(item, p)}
                    disabled={pending}
                    className="border-0 bg-transparent px-2 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground dark:bg-transparent dark:hover:bg-accent"
                  />
                </div>
              )}
            </header>

            {confirming && (
              <div role="alertdialog" aria-label="Unsaved edits" className="flex items-center gap-2 border-b bg-amber-50 px-5 py-2 text-[13px] text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                <span className="mr-auto">You have unsaved edits.</span>
                <Button size="xs" variant="ghost" autoFocus onClick={() => setConfirming(false)}>
                  Keep editing
                </Button>
                <Button size="xs" variant="destructive" onClick={onClose}>
                  Discard
                </Button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-6 px-5 py-4">
                <Hierarchy
                  detail={detail}
                  item={item}
                  features={features}
                  onPick={(parentId) => onUpdate(item, { parentId })}
                  disabled={pending}
                  onOpen={(next) => (editors.current.size ? setConfirming(true) : openItem(next))}
                />
                <section aria-label="Details">
                  <SectionHeader>Details</SectionHeader>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    <Meta label="Assigned to">{who(detail.assignedTo)?.replace(/^you$/, 'You')}</Meta>
                    <Meta label="Area">{detail.areaPath?.replace(/^SAN SA\\?/, '') || 'SAN SA'}</Meta>
                    <Meta label="Created">
                      <When date={detail.createdDate} by={who(detail.createdBy)} />
                    </Meta>
                    <Meta label="Last changed">
                      <When date={detail.changedDate} by={who(detail.changedBy)} />
                    </Meta>
                    {detail.tags.length > 0 && (
                      <div className="col-span-full">
                        <dt className="text-xs text-muted-foreground">Tags</dt>
                        <dd className="mt-1 flex flex-wrap gap-1">
                          {detail.tags.map((t) => (
                            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {t}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>

                <PullRequests
                  key={`prs-${detail.id}`}
                  prs={detail.pullRequests || []}
                  who={who}
                  onLink={linkPullRequest}
                  onUnlink={unlinkPullRequest}
                  onEditingChange={tracker('pr-link')}
                />

                {fieldsFor(detail).map((ref) => (
                  <FieldSection
                    key={`${detail.id}-${ref}`}
                    refName={ref}
                    html={detail.fields[ref]}
                    markdown={detail.markdown?.includes(ref)}
                    onSave={(html) => saveField(ref, html)}
                    onEditingChange={tracker(ref)}
                  />
                ))}

                <section>
                  <SectionHeader>
                    <span className="inline-flex items-center gap-1.5">
                      <MessageSquare className="size-3.5" /> Comments
                      <span className="tabular-nums">{detail.commentCount}</span>
                    </span>
                  </SectionHeader>
                  <NewComment key={`new-${detail.id}`} onAdd={addComment} onEditingChange={tracker('new-comment')} />
                  {detail.comments.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-4">
                      {detail.comments.map((c) => (
                        <Comment
                          key={c.id}
                          comment={c}
                          mine={c.createdBy?.id === data?.me?.id}
                          onSave={editComment}
                          onEditingChange={tracker(`comment-${c.id}`)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
