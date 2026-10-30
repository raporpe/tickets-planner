import { useState } from 'react';
import { CalendarClock, Inbox, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { WorkItemCard } from '@/components/work-item';
import { HierarchyHover } from '@/components/hierarchy';
import { OTHER, buildColumns, columnKeyOf, isDone } from '@/lib/planning';

function ColumnHeader({ col, items }) {
  const open = items.filter((i) => !isDone(i)).length;
  const Icon = col.kind === 'backlog' ? Inbox : col.kind === 'other' ? History : CalendarClock;
  return (
    <header className="flex items-start gap-2 border-b px-3 py-2.5">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">{col.title}</h2>
          {col.sprint?.timeFrame === 'current' && <Badge className="h-4 px-1.5 text-[10px]">Current</Badge>}
          {col.sprint && !col.sprint.subscribed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="h-4 border-amber-400/40 px-1.5 text-[10px] text-amber-300">
                  Not on team
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Not selected in team settings, so it won't show on the team's sprint views. Ask the team admin to add it.</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{col.subtitle}</p>
      </div>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        {open}
        {items.length !== open && <span className="opacity-60"> / {items.length}</span>}
      </span>
    </header>
  );
}

export function PlanView({ data, items, features, pendingIds, reasonsById, onUpdate }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const columns = buildColumns(data);
  const byCol = new Map(columns.map((c) => [c.key, []]));
  items.forEach((i) => byCol.get(columnKeyOf(i, data))?.push(i));
  const visible = columns.filter((c) => c.kind !== 'other' || byCol.get(OTHER).length);
  const order = (a, b) => Number(isDone(a)) - Number(isDone(b)) || a.type.localeCompare(b.type) || b.id - a.id;

  return (
    <div className="flex h-full gap-3 overflow-x-auto px-4 pb-4">
      {visible.map((col) => {
        const list = byCol.get(col.key).sort(order);
        const droppable = col.kind !== 'other';
        return (
          <section
            key={col.key}
            aria-label={col.title}
            onDragOver={(e) => {
              if (!droppable || dragId == null) return;
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = Number(e.dataTransfer.getData('text/plain'));
              const item = items.find((i) => i.id === id);
              if (item && droppable && item.iterationPath !== col.path) onUpdate(item, { iterationPath: col.path });
              setDragId(null);
            }}
            className={cn(
              'flex h-full w-80 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors',
              col.sprint?.timeFrame === 'current' && 'border-primary/40',
              over === col.key && 'border-primary bg-primary/10',
            )}
          >
            <ColumnHeader col={col} items={list} />
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
              {list.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {col.kind === 'sprint' ? 'Nothing planned yet. Drag cards here.' : 'Empty.'}
                </p>
              )}
              {list.map((item) => (
                <HierarchyHover key={item.id} item={item}>
                <WorkItemCard
                  item={item}
                  data={data}
                  features={features}
                  pending={pendingIds.has(item.id)}
                  reasons={reasonsById.get(item.id)}
                  onUpdate={onUpdate}
                  onDragStart={setDragId}
                />
                </HierarchyHover>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
