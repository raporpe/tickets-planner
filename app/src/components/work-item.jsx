import { useState } from 'react';
import { Check, ChevronsUpDown, ExternalLink, TriangleAlert } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { columnRank, isDone, stateTone, typeShort, typeTone } from '@/lib/planning';
import { openOnClick, useDetail } from '@/lib/detail';

export function StatePill({ state, className }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium ring-1 ring-inset', stateTone(state), className)}>
      {state}
    </span>
  );
}

export function StateSelect({ item, states, onChange, disabled }) {
  return (
    <Select value={item.state} onValueChange={(state) => state !== item.state && onChange({ state })} disabled={disabled}>
      <SelectTrigger
        size="sm"
        aria-label={`State of ${item.id}`}
        className="h-6! gap-1 border-0 bg-transparent p-0 pr-1 shadow-none hover:bg-accent focus-visible:ring-2 [&>svg]:size-3"
      >
        <SelectValue>
          <StatePill state={item.state} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper">
        {(states || [item.state]).map((s) => (
          <SelectItem key={s} value={s}>
            <StatePill state={s} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SprintSelect({ item, data, onChange, disabled, className }) {
  const known = item.iterationPath === data.backlogPath || data.sprints.some((s) => s.path === item.iterationPath);
  return (
    <Select value={item.iterationPath} onValueChange={(p) => p !== item.iterationPath && onChange({ iterationPath: p })} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={`Sprint of ${item.id}`} className={cn('h-7! max-w-48 text-xs', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={data.backlogPath}>Backlog</SelectItem>
        <SelectGroup>
          <SelectLabel>Sprints</SelectLabel>
          {data.sprints.map((s) => (
            <SelectItem key={s.path} value={s.path}>
              {s.name} <span className="text-muted-foreground">· {s.timeFrame}</span>
            </SelectItem>
          ))}
        </SelectGroup>
        {!known && (
          <>
            <SelectSeparator />
            <SelectItem value={item.iterationPath} disabled>
              {item.iterationPath.replace(/^SAN SA\\/, '')}
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}

export function FeaturePicker({ item, features, onPick, disabled, compact }) {
  const [open, setOpen] = useState(false);
  const current = features.find((f) => f.id === item.featureId);
  const board = features
    .filter((f) => f.onBoard && !isDone(f))
    .sort((a, b) => columnRank(a.column) - columnRank(b.column) || a.title.localeCompare(b.title));
  const byColumn = board.reduce((m, f) => m.set(f.column || 'Unknown', [...(m.get(f.column || 'Unknown') || []), f]), new Map());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={`Parent feature of ${item.id}`}
          className={cn(
            'group/fp inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            !current || !item.onBoard ? 'text-amber-300' : 'text-muted-foreground',
            compact ? 'h-5' : 'h-7',
          )}
        >
          {!current || !item.onBoard ? <TriangleAlert className="size-3 shrink-0" /> : null}
          <span className="truncate">{current ? current.title : 'No board Feature'}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-0 group-hover/fp:opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[30rem] p-0" align="start">
        <Command>
          <CommandInput placeholder="Move under board Feature…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No board Feature matches.</CommandEmpty>
            {[...byColumn.entries()].map(([col, list]) => (
              <CommandGroup key={col} heading={col}>
                {list.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`${f.id} ${f.title}`}
                    onSelect={() => {
                      setOpen(false);
                      if (f.id !== item.featureId) onPick(f.id);
                    }}
                  >
                    <Check className={cn('size-3.5', f.id === item.featureId ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <span className="pl-2 text-[11px] text-muted-foreground tabular-nums">{f.id}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ItemLink({ item, className }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={cn('inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums hover:text-primary hover:underline', className)}
    >
      {item.id}
      <ExternalLink className="size-2.5" />
    </a>
  );
}

export function TypeLabel({ type }) {
  return <span className={cn('text-[11px] font-semibold uppercase tracking-wide', typeTone(type))}>{typeShort(type)}</span>;
}

export function WorkItemCard({ item, data, features, pending, reasons, onUpdate, onDragStart, ...rest }) {
  const { openItem } = useDetail();
  return (
    <article
      {...rest}
      draggable={!pending}
      onClick={openOnClick(openItem, item.id)}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(item.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(item.id);
      }}
      className={cn(
        'group rounded-md border bg-card px-2.5 py-2 shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-[opacity,border-color] hover:border-foreground/20',
        isDone(item) && 'opacity-55',
        pending && 'animate-pulse',
        !pending && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-center gap-2">
        <TypeLabel type={item.type} />
        <ItemLink item={item} />
        {item.weeksCarried >= 4 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="rounded bg-orange-500/15 px-1 text-[10px] font-medium text-orange-300 tabular-nums">{item.weeksCarried}w</span>
            </TooltipTrigger>
            <TooltipContent>Carried across {item.weeksCarried} weekly tags</TooltipContent>
          </Tooltip>
        )}
        <div className="ml-auto">
          <StateSelect item={item} states={data.states[item.type]} onChange={(p) => onUpdate(item, p)} disabled={pending} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => openItem(item.id)}
        className="mt-1 line-clamp-2 block w-full text-left text-[13px] leading-snug text-foreground hover:underline hover:decoration-muted-foreground hover:underline-offset-2 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {item.title}
      </button>
      <div className="mt-1 -ml-1">
        <FeaturePicker item={item} features={features} onPick={(parentId) => onUpdate(item, { parentId })} disabled={pending} compact />
      </div>
      {reasons?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {reasons
            .filter((r) => !['no-feature', 'off-board', 'stale'].includes(r.key))
            .map((r) => (
              <span key={r.key} className="rounded bg-amber-500/10 px-1.5 text-[10px] text-amber-300">
                {r.label}
              </span>
            ))}
        </div>
      )}
    </article>
  );
}
