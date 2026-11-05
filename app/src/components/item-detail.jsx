import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, Link2, Loader2, MessageSquare, Pencil, Plus, RefreshCw, Unlink, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { FeaturePicker, SprintSelect, StatePill, StateSelect, TypeLabel } from '@/components/work-item';
import { RichEditor, RichView } from '@/components/rich-text';
import { HierarchyTree, MissingParent } from '@/components/hierarchy';
import { api } from '@/api';
import { useDetail } from '@/lib/detail';
import { CURRENT_CYCLE_TAG, hasCycleTag, hasPlatformTag, isSprintUnplanned, isSprintUnplannedTag, PLATFORM_TAGS, SPRINT_UNPLANNED_TAG } from '@/lib/planning';
import { isTyping, overlayOpen, runAction, takeQueued, TICKET_ACTIONS, useAction } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

const FIELD_LABELS = {
  'System.Description': 'Description',
  'Microsoft.VSTS.TCM.ReproSteps': 'Repro steps',
  'Microsoft.VSTS.Common.AcceptanceCriteria': 'Acceptance criteria',
};

const detailCache = new Map();
const inflightDetails = new Map();

export function clearDetailCache() {
  detailCache.clear();
  inflightDetails.clear();
}

function fetchDetail(id, { force = false } = {}) {
  if (!force && detailCache.has(id)) return Promise.resolve(detailCache.get(id));
  if (!force && inflightDetails.has(id)) return inflightDetails.get(id);
  const promise = api
    .detail(id)
    .then((d) => {
      detailCache.set(id, d);
      inflightDetails.delete(id);
      return d;
    })
    .catch((e) => {
      inflightDetails.delete(id);
      throw e;
    });
  inflightDetails.set(id, promise);
  return promise;
}

export function prefetchDetail(id) {
  if (!id || detailCache.has(id) || inflightDetails.has(id)) return;
  fetchDetail(id).catch(() => {});
}

function seedDetail(id, data, features) {
  if (!id) return null;
  if (detailCache.has(id)) return detailCache.get(id);
  const item = data?.items.find((i) => i.id === id);
  if (item) {
    const baseEdit = item.url ? item.url.replace(/\/\d+$/, '') : 'https://msasg.visualstudio.com/SAN%20SA/_workitems/edit';
    const ancestors = [...(item.chain || [])]
      .reverse()
      .map((a) => ({ ...a, url: `${baseEdit}/${a.id}` }));
    return {
      id: item.id,
      url: item.url,
      type: item.type,
      title: item.title,
      state: item.state,
      iterationPath: item.iterationPath,
      areaPath: data?.project || 'SAN SA',
      tags: item.tags || [],
      assignedTo: data?.me ? { id: data.me.id, name: data.me.name } : null,
      changedDate: item.changedDate,
      parent: ancestors.at(-1) || null,
      ancestors,
      childCount: item.childCount || 0,
      children: [],
      pullRequests: [],
      fields: {},
      markdown: [],
      comments: [],
      commentCount: 0,
      partial: true,
    };
  }
  const feature = features?.find((f) => f.id === id);
  if (feature) {
    return {
      id: feature.id,
      url: feature.url,
      type: 'Feature',
      title: feature.title,
      state: feature.state,
      iterationPath: feature.iterationPath,
      areaPath: data?.project || 'SAN SA',
      tags: [],
      assignedTo: feature.owner ? { name: feature.owner } : null,
      parent: null,
      ancestors: [],
      childCount: 0,
      children: [],
      pullRequests: [],
      fields: {},
      markdown: [],
      comments: [],
      commentCount: 0,
      partial: true,
    };
  }
  return null;
}

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
      {!detail.partial && detail.ancestors.length === 0 && <MissingParent type={detail.type} className="mt-1.5" />}
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

function PullRequests({ id, prs, who, onLink, onUnlink, onEditingChange }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);
  const scope = useAction('link-pr', id, () => {
    input.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    input.current?.focus({ preventScroll: true });
  });
  const ready = !!value.trim();
  useEffect(() => onEditingChange(ready), [ready, onEditingChange]);

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const err = await onLink(value.trim());
    setBusy(false);
    if (err) {
      setError(err);
      input.current?.focus();
    } else setValue('');
  }

  return (
    <section aria-label="Pull requests">
      <SectionHeader>
        <span className="inline-flex items-center gap-1.5">
          <GitPullRequest className="size-3.5" /> Pull requests
          {prs.length > 0 && <span className="tabular-nums">{prs.length}</span>}
        </span>
      </SectionHeader>
      <form ref={scope} onSubmit={submit} className="group/pr relative">
        <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={input}
          value={value}
          onChange={(e) => (setValue(e.target.value), setError(null))}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              if (!value) return e.currentTarget.blur();
              setValue('');
              setError(null);
            }
          }}
          placeholder={prs.length ? 'Paste another PR link and press Enter' : 'No linked PRs yet. Paste a PR link and press Enter'}
          aria-label="Link a pull request by URL or number"
          aria-invalid={!!error}
          aria-describedby={error ? 'pr-link-error' : undefined}
          readOnly={busy}
          className={cn(
            'h-8 w-full rounded-md border border-input bg-transparent pr-16 pl-8 text-[13px] transition-colors placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
            error && 'border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/30',
          )}
        />
        <span className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center text-xs text-muted-foreground">
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3.5 animate-spin" /> Linking
            </span>
          ) : ready ? (
            <kbd className="rounded border bg-muted px-1.5 font-sans text-[11px]">Enter ↵</kbd>
          ) : (
            <kbd className="rounded border bg-muted px-1.5 font-sans text-[11px] group-focus-within/pr:hidden" title="Press P to jump here">
              P
            </kbd>
          )}
        </span>
      </form>
      {error && (
        <p id="pr-link-error" role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      {prs.length > 0 && (
        <ul className="-mx-2 mt-2 flex flex-col">
          {prs.map((pr) => (
            <PullRequestRow key={pr.artifact} pr={pr} who={who} onUnlink={() => onUnlink(pr)} />
          ))}
        </ul>
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

function TagsEditor({ detail, disabled, onSaveTags }) {
  const [draft, setDraft] = useState('');
  const tags = detail.tags || [];
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  const missingCycle = !hasCycleTag(detail);
  const missingPlatform = !hasPlatformTag(detail);
  const quickPlatforms = PLATFORM_TAGS.filter((p) => !lower.has(p.toLowerCase()));

  async function addTags(raw) {
    const incoming = String(raw || '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !isSprintUnplannedTag(s) && !lower.has(s.toLowerCase()));
    if (!incoming.length) return;
    await onSaveTags([...tags, ...incoming]);
  }

  async function removeTag(target) {
    if (isSprintUnplannedTag(target)) return;
    await onSaveTags(tags.filter((t) => t !== target));
  }

  return (
    <div className="col-span-full">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-xs text-muted-foreground">Tags</dt>
        {(missingCycle || missingPlatform) && (
          <span className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
            Missing:{' '}
            {[missingCycle && CURRENT_CYCLE_TAG, missingPlatform && 'platform tag'].filter(Boolean).join(' + ')}
          </span>
        )}
      </div>
      <dd className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {tags.map((t) =>
          isSprintUnplannedTag(t) ? (
            <span
              key={t}
              title="Controlled by the Sprint-Unplanned checkbox above"
              className="inline-flex h-6 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs font-medium text-amber-900 select-none dark:border-amber-400/35 dark:bg-amber-400/15 dark:text-amber-200"
            >
              <Zap className="size-3 fill-current" />
              {t}
            </span>
          ) : (
            <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-muted pr-1 pl-2 text-xs">
              <span>{t}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeTag(t)}
                aria-label={`Remove tag ${t}`}
                title={`Remove ${t}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
              >
                <X className="size-3" />
              </button>
            </span>
          ),
        )}
        {missingCycle && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => addTags(CURRENT_CYCLE_TAG)}
            title={`Add cycle tag ${CURRENT_CYCLE_TAG}`}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-amber-400/80 bg-amber-50/70 px-2 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20"
          >
            <Plus className="size-3" />
            {CURRENT_CYCLE_TAG}
          </button>
        )}
        {quickPlatforms.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => addTags(p)}
            title={`Add platform tag ${p}`}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-md border border-dashed px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40',
              missingPlatform
                ? 'border-amber-400/80 bg-amber-50/70 font-medium text-amber-900 hover:bg-amber-100/80 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20'
                : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Plus className="size-3" />
            {p}
          </button>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const v = draft.trim();
            if (!v || disabled) return;
            setDraft('');
            await addTags(v);
          }}
          className="inline-flex items-center"
        >
          <input
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                if (draft) setDraft('');
                else e.currentTarget.blur();
              }
            }}
            placeholder="+ Add tag…"
            aria-label="Add custom tag"
            className="h-6 w-28 rounded-md border border-input bg-transparent px-2 text-xs transition-[width,border-color] placeholder:text-muted-foreground focus:w-36 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          />
        </form>
      </dd>
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

function NewComment({ id, onAdd, onEditingChange }) {
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const scope = useAction('comment', id, () => {
    setActive(true);
    requestAnimationFrame(() => scope.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });
  useEffect(() => onEditingChange(active), [active, onEditingChange]);

  return <div ref={scope}>{active ? (
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
  ) : (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="flex w-full items-center rounded-md border border-input bg-transparent px-3 py-2 text-left text-[13px] text-muted-foreground hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Add a comment…
        <kbd className="ml-auto rounded border bg-muted px-1.5 font-sans text-[11px]">M</kbd>
      </button>
  )}</div>;
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
  const [detail, setDetailState] = useState(() => seedDetail(id, data, features));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const editors = useRef(new Set());
  const [, force] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const item = data?.items.find((i) => i.id === id);
  const who = (p) => (p?.id && p.id === data?.me?.id ? 'you' : p?.name);

  const setDetail = useCallback((updater) => {
    setDetailState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next?.id && !next.partial) detailCache.set(next.id, next);
      return next;
    });
  }, []);

  const load = useCallback(
    async ({ force: forceReload = false } = {}) => {
      if (!id) return;
      const hasCached = !forceReload && detailCache.has(id);
      if (hasCached) setDetailState(detailCache.get(id));
      setLoading(true);
      setError(null);
      try {
        const fresh = await fetchDetail(id, { force: forceReload || hasCached });
        setDetailState((cur) => (cur?.id && cur.id !== id ? cur : editors.current.size && !cur?.partial ? cur : fresh));
      } catch (e) {
        if (!hasCached) setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    setDetailState(seedDetail(id, data, features));
    setConfirming(false);
    editors.current = new Set();
    load();
    if (id && data?.items) {
      const known = new Set(data.items.map((i) => i.id));
      const ids = [...new Set([...document.querySelectorAll('[data-item-id]')].map((el) => Number(el.dataset.itemId)))].filter((n) => known.has(n));
      const at = ids.indexOf(id);
      if (at !== -1) {
        if (ids[at + 1]) prefetchDetail(ids[at + 1]);
        if (ids[at - 1]) prefetchDetail(ids[at - 1]);
      }
    }
  }, [id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep state/sprint/tags in sync with board edits.
  useEffect(() => {
    if (
      item &&
      detail &&
      item.id === detail.id &&
      (item.state !== detail.state ||
        item.iterationPath !== detail.iterationPath ||
        JSON.stringify(item.tags || []) !== JSON.stringify(detail.tags || []))
    ) {
      setDetail((d) => ({ ...d, state: item.state, iterationPath: item.iterationPath, tags: item.tags || d.tags }));
    }
  }, [item, detail, setDetail]);

  // Re-read the hierarchy after the parent is changed from the Feature picker.
  const parentId = item?.parentId;
  const lastParent = useRef(parentId);
  useEffect(() => {
    if (lastParent.current !== parentId && detail?.id === id) {
      fetchDetail(id, { force: true }).then(
        (fresh) => setDetail((d) => (d?.id === id ? { ...d, ancestors: fresh.ancestors, parent: fresh.parent, rev: fresh.rev } : d)),
        () => {},
      );
    }
    lastParent.current = parentId;
  }, [parentId, id, detail?.id, setDetail]);

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

  const body = useAction('edit', id, () => body.current?.querySelector('[data-detail-edit]')?.click());

  // A shortcut pressed on a card that needs this panel (e.g. P on a hovered card) runs once the ticket loads.
  const loadedId = detail?.partial ? null : detail?.id;
  useEffect(() => {
    if (!loadedId || loadedId !== id) return;
    const action = takeQueued(id);
    if (!action) return;
    const t = setTimeout(() => {
      const sheet = document.querySelector('[data-slot="sheet-content"]');
      if (!runAction(action, id, sheet)) {
        const a = TICKET_ACTIONS.find((x) => x.id === action);
        toast.message(`${a?.label || 'That action'} isn't available for #${id}`);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [loadedId, id]);

  function requestClose() {
    if (editors.current.size) return setConfirming(true);
    onClose();
  }

  // J / K step to the next / previous card on the page; other keys go through the shared shortcuts in App.
  useEffect(() => {
    if (!id) return;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || isTyping(e) || overlayOpen()) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || k === 'k') {
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

  const [savingTags, setSavingTags] = useState(false);

  async function saveTags(nextTags, toastMessage) {
    const previousTags = detail.tags || [];
    setSavingTags(true);
    setDetail((d) => ({ ...d, tags: nextTags }));
    onItemPatched(detail.id, { tags: nextTags, weeksCarried: nextTags.filter((t) => /^\d{8}$/.test(t)).length });
    try {
      const r = await saveFields({ tags: nextTags }, (fresh) => JSON.stringify(fresh.tags || []) === JSON.stringify(previousTags));
      const saved = r.tags || nextTags;
      setDetail((d) => ({ ...d, tags: saved, rev: r.rev }));
      onItemPatched(detail.id, { tags: saved, weeksCarried: saved.filter((t) => /^\d{8}$/.test(t)).length });
      toast.success(toastMessage || `#${detail.id} tags updated`);
      return true;
    } catch (e) {
      setDetail((d) => ({ ...d, tags: previousTags }));
      onItemPatched(detail.id, { tags: previousTags, weeksCarried: previousTags.filter((t) => /^\d{8}$/.test(t)).length });
      toast.error(`#${detail.id}: tags not saved`, { description: e.message });
      return false;
    } finally {
      setSavingTags(false);
    }
  }

  async function toggleUnplanned(checked) {
    const current = (detail.tags || []).filter((t) => !isSprintUnplannedTag(t));
    const next = checked ? [...current, SPRINT_UNPLANNED_TAG] : current;
    await saveTags(next, checked ? `#${detail.id} marked ${SPRINT_UNPLANNED_TAG}` : `#${detail.id} unmarked ${SPRINT_UNPLANNED_TAG}`);
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

  /** Returns null on success, or the error message to show next to the input. */
  async function linkPullRequest(ref) {
    try {
      const r = await api.linkPullRequest(detail.id, ref);
      setDetail((d) => ({ ...d, rev: r.rev, pullRequests: [r.pullRequest, ...d.pullRequests.filter((p) => p.artifact !== r.pullRequest.artifact)] }));
      toast.success(`PR ${r.pullRequest.id} linked to #${detail.id}`);
      return null;
    } catch (e) {
      return e.message;
    }
  }

  async function unlinkPullRequest(pr) {
    try {
      const r = await api.unlinkPullRequest(detail.id, pr.artifact);
      setDetail((d) => ({ ...d, rev: r.rev, pullRequests: d.pullRequests.filter((p) => p.artifact !== pr.artifact) }));
      const undo = async () => {
        const err = await linkPullRequest(pr.url);
        if (err) toast.error(`#${detail.id}: PR not relinked`, { description: err });
      };
      toast.success(`PR ${pr.id} unlinked from #${detail.id}`, pr.url ? { action: { label: 'Undo', onClick: undo } } : undefined);
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
  const unplanned = isSprintUnplanned(detail);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent
        ref={body}
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
                  title="Open in Azure DevOps (O)"
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
                  onClick={() => load({ force: true })}
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
              <div className="flex flex-wrap items-center gap-2">
                {item && (
                  <SprintSelect
                    item={item}
                    data={data}
                    onChange={(p) => onUpdate(item, p)}
                    disabled={pending}
                    className="-ml-2 border-0 bg-transparent px-2 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground dark:bg-transparent dark:hover:bg-accent"
                  />
                )}
                <label
                  className={cn(
                    'inline-flex h-7 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors select-none',
                    unplanned
                      ? 'border-amber-300 bg-amber-50/95 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-200'
                      : 'border-border/80 bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
                    (pending || savingTags) && 'pointer-events-none opacity-60',
                  )}
                  title="Mark if brought into an active sprint after original sprint planning (adds Sprint-Unplanned tag)"
                >
                  <Checkbox
                    checked={unplanned}
                    disabled={pending || savingTags}
                    onCheckedChange={(checked) => toggleUnplanned(!!checked)}
                  />
                  <Zap className={cn('size-3', unplanned ? 'fill-current text-amber-600 dark:text-amber-300' : 'text-muted-foreground')} />
                  <span>Sprint-Unplanned</span>
                </label>
              </div>
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
                    <TagsEditor detail={detail} disabled={pending || savingTags} onSaveTags={(next) => saveTags(next)} />
                  </dl>
                </section>

                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Could not load #{detail.id}: {error}{' '}
                    <button type="button" className="underline underline-offset-2" onClick={() => load({ force: true })}>
                      Try again
                    </button>
                  </div>
                )}

                {detail.partial ? (
                  <>
                    <section aria-label="Pull requests">
                      <SectionHeader>
                        <span className="inline-flex items-center gap-1.5">
                          <GitPullRequest className="size-3.5" /> Pull requests
                        </span>
                      </SectionHeader>
                      <Skeleton className="h-8 w-full" />
                    </section>
                    <section>
                      <SectionHeader>Description</SectionHeader>
                      <Skeleton className="h-28 w-full" />
                    </section>
                    <section>
                      <SectionHeader>
                        <span className="inline-flex items-center gap-1.5">
                          <MessageSquare className="size-3.5" /> Comments
                        </span>
                      </SectionHeader>
                      <Skeleton className="h-14 w-full" />
                    </section>
                  </>
                ) : (
                  <>
                    <PullRequests
                      key={`prs-${detail.id}`}
                      id={detail.id}
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
                      <NewComment key={`new-${detail.id}`} id={detail.id} onAdd={addComment} onEditingChange={tracker('new-comment')} />
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
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
