import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, KanbanSquare, Layers, Loader2, Moon, RefreshCw, Search, Sun, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api } from '@/api';
import { SignIn } from '@/components/sign-in';
import { PlanView } from '@/components/plan-view';
import { FeaturesView } from '@/components/features-view';
import { AttentionView } from '@/components/attention-view';
import { clearDetailCache, ItemDetail, prefetchDetail } from '@/components/item-detail';
import { TicketSearch } from '@/components/ticket-search';
import { clearAncestors } from '@/components/hierarchy';
import { DetailContext } from '@/lib/detail';
import { attentionReasons, canBeInSprint, featuresInSprint, isDone, matchesFilters, needsAction } from '@/lib/planning';
import { copyItem } from '@/lib/copy-item';
import { isTyping, overlayOpen, queueAction, runAction, TICKET_ACTIONS } from '@/lib/shortcuts';
import { ShortcutsHelp } from '@/components/shortcuts-help';
import { setTheme, useTheme } from '@/lib/theme';
import { openExternal } from '@/lib/desktop';

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
  if (patch.priority != null) return `priority → P${patch.priority}`;
  if (patch.iterationPath) {
    const s = data.sprints.find((x) => x.path === patch.iterationPath);
    return `moved to ${s ? s.name : 'Backlog'}`;
  }
  if ('parentId' in patch) return `parent → ${features.find((f) => f.id === patch.parentId)?.title || patch.parentId}`;
  return 'updated';
}

const INITIAL_PROGRESS = {
  active: true,
  title: 'Signing in to Azure DevOps',
  detail: 'Acquiring Azure CLI token for SAN SA…',
  steps: [
    { id: 'auth', label: 'Azure CLI session', state: 'active', detail: 'Acquiring Azure CLI token for SAN SA…' },
    { id: 'sprints', label: 'Sprint schedule', state: 'pending', detail: 'Waiting to read SAN SA\\Sprint iterations' },
    { id: 'board', label: 'Features board & states', state: 'pending', detail: 'Columns, board Features & state mappings' },
    { id: 'wiql', label: 'Assigned work items', state: 'pending', detail: 'Tasks, Bugs & User Stories assigned to you' },
    { id: 'items', label: 'Ticket fields & relations', state: 'pending', detail: 'Batch-fetching work items & artifact links' },
    { id: 'hierarchy', label: 'Epic › Feature › Story chains', state: 'pending', detail: 'Resolving parent chains & board Features' },
  ],
};

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

function LoadingProgress({ progress, elapsedMs }) {
  const steps = progress?.steps || INITIAL_PROGRESS.steps;
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const activeCount = steps.filter((s) => s.state === 'active').length;
  const pct = Math.min(98, Math.max(8, Math.round(((doneCount + activeCount * 0.55) / steps.length) * 100)));

  return (
    <section
      aria-live="polite"
      className="w-full max-w-md rounded-xl border bg-card px-5 py-4 shadow-[0_12px_32px_-8px_oklch(0.25_0.02_60/0.12)] dark:shadow-[0_16px_36px_-8px_oklch(0_0_0/0.45)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          <h2 className="truncate text-sm font-semibold text-foreground">{progress?.title || INITIAL_PROGRESS.title}</h2>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {doneCount}/{steps.length} · {(elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>
      <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">{progress?.detail || INITIAL_PROGRESS.detail}</p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-3.5 divide-y divide-border/60 border-t pt-1">
        {steps.map((step) => {
          const isDoneStep = step.state === 'done';
          const isActiveStep = step.state === 'active';
          return (
            <li key={step.id} className="flex items-center gap-2.5 py-1.5 text-xs">
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {isDoneStep ? (
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : isActiveStep ? (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/35" />
                )}
              </span>
              <span
                className={
                  isActiveStep
                    ? 'shrink-0 font-semibold text-foreground'
                    : isDoneStep
                      ? 'shrink-0 font-medium text-foreground/85'
                      : 'shrink-0 text-muted-foreground/75'
                }
              >
                {step.label}
              </span>
              <span className="ml-auto flex min-w-0 items-center gap-2 pl-3 text-right">
                <span className={isActiveStep ? 'truncate text-[11px] text-foreground/90' : 'truncate text-[11px] text-muted-foreground'}>
                  {step.detail}
                </span>
                {isDoneStep && step.ms != null && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{step.ms}ms</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Mirrors the real Sprint planning layout: one-card-wide Backlog, the next sprint's whiteboard, the drawer handle.
function LoadingPlan({ progress, elapsedMs }) {
  return (
    <div className="relative h-full overflow-hidden" aria-busy="true" aria-label="Loading my sprint">
      <div className="flex h-full gap-3 pr-14 pb-14 pl-[3.75rem]">
        <div className="relative flex h-full min-w-[19rem] flex-1 flex-col rounded-lg border bg-muted/40">
          <ColumnHeaderSkeleton wide />
          <div className="whiteboard-dots grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2.5 overflow-hidden p-3 opacity-45">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <LoadingProgress progress={progress} elapsedMs={elapsedMs} />
          </div>
        </div>
      </div>
      <div className="absolute top-0 bottom-14 left-0 flex w-11 flex-col items-center gap-2 rounded-r-xl border border-l-0 bg-card py-3">
        <Skeleton className="size-4" />
        <Skeleton className="h-24 w-4" />
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

function LoadingList({ progress, elapsedMs }) {
  return (
    <div className="relative flex h-full flex-col gap-2 px-4" aria-busy="true">
      <div className="flex flex-col gap-2 opacity-45">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
        <LoadingProgress progress={progress} elapsedMs={elapsedMs} />
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const syncStartRef = useRef(Date.now());
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
    syncStartRef.current = Date.now();
    setElapsedMs(0);
    setProgress(INITIAL_PROGRESS);
    setAuth(await api.status().catch((e) => ({ signedIn: false, error: e.message })));
  }, []);

  const load = useCallback(async () => {
    if (dataRef.current) {
      syncStartRef.current = Date.now();
      setElapsedMs(0);
      clearDetailCache();
    }
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

  const isSyncing = !auth || loading;
  useEffect(() => {
    if (!isSyncing) return;
    let cancelled = false;
    const poll = () => {
      api
        .progress()
        .then((s) => {
          if (!cancelled && s?.steps) setProgress(s);
        })
        .catch(() => {});
    };
    poll();
    const progressTimer = setInterval(poll, 70);
    const clockTimer = setInterval(() => {
      setElapsedMs(Date.now() - syncStartRef.current);
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(progressTimer);
      clearInterval(clockTimer);
    };
  }, [isSyncing]);

  useEffect(() => {
    let hoverTimer = null;
    let hoveredId = 0;
    const onOver = (e) => {
      const id = Number(e.target?.closest?.('[data-item-id]')?.dataset?.itemId);
      if (!id || id === hoveredId) return;
      clearTimeout(hoverTimer);
      hoveredId = id;
      hoverTimer = setTimeout(() => prefetchDetail(id), 130);
    };
    const onOut = (e) => {
      if (!hoveredId) return;
      const nextId = Number(e.relatedTarget?.closest?.('[data-item-id]')?.dataset?.itemId);
      if (nextId !== hoveredId) {
        clearTimeout(hoverTimer);
        hoveredId = 0;
      }
    };
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerout', onOut, { passive: true });
    return () => {
      clearTimeout(hoverTimer);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerout', onOut);
    };
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  useEffect(() => {
    let cancelled = false;
    api
      .checkUpdate()
      .then((u) => {
        if (cancelled || !u?.available) return;
        const id = toast.loading(`Updating Tickets planner to v${u.version}…`, {
          description: 'Downloading signed release and restarting…',
        });
        api.installUpdate().catch((e) => {
          toast.error(`Update to v${u.version} failed`, {
            id,
            description: e?.error || e?.message || String(e),
          });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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
  // Closed tickets always show in the current and upcoming sprints, whatever the "show closed" toggle says.
  const sprintItems = useMemo(() => {
    const live = new Set((data?.sprints || []).filter((s) => s.timeFrame === 'current' || s.timeFrame === 'future').map((s) => s.path));
    const withClosed = { ...filters, showClosed: true };
    return (data?.items || []).filter(
      (i) => canBeInSprint(i.type) && matchesFilters(i, isDone(i) && live.has(i.iterationPath) ? withClosed : filters, featureById),
    );
  }, [data, filters, featureById]);
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
      if (action === 'open-ado') return openExternal(item?.url || `https://msasg.visualstudio.com/SAN%20SA/_workitems/edit/${id}`).catch(
        (error) => toast.error(`Could not open Azure DevOps: ${error.message || error}`),
      );
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

  const filterRef = useRef(null);
  const onView = useCallback((view) => {
    if (view === 'filter') return filterRef.current?.focus();
    toast.message(filters.showClosed ? 'Hiding closed tickets' : 'Showing tickets closed in the last 21 days');
    setFilters((f) => ({ ...f, showClosed: !f.showClosed }));
  }, [filters.showClosed]);

  useEffect(() => {
    let gAt = 0;
    const keys = { s: 'state', p: 'priority', f: 'feature', l: 'link-pr', m: 'comment', e: 'edit', o: 'open-ado', c: 'copy' };
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e) || overlayOpen() || helpRef.current) return;
      const k = e.key.toLowerCase();
      if (e.key === '?') {
        e.preventDefault();
        return setShortcutsOpen(true);
      }
      if (e.key === '/' || (e.shiftKey && k === 'd')) {
        e.preventDefault();
        return onView(e.key === '/' ? 'filter' : 'toggle-closed');
      }
      if (gAt && Date.now() - gAt < 1200 && !e.shiftKey) {
        gAt = 0;
        const nav = { s: 'plan', f: 'features', a: 'attention', h: 'attention' }[k];
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
  }, [getTarget, doAction, goTo, onView]);

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
          clearDetailCache();
          await load();
        }
        else setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, state: r.state, priority: r.priority ?? i.priority, iterationPath: r.iterationPath } : i)) }));
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

  if (auth && !auth.signedIn) {
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
          <TabsList className="h-8">
            <TabsTrigger value="plan" className="text-xs">
              <KanbanSquare /> My sprint
            </TabsTrigger>
            <TabsTrigger value="features" className="text-xs">
              <Layers /> By Feature
            </TabsTrigger>
            <TabsTrigger value="attention" className="text-xs">
              <TriangleAlert /> Hygiene
              {attentionCount > 0 && (
                <span className="ml-0.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 tabular-nums dark:bg-amber-300/15 dark:text-amber-200">{attentionCount}</span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="group/filter relative w-56 transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-within:w-80 motion-reduce:transition-none">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={filterRef}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.stopPropagation();
                if (filters.search) setFilters((f) => ({ ...f, search: '' }));
                else e.currentTarget.blur();
              }}
              placeholder="Filter tickets"
              title="Filter by id, title, tag or Feature (/)"
              aria-label="Filter by id, title, tag or Feature"
              className="h-8 pr-14 pl-8 text-xs"
            />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums">
              {filters.search || filters.showClosed ? (
                data && `${shownCount}/${totalCount}`
              ) : (
                <kbd className="rounded border bg-muted px-1 font-sans text-[10px] font-medium group-focus-within/filter:hidden">/</kbd>
              )}
            </span>
          </div>
          {filters.showClosed && (
            <button
              type="button"
              onClick={() => onView('toggle-closed')}
              title="Hide closed tickets (Shift D)"
              className="group/chip flex h-7 items-center gap-1 rounded-full border bg-muted/60 pr-1.5 pl-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Incl. closed · 21 days
              <X className="size-3.5 opacity-60 group-hover/chip:opacity-100" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {data && loading && (
              <span className="hidden max-w-64 truncate text-xs text-muted-foreground lg:inline" aria-live="polite">
                {progress?.detail || progress?.title}
              </span>
            )}
            <span className="hidden text-xs text-muted-foreground md:inline">
              {auth?.user ? `${auth.user} · ${auth.method === 'device-code' ? 'device code' : 'Azure CLI'}` : progress?.detail || 'Connecting to SAN SA…'}
            </span>
            {data && <TicketSearch data={data} getTarget={getTarget} onAction={doAction} onNavigate={goTo} onView={onView} showClosed={filters.showClosed} onShowShortcuts={() => setShortcutsOpen(true)} />}
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              disabled={!auth || loading}
              aria-label="Refresh from Azure DevOps"
              title={data ? `Synced ${new Date(data.generatedAt).toLocaleTimeString()}` : undefined}
            >
              <RefreshCw className={!auth || loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <div className="min-h-0 flex-1 pt-3">
          {loadError && (
            <div className="mx-4 mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Could not load from Azure DevOps: {loadError}{' '}
              <button type="button" className="underline underline-offset-2" onClick={load}>
                Try again
              </button>
            </div>
          )}
          {!data ? (
            (!auth || loading) && (tab === 'plan' ? <LoadingPlan progress={progress} elapsedMs={elapsedMs} /> : <LoadingList progress={progress} elapsedMs={elapsedMs} />)
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
