import { useState } from 'react';
import { ChevronRight, Circle, CircleCheckBig, CircleDashed, CodeXml, ExternalLink, FlaskConical, Lightbulb, ListChecks, PackageCheck, PenTool, Plane, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FeaturePicker, ItemLink, PrioritySelect, ReasonBadges, SprintSelect, StatePill, StateSelect, TypeLabel } from '@/components/work-item';
import { columnRank, featureComplianceExplanation, isDone, isInSprint, requiresFeature } from '@/lib/planning';
import { openOnClick, useDetail } from '@/lib/detail';
import { HierarchyHover } from '@/components/hierarchy';

export function ItemRow({ item, data, features, pending, onUpdate, extra }) {
  const { openItem } = useDetail();
  const via = item.chain.filter((c) => c.type !== 'Feature');
  return (
    <HierarchyHover item={item}>
    <div
      data-item-id={item.id}
      onClick={openOnClick(openItem, item.id)}
      className={cn(
        'grid cursor-pointer grid-cols-[4.5rem_6.5rem_minmax(0,1fr)_minmax(0,16rem)_10rem_7.5rem] items-center gap-3 border-b px-3 py-1.5 last:border-b-0 hover:bg-accent/40',
        isDone(item) && 'opacity-55',
        pending && 'animate-pulse',
      )}
    >
      <TypeLabel type={item.type} />
      <div className="flex min-w-0 items-center gap-1.5">
        <ItemLink item={item} />
        <PrioritySelect id={item.id} priority={item.priority} onChange={(priority) => onUpdate(item, { priority })} disabled={pending} compact />
      </div>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => openItem(item.id)}
          className="block w-full truncate text-left text-[13px] hover:underline hover:decoration-muted-foreground hover:underline-offset-2 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {item.title}
        </button>
        {(via.length > 0 || extra) && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {via.length > 0 && <span className="truncate">via {via.map((c) => `${c.type} ${c.id}`).join(' › ')}</span>}
            {via.length > 0 && extra && <span aria-hidden>·</span>}
            {extra}
          </div>
        )}
      </div>
      <FeaturePicker item={item} features={features} onPick={(parentId) => onUpdate(item, { parentId })} disabled={pending} />
      <SprintSelect item={item} data={data} onChange={(p) => onUpdate(item, p)} disabled={pending} className="w-full" />
      <StateSelect item={item} states={data.states[item.type]} onChange={(p) => onUpdate(item, p)} disabled={pending} />
    </div>
    </HierarchyHover>
  );
}

const COLUMN_ICONS = {
  New: { icon: CircleDashed, tone: 'text-muted-foreground' },
  'Backlog of ideas': { icon: Lightbulb, tone: 'text-amber-600 dark:text-amber-300' },
  'Product & Design': { icon: PenTool, tone: 'text-pink-600 dark:text-pink-300' },
  'Ready for development': { icon: ListChecks, tone: 'text-sky-600 dark:text-sky-300' },
  'In Development': { icon: CodeXml, tone: 'text-blue-600 dark:text-blue-300' },
  'QA/Testing': { icon: FlaskConical, tone: 'text-violet-600 dark:text-violet-300' },
  'Ready to flight': { icon: PackageCheck, tone: 'text-teal-600 dark:text-teal-300' },
  Flighting: { icon: Plane, tone: 'text-cyan-600 dark:text-cyan-300' },
  'Shipped/Closed': { icon: CircleCheckBig, tone: 'text-emerald-600 dark:text-emerald-300' },
  Shipped: { icon: CircleCheckBig, tone: 'text-emerald-600 dark:text-emerald-300' },
};

function ColumnIcon({ column }) {
  const { icon: Icon, tone } = COLUMN_ICONS[column] || { icon: Circle, tone: 'text-muted-foreground' };
  return <Icon aria-hidden className={cn('size-3.5 shrink-0', tone)} />;
}

function ColumnSelect({ feature, columns, onMove, disabled }) {
  const value = feature.column || '';
  return (
    <Select
      value={value}
      disabled={disabled || !columns?.length}
      onValueChange={(column) => {
        if (column === value) return;
        const col = columns.find((c) => c.name === column);
        if (col?.type === 'outgoing' && !window.confirm(`Move "${feature.title}" to ${column}? This closes the Feature on the team board.`)) return;
        onMove(feature, column);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Board column of Feature ${feature.id}`}
        className="h-5! gap-1 rounded-full border-0 bg-secondary px-2 py-0 text-[11px] font-medium text-secondary-foreground shadow-none hover:bg-secondary/70 [&>svg:last-child]:size-3"
      >
        <SelectValue placeholder="On board">
          <span className="flex items-center gap-1.5">
            {value && <ColumnIcon column={value} />}
            {value || 'On board'}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {(columns || []).map((c) => (
          <SelectItem key={c.name} value={c.name}>
            <span className="flex w-full items-center gap-2">
              <ColumnIcon column={c.name} />
              {c.name}
              <span className="ml-auto text-[11px] text-muted-foreground">{c.state}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FeatureGroup({ feature, items, data, features, pendingIds, reasonsById, onUpdate, onMoveFeature }) {
  const [open, setOpen] = useState(true);
  const openCount = items.filter((i) => !isDone(i)).length;
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header data-item-id={feature?.id} className="flex items-center gap-2 bg-muted/50 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
        >
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
          <h3 className="truncate text-sm font-semibold">{feature ? feature.title : 'No parent Feature'}</h3>
        </button>
        {!feature && items.some((i) => !isDone(i) && requiresFeature(i.type)) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="h-5 cursor-help gap-1 border-amber-200 bg-amber-50 text-[11px] text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200">
                <TriangleAlert className="size-3 shrink-0" />
                Unparented
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs leading-relaxed">
              {featureComplianceExplanation(null, null)}
            </TooltipContent>
          </Tooltip>
        )}
        {feature && (
          <>
            {feature.onBoard ? (
              <ColumnSelect feature={feature} columns={data.featureColumns} onMove={onMoveFeature} disabled={pendingIds.has(feature.id)} />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="h-5 cursor-help gap-1 border-amber-200 bg-amber-50 text-[11px] text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200">
                    <TriangleAlert className="size-3 shrink-0" />
                    Off board ·{' '}
                    {feature.iterationPath?.startsWith(data.backlogPath) && feature.areaPath
                      ? feature.areaPath
                      : feature.iterationPath?.replace(/^SAN SA\\/, '') || feature.areaPath || 'outside SAN SA'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs leading-relaxed">
                  {featureComplianceExplanation({ featureId: feature.id }, feature)}
                </TooltipContent>
              </Tooltip>
            )}
            {feature.onBoard && isInSprint(feature.iterationPath, data) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="h-5 cursor-help gap-1 border-amber-200 bg-amber-50 text-[11px] text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200"
                  >
                    <TriangleAlert className="size-3 shrink-0" />
                    In sprint {feature.iterationPath.split('\\').pop()}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs leading-relaxed">
                  Feature #{feature.id} is scheduled inside sprint &ldquo;{feature.iterationPath}&rdquo; instead of {data.backlogPath || 'SAN SA\\Sprint'}. Features must stay in {data.backlogPath || 'SAN SA\\Sprint'} so they remain visible on aka.ms/sa-kanban; only Tasks and Bugs go into sprints.
                </TooltipContent>
              </Tooltip>
            )}
            {feature.lane && <span className="hidden text-[11px] text-muted-foreground lg:inline">{feature.lane}</span>}
            {feature.state && !feature.column?.includes(feature.state) && <StatePill state={feature.state} />}
            <a
              href={feature.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums hover:text-primary"
            >
              {feature.id}
              <ExternalLink className="size-2.5" />
            </a>
          </>
        )}
        <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
          {openCount}
          {items.length !== openCount && <span className="opacity-60">/{items.length}</span>}
        </span>
      </header>
      {open &&
        (items.length ? (
          items.map((item) => {
            const rowReasons = (reasonsById?.get(item.id) || []).filter((r) => !['no-feature', 'off-board', 'carried'].includes(r.key));
            return (
              <ItemRow
                key={item.id}
                item={item}
                data={data}
                features={features}
                pending={pendingIds.has(item.id)}
                onUpdate={onUpdate}
                extra={rowReasons.length > 0 ? <ReasonBadges reasons={rowReasons} /> : null}
              />
            );
          })
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">You own nothing under this Feature.</p>
        ))}
    </section>
  );
}

export function FeaturesView({ data, items, features, pendingIds, reasonsById, onUpdate, onMoveFeature }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const groups = new Map();
  items.forEach((i) => groups.set(i.featureId, [...(groups.get(i.featureId) || []), i]));
  if (showEmpty) features.filter((f) => f.onBoard && !isDone(f)).forEach((f) => !groups.has(f.id) && groups.set(f.id, []));

  const byId = new Map(features.map((f) => [f.id, f]));
  const rank = (fid) => {
    const f = byId.get(fid);
    if (!f) return -2;
    if (!f.onBoard) return -1;
    return columnRank(f.column);
  };
  const ordered = [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b) || (byId.get(a)?.title || '').localeCompare(byId.get(b)?.title || ''));
  const order = (a, b) => Number(isDone(a)) - Number(isDone(b)) || b.id - a.id;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-8">
      <label className="flex items-center gap-2 self-end text-xs text-muted-foreground">
        <Checkbox checked={showEmpty} onCheckedChange={(v) => setShowEmpty(!!v)} />
        Show board Features with none of my items
      </label>
      {ordered.map(([fid, list]) => (
        <FeatureGroup
          key={fid ?? 'none'}
          feature={byId.get(fid)}
          items={list.sort(order)}
          data={data}
          features={features}
          pendingIds={pendingIds}
          reasonsById={reasonsById}
          onUpdate={onUpdate}
          onMoveFeature={onMoveFeature}
        />
      ))}
      {ordered.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No items match the current filters.</p>}
    </div>
  );
}
