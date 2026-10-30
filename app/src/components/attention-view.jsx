import { CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemRow } from '@/components/features-view';

const GROUPS = [
  { keys: ['no-feature', 'off-board'], title: 'Not under a board Feature', hint: 'Pick a board Feature so the work shows on aka.ms/sa-kanban.' },
  { keys: ['legacy-iteration', 'past-sprint'], title: 'Outside the sprint structure', hint: 'Move to the backlog or a sprint under SAN SA\\Sprint.' },
  { keys: ['active-backlog'], title: 'Active but not in a sprint', hint: 'Plan it into a sprint, or set it back to New.' },
  { keys: ['story-done'], title: 'Stories whose children are all closed', hint: 'Close the Story if the work is done.' },
  { keys: ['stale'], title: 'Carried for a long time', hint: 'Four or more weekly tags. Close, split, or recommit.' },
];

export function AttentionView({ data, items, features, pendingIds, reasonsById, onUpdate }) {
  const sections = GROUPS.map((g) => ({
    ...g,
    items: items.filter((i) => (reasonsById.get(i.id) || []).some((r) => g.keys.includes(r.key))),
  })).filter((g) => g.items.length);

  if (!sections.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground">
        <CircleCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
        <p className="text-sm">Everything is parented, planned, and tidy.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8">
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
                  <span className="text-amber-800 dark:text-amber-200">
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
