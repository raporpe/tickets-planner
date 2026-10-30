import { useCallback, useEffect, useMemo, useState } from 'react';
import { KanbanSquare, Layers, Loader2, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api } from '@/api';
import { SignIn } from '@/components/sign-in';
import { PlanView } from '@/components/plan-view';
import { FeaturesView } from '@/components/features-view';
import { AttentionView } from '@/components/attention-view';
import { ItemDetail } from '@/components/item-detail';
import { DetailContext } from '@/lib/detail';
import { attentionReasons, matchesFilters } from '@/lib/planning';

const TYPES = ['Task', 'Bug', 'User Story'];

function describe(patch, data, features) {
  if (patch.state) return `state → ${patch.state}`;
  if (patch.iterationPath) {
    const s = data.sprints.find((x) => x.path === patch.iterationPath);
    return `moved to ${s ? s.name : 'Backlog'}`;
  }
  if ('parentId' in patch) return `parent → ${features.find((f) => f.id === patch.parentId)?.title || patch.parentId}`;
  return 'updated';
}

function LoadingBoard() {
  return (
    <div className="flex gap-3 px-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex w-80 flex-col gap-2 rounded-lg border p-2">
          <Skeleton className="h-10" />
          {[0, 1, 2, 3].map((j) => (
            <Skeleton key={j} className="h-20" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [filters, setFilters] = useState({ search: '', types: [], showClosed: false });
  const [tab, setTab] = useState('plan');
  const [detailId, setDetailId] = useState(null);
  const detailCtx = useMemo(() => ({ openItem: setDetailId }), []);
  const onItemPatched = useCallback(
    (id, partial) => setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...partial } : i)) })),
    [],
  );

  const checkAuth = useCallback(async () => {
    setAuth(await api.status().catch((e) => ({ signedIn: false, error: e.message })));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await api.overview());
    } catch (e) {
      if (e.status === 401) return checkAuth();
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [checkAuth]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  useEffect(() => {
    if (auth?.signedIn) load();
  }, [auth?.signedIn, load]);

  const featureById = useMemo(() => new Map((data?.features || []).map((f) => [f.id, f])), [data]);
  const reasonsById = useMemo(
    () => new Map((data?.items || []).map((i) => [i.id, attentionReasons(i, data, featureById)])),
    [data, featureById],
  );
  const visibleItems = useMemo(() => (data?.items || []).filter((i) => matchesFilters(i, filters, featureById)), [data, filters, featureById]);
  const attentionCount = useMemo(() => [...reasonsById.values()].filter((r) => r.length).length, [reasonsById]);

  const onUpdate = useCallback(
    async (item, patch) => {
      const label = describe(patch, data, data.features);
      const previous = item;
      setPendingIds((s) => new Set(s).add(item.id));
      if (!('parentId' in patch)) {
        setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) }));
      }
      try {
        const r = await api.update(item.id, patch);
        toast.success(`#${item.id} ${label}`);
        if ('parentId' in patch) await load();
        else setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, state: r.state, iterationPath: r.iterationPath } : i)) }));
      } catch (e) {
        setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? previous : i)) }));
        toast.error(`#${item.id}: could not save (${label})`, { description: e.message });
        if (e.status === 401) checkAuth();
      } finally {
        setPendingIds((s) => {
          const n = new Set(s);
          n.delete(item.id);
          return n;
        });
      }
    },
    [data, load, checkAuth],
  );

  const onMoveFeature = useCallback(
    async (feature, column) => {
      const setFeature = (patch) => setData((d) => ({ ...d, features: d.features.map((f) => (f.id === feature.id ? { ...f, ...patch } : f)) }));
      setPendingIds((s) => new Set(s).add(feature.id));
      setFeature({ column });
      try {
        const r = await api.moveFeature(feature.id, column);
        setFeature({ column: r.column, state: r.state });
        toast.success(`Feature #${feature.id} moved to ${r.column}`);
      } catch (e) {
        setFeature({ column: feature.column, state: feature.state });
        toast.error(`Feature #${feature.id}: could not move to ${column}`, { description: e.message });
        if (e.status === 401) checkAuth();
      } finally {
        setPendingIds((s) => {
          const n = new Set(s);
          n.delete(feature.id);
          return n;
        });
      }
    },
    [checkAuth],
  );

  if (!auth) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!auth.signedIn) {
    return (
      <>
        <SignIn status={auth} onSignedIn={checkAuth} />
        <Toaster />
      </>
    );
  }

  const viewProps = { data, items: visibleItems, features: data?.features || [], pendingIds, reasonsById, onUpdate };

  return (
    <DetailContext.Provider value={detailCtx}>
    <TooltipProvider delayDuration={300}>
      <Tabs value={tab} onValueChange={setTab} className="flex h-svh flex-col gap-0">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight">Tickets planner</h1>
            <span className="text-xs text-muted-foreground">SAN SA · Bing Mobile Apps Team</span>
          </div>
          <TabsList className="h-8">
            <TabsTrigger value="plan" className="text-xs">
              <KanbanSquare /> Sprint planning
            </TabsTrigger>
            <TabsTrigger value="features" className="text-xs">
              <Layers /> By Feature
            </TabsTrigger>
            <TabsTrigger value="attention" className="text-xs">
              <TriangleAlert /> Needs attention
              {attentionCount > 0 && (
                <span className="ml-0.5 rounded bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-300 tabular-nums">{attentionCount}</span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground md:inline">
              {auth.user} · {auth.method === 'device-code' ? 'device code' : 'Azure CLI'}
            </span>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} aria-label="Refresh from Azure DevOps">
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Filter by id, title, tag or Feature"
              aria-label="Filter items"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={filters.types}
            onValueChange={(types) => setFilters((f) => ({ ...f, types }))}
            aria-label="Filter by type"
          >
            {TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t} className="h-8 px-2.5 text-xs">
                {t === 'User Story' ? 'Stories' : `${t}s`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={filters.showClosed} onCheckedChange={(v) => setFilters((f) => ({ ...f, showClosed: !!v }))} />
            Show closed (last 21 days)
          </label>
          {data && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {visibleItems.length} of {data.items.length} items · synced {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {loadError && (
            <div className="mx-4 mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Could not load from Azure DevOps: {loadError}{' '}
              <button type="button" className="underline underline-offset-2" onClick={load}>
                Try again
              </button>
            </div>
          )}
          {!data ? (
            loading && <LoadingBoard />
          ) : (
            <>
              <TabsContent value="plan" className="h-full">
                <PlanView {...viewProps} />
              </TabsContent>
              <TabsContent value="features" className="h-full overflow-y-auto">
                <FeaturesView {...viewProps} onMoveFeature={onMoveFeature} />
              </TabsContent>
              <TabsContent value="attention" className="h-full overflow-y-auto">
                <AttentionView {...viewProps} items={data.items} />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
      {data && (
        <ItemDetail
          id={detailId}
          data={data}
          features={data.features}
          pendingIds={pendingIds}
          onUpdate={onUpdate}
          onItemPatched={onItemPatched}
          onClose={() => setDetailId(null)}
        />
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
    </DetailContext.Provider>
  );
}
