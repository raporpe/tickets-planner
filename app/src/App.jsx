import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KanbanSquare, Layers, Loader2, Moon, RefreshCw, Search, Sun, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { TicketSearch } from '@/components/ticket-search';
import { clearAncestors } from '@/components/hierarchy';
import { DetailContext } from '@/lib/detail';
import { attentionReasons, canBeInSprint, featuresInSprint, matchesFilters, needsAction } from '@/lib/planning';
import { copyItem } from '@/lib/copy-item';
import { isTyping, overlayOpen, queueAction, runAction, TICKET_ACTIONS } from '@/lib/shortcuts';
import { ShortcutsHelp } from '@/components/shortcuts-help';
import { setTheme, useTheme } from '@/lib/theme';

function ThemeToggle() {
  const dark = useTheme() === 'dark';
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function describe(patch, data, features) {
  if (patch.state) return `state → ${patch.state}`;
  if (patch.iterationPath) {
    const s = data.sprints.find((x) => x.path === patch.iterationPath);
    return `moved to ${s ? s.name : 'Backlog'}`;
  }
  if ('parentId' in patch) return `parent → ${features.find((f) => f.id === patch.parentId)?.title || patch.parentId}`;
  return 'updated';
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

function ColumnHeaderSkeleton({ wide }) {
  return (
    <div className="flex items-center gap-2 border-b px-3 py-3">
      <Skeleton className="size-4" />
      <Skeleton className={wide ? 'h-4 w-24' : 'h-4 w-16'} />
    </div>
  );
}

// Mirrors the real Sprint planning layout: one-card-wide Backlog, the next sprint's whiteboard, the drawer handle.
function LoadingPlan() {
  return (
    <div className="relative h-full overflow-hidden" aria-busy="true" aria-label="Loading sprint planning">
      <div className="flex h-full gap-3 px-4 pr-14 pb-14">
        <div className="flex h-full w-[20rem] shrink-0 flex-col rounded-lg border bg-muted/40">
          <ColumnHeaderSkeleton />
          <div className="flex flex-col gap-1.5 overflow-hidden p-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="flex h-full min-w-[19rem] flex-1 flex-col rounded-lg border bg-muted/40">
          <ColumnHeaderSkeleton wide />
          <div className="whiteboard-dots grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2.5 overflow-hidden p-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute top-0 right-0 bottom-14 flex w-11 flex-col items-center gap-2 rounded-l-xl border border-r-0 bg-card py-3">
        <Skeleton className="size-4" />
        <Skeleton className="h-24 w-4" />
      </div>
      <div className="absolute inset-x-4 bottom-0 flex h-11 items-center gap-2 rounded-t-xl border border-b-0 bg-card px-4">
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="flex flex-col gap-2 px-4" aria-busy="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-14" />
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
  const [filters, setFilters] = useState({ search: '', showClosed: false });
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
  // Sprint planning shows only what can be sprinted (Tasks and Bugs); Stories live in By Feature / Needs attention.
  const sprintItems = useMemo(() => visibleItems.filter((i) => canBeInSprint(i.type)), [visibleItems]);
  const shownCount = tab === 'plan' ? sprintItems.length : visibleItems.length;
  const totalCount = tab === 'plan' ? (data?.items || []).filter((i) => canBeInSprint(i.type)).length : data?.items.length;
  const attentionCount = useMemo(
    () => [...reasonsById.values()].filter(needsAction).length + (data ? featuresInSprint(data.items, data.features, data).length : 0),
    [reasonsById, data],
  );

  // Linear-style shortcuts: act on the open ticket, else on the hovered card or row.
  const dataRef = useRef(data);
  dataRef.current = data;
  const detailRef = useRef(detailId);
  detailRef.current = detailId;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const helpRef = useRef(false);
  helpRef.current = shortcutsOpen;

  const getTarget = useCallback(() => {
    if (detailRef.current) return { id: detailRef.current, scope: document.querySelector('[data-slot="sheet-content"]') };
    const el = [...document.querySelectorAll(':hover')].pop()?.closest('[data-item-id]');
    const id = Number(el?.dataset.itemId);
    return id ? { id, scope: el } : null;
  }, []);

  const doAction = useCallback((action, target) => {
    if (!target) return toast.message('Hover a ticket or open one first');
    const { id, scope } = target;
    const d = dataRef.current;
    if (action === 'copy' || action === 'open-ado') {
      const item = d?.items.find((i) => i.id === id) || d?.features.find((f) => f.id === id);
      if (action === 'open-ado') return window.open(item?.url || `https://msasg.visualstudio.com/SAN%20SA/_workitems/edit/${id}`, '_blank', 'noreferrer');
      if (!item) return toast.message(`#${id} isn't loaded in the planner`);
      return copyItem(item).then(
        () => toast.success(`Copied #${item.id}`),
        () => toast.error('Could not copy to the clipboard'),
      );
    }
    if (scope?.isConnected && runAction(action, id, scope)) return;
    if (detailRef.current === id) {
      const a = TICKET_ACTIONS.find((x) => x.id === action);
      return toast.message(`${a?.label || 'That action'} isn't available for #${id}`);
    }
    queueAction(action, id);
    setDetailId(id);
  }, []);

  const goTo = useCallback((nav) => {
    setDetailId(null);
    setTab(nav);
  }, []);

  useEffect(() => {
    let gAt = 0;
    const keys = { s: 'state', f: 'feature', p: 'link-pr', m: 'comment', e: 'edit', o: 'open-ado', c: 'copy' };
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e) || overlayOpen() || helpRef.current) return;
      const k = e.key.toLowerCase();
      if (e.key === '?') {
        e.preventDefault();
        return setShortcutsOpen(true);
      }
      if (gAt && Date.now() - gAt < 1200 && !e.shiftKey) {
        gAt = 0;
        const nav = { s: 'plan', f: 'features', a: 'attention' }[k];
        if (nav) {
          e.preventDefault();
          goTo(nav);
        }
        return;
      }
      gAt = 0;
      if (k === 'g' && !e.shiftKey) {
        if (!detailRef.current) gAt = Date.now();
        return;
      }
      const action = e.shiftKey ? (k === 'c' ? 'sprint' : null) : keys[k];
      if (!action) return;
      const target = getTarget();
      if (!target) return;
      e.preventDefault();
      doAction(action, target);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [getTarget, doAction, goTo]);

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
        if ('parentId' in patch) {
          clearAncestors();
          await load();
        }
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
                <span className="ml-0.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 tabular-nums dark:bg-amber-300/15 dark:text-amber-200">{attentionCount}</span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground md:inline">
              {auth.user} · {auth.method === 'device-code' ? 'device code' : 'Azure CLI'}
            </span>
            {data && <TicketSearch data={data} getTarget={getTarget} onAction={doAction} onNavigate={goTo} onShowShortcuts={() => setShortcutsOpen(true)} />}
            <Button size="sm" variant="outline" onClick={load} disabled={loading} aria-label="Refresh from Azure DevOps">
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <ThemeToggle />
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
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={filters.showClosed} onCheckedChange={(v) => setFilters((f) => ({ ...f, showClosed: !!v }))} />
            Show closed (last 21 days)
          </label>
          {data && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {shownCount} of {totalCount} items · synced {new Date(data.generatedAt).toLocaleTimeString()}
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
            loading && (tab === 'plan' ? <LoadingPlan /> : <LoadingList />)
          ) : (
            <>
              <TabsContent value="plan" className="h-full">
                <PlanView {...viewProps} items={sprintItems} />
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
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
    </DetailContext.Provider>
  );
}

