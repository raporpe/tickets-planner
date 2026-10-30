import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, MessageSquare, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { FeaturePicker, SprintSelect, StatePill, StateSelect, TypeLabel } from '@/components/work-item';
import { RichEditor, RichView } from '@/components/rich-text';
import { HierarchyTree } from '@/components/hierarchy';
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

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
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
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px]">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function Hierarchy({ detail, onOpen }) {
  return (
    <section aria-label="Hierarchy">
      <SectionHeader>Hierarchy</SectionHeader>
      {detail.ancestors.length === 0 && <p className="mb-1.5 text-[13px] text-amber-300">No parent. This item isn't linked to any Feature.</p>}
      <HierarchyTree ancestors={detail.ancestors} self={detail} children={detail.children} onOpen={onOpen} />
    </section>
  );
}

function SectionHeader({ children, action }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
      <div className="ml-auto">{action}</div>
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
          className="group/title -mx-1.5 w-full rounded px-1.5 py-0.5 text-left text-[17px] leading-snug font-semibold hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {title}
          <Pencil className="ml-1.5 inline size-3.5 align-baseline text-muted-foreground opacity-0 group-hover/title:opacity-100" />
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
        className="min-h-0 resize-none text-[17px]! leading-snug font-semibold"
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
            <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
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
        <div
          className="-mx-2 cursor-text rounded-md px-2 py-1 hover:bg-accent/30"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
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
          <time className="text-[11px] text-muted-foreground" dateTime={comment.createdDate} title={fullDate(comment.createdDate)}>
            {ago(comment.createdDate)}
          </time>
          {edited && (
            <span className="text-[11px] text-muted-foreground" title={fullDate(comment.modifiedDate)}>
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
        className="w-full rounded-md border border-dashed px-3 py-2 text-left text-[13px] text-muted-foreground hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
  const item = data?.items.find((i) => i.id === id);

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
    if (editors.current.size && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }

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
        onEscapeKeyDown={(e) => editors.current.size && e.preventDefault()}
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
            <header className="flex flex-col gap-2 border-b px-5 pt-4 pb-3">
              <div className="flex items-center gap-2 pr-8">
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto size-7"
                  onClick={load}
                  disabled={loading}
                  aria-label="Reload from Azure DevOps"
                >
                  <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                </Button>
              </div>
              <TitleEditor title={detail.title} onSave={saveTitle} onEditingChange={tracker('title')} />
              <SheetDescription className="sr-only">
                {detail.type} {detail.id} details
              </SheetDescription>
              {item && (
                <div className="-ml-1 flex flex-wrap items-center gap-2">
                  <FeaturePicker item={item} features={features} onPick={(parentId) => onUpdate(item, { parentId })} disabled={pending} />
                  <SprintSelect item={item} data={data} onChange={(p) => onUpdate(item, p)} disabled={pending} />
                </div>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-6 px-5 py-4">
                <Hierarchy detail={detail} onOpen={openItem} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Meta label="Assigned to">{detail.assignedTo?.name}</Meta>
                  <Meta label="Area">{detail.areaPath?.replace(/^SAN SA\\?/, '') || 'SAN SA'}</Meta>
                  <Meta label="Created">
                    <span title={fullDate(detail.createdDate)}>
                      {ago(detail.createdDate)} · {detail.createdBy?.name}
                    </span>
                  </Meta>
                  <Meta label="Last changed">
                    <span title={fullDate(detail.changedDate)}>
                      {ago(detail.changedDate)} · {detail.changedBy?.name}
                    </span>
                  </Meta>
                  <Meta label="Priority">{detail.priority}</Meta>
                  {detail.tags.length > 0 && (
                    <div className="col-span-full">
                      <dt className="text-[11px] text-muted-foreground">Tags</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {detail.tags.map((t) => (
                          <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                            {t}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>

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
                  {detail.comments.length > 0 ? (
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
                  ) : (
                    <p className="mt-3 text-[13px] text-muted-foreground">No comments yet.</p>
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
