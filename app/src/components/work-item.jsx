import { Check, ChevronsUpDown, ExternalLink, TriangleAlert, Zap } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { canBeInSprint, columnRank, isDone, isSprintUnplanned, stateTone, typeShort, typeStyle } from '@/lib/planning';
import { openOnClick, useDetail } from '@/lib/detail';
import { useShortcutOpen } from '@/lib/shortcuts';

export function StatePill({ state, className }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset', stateTone(state), className)}>
      {state}
    </span>
  );
}

export function StateSelect({ item, states, onChange, disabled }) {
  const { ref, ...openProps } = useShortcutOpen('state', item.id);
  return (
    <Select {...openProps} value={item.state} onValueChange={(state) => state !== item.state && onChange({ state })} disabled={disabled}>
      <SelectTrigger
        ref={ref}
        title="Change state (S)"
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
  const { ref, ...openProps } = useShortcutOpen('sprint', item.id);
  return (
    <Select {...openProps} value={item.iterationPath} onValueChange={(p) => p !== item.iterationPath && onChange({ iterationPath: p })} disabled={disabled}>
      <SelectTrigger ref={ref} title="Change sprint (Shift C)" size="sm" aria-label={`Sprint of ${item.id}`} className={cn('h-7! max-w-48 text-xs', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={data.backlogPath}>Backlog</SelectItem>
        <SelectGroup>
          <SelectLabel>{canBeInSprint(item.type) ? 'Sprints' : 'Sprints (Tasks and Bugs only)'}</SelectLabel>
          {data.sprints.map((s) => (
            <SelectItem key={s.path} value={s.path} disabled={!canBeInSprint(item.type) && s.path !== item.iterationPath}>
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

export function FeaturePicker({ item, features, onPick, disabled, compact, label, className }) {
  const { open, onOpenChange: setOpen, ref } = useShortcutOpen('feature', item.id);
  const current = features.find((f) => f.id === item.featureId);
  const board = features
    .filter((f) => f.onBoard && !isDone(f))
    .sort((a, b) => columnRank(a.column) - columnRank(b.column) || a.title.localeCompare(b.title));
  const byColumn = board.reduce((m, f) => m.set(f.column || 'Unknown', [...(m.get(f.column || 'Unknown') || []), f]), new Map());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          ref={ref}
          title="Change Feature (F)"
          type="button"
          aria-label={`Parent feature of ${item.id}`}
          className={cn(
            'group/fp inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            !current || !item.onBoard ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
            compact ? 'h-5' : 'h-7 px-2',
            className,
          )}
        >
          {!current || !item.onBoard ? <TriangleAlert className="size-3 shrink-0" /> : null}
          <span className="truncate">{current ? (item.onBoard && label) || current.title : 'No board Feature'}</span>
          <ChevronsUpDown className={cn('size-3 shrink-0', compact ? 'opacity-0 group-hover/fp:opacity-60' : 'opacity-50')} />
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
      draggable={false}
      className={cn('inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums hover:text-primary hover:underline', className)}
    >
      {item.id}
      <ExternalLink className="size-2.5" />
    </a>
  );
}

export function TypeLabel({ type }) {
  const s = typeStyle(type);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold', s.text)}>
      <span aria-hidden className={cn('size-2 rounded-full', s.dot)} />
      {typeShort(type)}
    </span>
  );
}

export function WorkItemCard({ item, data, features, pending, reasons, onUpdate, onDragStart, grabbable, className, ...rest }) {
  const { openItem } = useDetail();
  const grab = !pending && (onDragStart || grabbable);
  const unplanned = isSprintUnplanned(item);
  return (
    <article
      {...rest}
      data-item-id={item.id}
      draggable={!pending && !!onDragStart}
      onClick={openOnClick(openItem, item.id)}
      onDragStart={(e) => {
        if (!onDragStart) return;
        e.dataTransfer.setData('text/plain', String(item.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(item.id);
      }}
      className={cn(
        'group rounded-lg border bg-card px-3 py-2.5 shadow-[0_1px_2px_oklch(0.4_0.02_60/0.06),0_2px_6px_-2px_oklch(0.4_0.02_60/0.08)] transition-[opacity,border-color,box-shadow,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:border-foreground/15 motion-reduce:hover:translate-y-0 hover:shadow-[0_2px_4px_oklch(0.4_0.02_60/0.06),0_6px_14px_-4px_oklch(0.4_0.02_60/0.12)] dark:shadow-[0_1px_2px_oklch(0_0_0/0.3)] dark:hover:shadow-[0_4px_12px_-2px_oklch(0_0_0/0.45)]',
        unplanned &&
          'border-amber-300/90 bg-gradient-to-br from-amber-50/90 via-card to-orange-50/60 ring-1 ring-amber-300/55 shadow-[0_2px_6px_oklch(0.68_0.15_65/0.14),0_10px_22px_-6px_oklch(0.68_0.15_65/0.2)] hover:border-amber-400 dark:border-amber-400/40 dark:from-amber-400/12 dark:via-card dark:to-orange-400/8 dark:ring-amber-400/25 dark:shadow-[0_4px_14px_-2px_oklch(0_0_0/0.55),0_10px_24px_-4px_oklch(0.75_0.15_65/0.18)]',
        isDone(item) && 'opacity-55',
        pending && 'animate-pulse',
        grab && 'cursor-grab active:cursor-grabbing',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <TypeLabel type={item.type} />
        <ItemLink item={item} />
        {unplanned && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-1.5 py-px text-[10px] font-semibold text-amber-900 ring-1 ring-amber-300/80 ring-inset dark:bg-amber-400/20 dark:text-amber-200 dark:ring-amber-400/35">
                <Zap className="size-2.5 fill-current" />
                Unplanned
              </span>
            </TooltipTrigger>
            <TooltipContent>Brought into the sprint unplanned (Sprint-Unplanned)</TooltipContent>
          </Tooltip>
        )}
        {item.weeksCarried >= 4 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border ring-inset tabular-nums">{item.weeksCarried}w</span>
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
            .filter((r) => !['no-feature', 'off-board', 'carried'].includes(r.key))
            .map((r) => (
              <span key={r.key} className="rounded-full bg-amber-50 px-2 text-[10px] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-300/10 dark:text-amber-200 dark:ring-amber-300/25 ring-inset">
                {r.label}
              </span>
            ))}
        </div>
      )}
    </article>
  );
}
