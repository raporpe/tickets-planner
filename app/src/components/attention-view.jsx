import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemRow } from '@/components/features-view';
import { ItemLink, TypeLabel } from '@/components/work-item';
import { CURRENT_CYCLE_TAG, featuresInSprint, isDone, PLATFORM_TAGS } from '@/lib/planning';

const GROUPS = [
  { keys: ['not-sprintable'], title: 'Stories in a sprint', hint: 'Stories belong in SAN SA\\Sprint, not in a sprint. Move them back to the Backlog.' },
  { keys: ['no-feature', 'off-board'], title: 'Not under a board Feature', hint: 'Pick a board Feature so the work shows on aka.ms/sa-kanban.' },
  { keys: ['missing-cycle', 'missing-platform'], title: 'Missing compliance tags', hint: 'Every ticket needs the current cycle tag (FY26 C5) and a platform tag (iOS, Android, Backend, MiniApps).' },
  { keys: ['legacy-iteration', 'past-sprint'], title: 'Outside the sprint structure', hint: 'Move to the backlog or a sprint under SAN SA\\Sprint.' },
  { keys: ['story-done'], title: 'Stories whose children are all closed', hint: 'Close the Story if the work is done.' },
  { keys: ['idle'], title: 'Gone quiet', hint: 'No change in Azure DevOps for a week or more. Update the state, add a comment, or move it out of the sprint.' },
  { keys: ['carried'], title: 'Carried for a long time', hint: 'For context only: four or more weekly tags. Not counted as needing attention.', info: true },
];

const HYGIENE_CHECKS = [
  {
    title: 'Parented under a board Feature',
    detail: 'Every open Task, Bug, and Story rolls up to a Feature on aka.ms/sa-kanban (SAN SA · SAN SA\\Sprint).',
  },
  {
    title: `Tagged with ${CURRENT_CYCLE_TAG} & platform`,
    detail: `Every open ticket has the current cycle tag and a platform tag (${PLATFORM_TAGS.join(', ')}).`,
  },
  {
    title: 'Sprint discipline respected',
    detail: 'Only Tasks and Bugs are scheduled into sprints; Stories and Features stay in SAN SA\\Sprint.',
  },
  {
    title: 'No tickets stranded in past or legacy iterations',
    detail: 'All open work sits in the current sprint, an upcoming sprint, or the SAN SA\\Sprint backlog.',
  },
  {
    title: 'Stories match child completion',
    detail: 'No open User Stories have all of their child Tasks already closed.',
  },
  {
    title: 'Active sprint work is fresh',
    detail: 'No started or current-sprint Tasks/Bugs have gone 7+ days without an update in Azure DevOps.',
  },
];

function HygieneAllClear({ openCount }) {
  return (
    <section aria-label="All hygiene checks passing" className="mx-auto flex w-full max-w-2xl flex-col items-center pt-6 pb-2">
      <div className="relative flex size-14 items-center justify-center">
        <span
          aria-hidden
          className="animate-hygiene-ring pointer-events-none absolute inset-0 rounded-full border-2 border-emerald-500/40 motion-reduce:hidden dark:border-emerald-400/35"
        />
        <div className="animate-hygiene-badge flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 motion-reduce:animate-none dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/30">
          <svg viewBox="0 0 24 24" fill="none" className="size-7" aria-hidden="true">
            <path
              d="M5 13l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-hygiene-stroke motion-reduce:animate-none"
            />
          </svg>
        </div>
      </div>
      <h2 className="mt-3.5 text-base font-semibold tracking-tight text-foreground">All hygiene checks passing</h2>
      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
        {openCount} open {openCount === 1 ? 'ticket meets' : 'tickets meet'} every team board and tagging rule.
      </p>
      <ul className="mt-5 w-full divide-y divide-border/60 rounded-xl border bg-card px-4 py-1">
        {HYGIENE_CHECKS.map((check) => (
          <li key={check.title} className="flex items-start gap-3 py-2.5 text-left">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300">
              <Check className="size-3 stroke-[2.5]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground">{check.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CollapsibleInfoSection({ section, data, features, pendingIds, reasonsById, onUpdate }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-90')} />
        <h3 className="text-xs font-semibold text-muted-foreground">{section.title}</h3>
        <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums">
          {section.items.length}
        </span>
        <span className="ml-1 truncate text-xs text-muted-foreground">{section.hint}</span>
      </button>
      {open && (
        <div className="border-t bg-card">
          {section.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              data={data}
              features={features}
              pending={pendingIds.has(item.id)}
              onUpdate={onUpdate}
              extra={
                <span className="text-muted-foreground">
                  {(reasonsById.get(item.id) || [])
                    .filter((r) => section.keys.includes(r.key))
                    .map((r) => r.label)
                    .join(', ')}
                </span>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function AttentionView({ data, items, features, pendingIds, reasonsById, onUpdate }) {
  const sprintFeatures = featuresInSprint(items, features, data);
  const sections = GROUPS.map((g) => ({
    ...g,
    items: items.filter((i) => (reasonsById.get(i.id) || []).some((r) => g.keys.includes(r.key))),
  })).filter((g) => g.items.length);

  const actionableSections = sections.filter((s) => !s.info);
  const infoSections = sections.filter((s) => s.info);
  const clean = !actionableSections.length && !sprintFeatures.length;
  const openCount = items.filter((i) => !isDone(i)).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8">
      {clean && <HygieneAllClear openCount={openCount} />}
      {sprintFeatures.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">Features in a sprint</h3>
            <span className="text-xs text-muted-foreground tabular-nums">{sprintFeatures.length}</span>
            <p className="ml-2 text-xs text-muted-foreground">Features belong in SAN SA\Sprint. Change the iteration in Azure DevOps.</p>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            {sprintFeatures.map((f) => (
              <div key={f.id} data-item-id={f.id} className="grid grid-cols-[4.5rem_5rem_minmax(0,1fr)_minmax(0,16rem)] items-center gap-3 border-b px-3 py-1.5 last:border-b-0">
                <TypeLabel type="Feature" />
                <ItemLink item={f} />
                <span className="truncate text-[13px]">{f.title}</span>
                <span className="truncate text-xs text-amber-800 dark:text-amber-200">{f.iterationPath}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {actionableSections.map((s) => (
        <section key={s.title}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">{s.title}</h3>
            <span className="text-xs text-muted-foreground tabular-nums">{s.items.length}</span>
            <p className="ml-2 text-xs text-muted-foreground">{s.hint}</p>
          </div>
          <div className={cn('overflow-hidden rounded-lg border bg-card')}>
            {s.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                data={data}
                features={features}
                pending={pendingIds.has(item.id)}
                onUpdate={onUpdate}
                extra={
                  <span className="text-amber-800 dark:text-amber-200">
                    {(reasonsById.get(item.id) || []).filter((r) => s.keys.includes(r.key)).map((r) => r.label).join(', ')}
                  </span>
                }
              />
            ))}
          </div>
        </section>
      ))}
      {infoSections.map((s) => (
        <CollapsibleInfoSection
          key={s.title}
          section={s}
          data={data}
          features={features}
          pendingIds={pendingIds}
          reasonsById={reasonsById}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
