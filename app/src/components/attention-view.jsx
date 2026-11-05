import { CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemRow } from '@/components/features-view';
import { ItemLink, TypeLabel } from '@/components/work-item';
import { featuresInSprint } from '@/lib/planning';

const GROUPS = [
  { keys: ['not-sprintable'], title: 'Stories in a sprint', hint: 'Stories belong in SAN SA\\Sprint, not in a sprint. Move them back to the Backlog.' },
  { keys: ['no-feature', 'off-board'], title: 'Not under a board Feature', hint: 'Pick a board Feature so the work shows on aka.ms/sa-kanban.' },
  { keys: ['missing-cycle', 'missing-platform'], title: 'Missing compliance tags', hint: 'Every ticket needs the current cycle tag (FY26 C5) and a platform tag (iOS, Android, Backend, MiniApps).' },
  { keys: ['legacy-iteration', 'past-sprint'], title: 'Outside the sprint structure', hint: 'Move to the backlog or a sprint under SAN SA\\Sprint.' },
  { keys: ['story-done'], title: 'Stories whose children are all closed', hint: 'Close the Story if the work is done.' },
  { keys: ['idle'], title: 'Gone quiet', hint: 'No change in Azure DevOps for a week or more. Update the state, add a comment, or move it out of the sprint.' },
  { keys: ['carried'], title: 'Carried for a long time', hint: 'For context only: four or more weekly tags. Not counted as needing attention.', info: true },
];

export function AttentionView({ data, items, features, pendingIds, reasonsById, onUpdate }) {
  const sprintFeatures = featuresInSprint(items, features, data);
  const sections = GROUPS.map((g) => ({
    ...g,
    items: items.filter((i) => (reasonsById.get(i.id) || []).some((r) => g.keys.includes(r.key))),
  })).filter((g) => g.items.length);

  const clean = !sections.some((s) => !s.info) && !sprintFeatures.length;
  if (clean && !sections.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground">
        <CircleCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
        <p className="text-sm">Everything is parented, planned, and tidy.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8">
      {clean && (
        <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-300" />
          Nothing needs action. Everything is parented, planned, and tidy.
        </div>
      )}
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
      {sections.map((s) => (
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
                  <span className={s.info ? 'text-muted-foreground' : 'text-amber-800 dark:text-amber-200'}>
                    {(reasonsById.get(item.id) || []).filter((r) => s.keys.includes(r.key)).map((r) => r.label).join(', ')}
                  </span>
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
