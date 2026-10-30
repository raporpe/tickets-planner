import { useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { FeaturePicker, ItemLink, SprintSelect, StatePill, StateSelect, TypeLabel } from '@/components/work-item';
import { columnRank, isDone } from '@/lib/planning';
import { openOnClick, useDetail } from '@/lib/detail';

export function ItemRow({ item, data, features, pending, onUpdate, extra }) {
  const { openItem } = useDetail();
  const via = item.chain.filter((c) => c.type !== 'Feature');
  return (
    <div
      onClick={openOnClick(openItem, item.id)}
      className={cn(
        'grid cursor-pointer grid-cols-[4.5rem_5rem_minmax(0,1fr)_minmax(0,16rem)_10rem_7.5rem] items-center gap-3 border-b px-3 py-1.5 last:border-b-0 hover:bg-accent/40',
        isDone(item) && 'opacity-55',
        pending && 'animate-pulse',
      )}
    >
      <TypeLabel type={item.type} />
      <ItemLink item={item} />
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => openItem(item.id)}
          className="block w-full truncate text-left text-[13px] hover:underline hover:decoration-muted-foreground hover:underline-offset-2 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {item.title}
        </button>
        {(via.length > 0 || extra) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {via.length > 0 && <>via {via.map((c) => `${c.type} ${c.id}`).join(' › ')}</>}
            {via.length > 0 && extra && ' · '}
            {extra}
          </p>
        )}
      </div>
      <FeaturePicker item={item} features={features} onPick={(parentId) => onUpdate(item, { parentId })} disabled={pending} />
      <SprintSelect item={item} data={data} onChange={(p) => onUpdate(item, p)} disabled={pending} className="w-full" />
      <StateSelect item={item} states={data.states[item.type]} onChange={(p) => onUpdate(item, p)} disabled={pending} />
    </div>
  );
}

function FeatureGroup({ feature, items, data, features, pendingIds, onUpdate }) {
  const [open, setOpen] = useState(true);
  const openCount = items.filter((i) => !isDone(i)).length;
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center gap-2 bg-muted/50 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
        >
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
          <h3 className="truncate text-sm font-semibold">{feature ? feature.title : 'No parent Feature'}</h3>
        </button>
        {feature && (
          <>
            {feature.onBoard ? (
              <Badge variant="secondary" className="h-5 text-[11px]">
                {feature.column || 'On board'}
              </Badge>
            ) : (
              <Badge variant="outline" className="h-5 border-amber-400/40 text-[11px] text-amber-300">
                Off board · {feature.iterationPath.replace(/^SAN SA\\/, '')}
              </Badge>
            )}
            {feature.lane && <span className="hidden text-[11px] text-muted-foreground lg:inline">{feature.lane}</span>}
            {feature.state !== feature.column && <StatePill state={feature.state} />}
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
          items.map((item) => (
            <ItemRow key={item.id} item={item} data={data} features={features} pending={pendingIds.has(item.id)} onUpdate={onUpdate} />
          ))
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">You own nothing under this Feature.</p>
        ))}
    </section>
  );
}

export function FeaturesView({ data, items, features, pendingIds, onUpdate }) {
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
          onUpdate={onUpdate}
        />
      ))}
      {ordered.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No items match the current filters.</p>}
    </div>
  );
}
