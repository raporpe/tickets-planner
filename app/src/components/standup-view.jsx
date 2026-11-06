import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleCheckBig, Clock, Flame, KanbanSquare, Layers, LayoutGrid, PieChart, Shuffle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HierarchyHover } from '@/components/hierarchy';
import { PriorityPill, WorkItemCard } from '@/components/work-item';
import { api } from '@/api';
import { isDesktop } from '@/lib/desktop';
import { useDetail } from '@/lib/detail';
import { useBoardLayout } from '@/lib/board-layout';
import { useBoardNotes } from '@/lib/board-notes';
import { useSmoothBoardZoom } from '@/lib/board-zoom';
import { cn } from '@/lib/utils';
import {
  attentionReasons,
  canBeInSprint,
  columnRank,
  computeWorkingSprintTiming,
  isDone,
  isSprintUnplanned,
  matchesFilters,
  matchTeamMember,
  PRIORITIES,
  STANDUP_COLUMNS,
  STANDUP_TEAM,
  standupColumnOf,
} from '@/lib/planning';
import { isTyping, overlayOpen } from '@/lib/shortcuts';

const avatarCache = new Map();
const avatarInflight = new Map();

function fetchAvatar(url) {
  if (!url || !isDesktop) return Promise.resolve(null);
  if (avatarCache.has(url)) return Promise.resolve(avatarCache.get(url));
  if (avatarInflight.has(url)) return avatarInflight.get(url);
  const p = api
    .attachment(url)
    .then(({ mime, data }) => {
      if (!data) return null;
      const cleanMime = String(mime || 'image/png').split(';')[0].trim() || 'image/png';
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: cleanMime }));
      avatarCache.set(url, objectUrl);
      avatarInflight.delete(url);
      return objectUrl;
    })
    .catch(() => {
      avatarInflight.delete(url);
      return null;
    });
  avatarInflight.set(url, p);
  return p;
}

function TabCurveEars() {
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute -top-3 right-0 size-3"
      >
        <path d="M 12 0 L 12 12 L 0 12 A 12 12 0 0 0 12 0 Z" fill="var(--card)" />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute -bottom-3 right-0 size-3"
      >
        <path d="M 0 0 L 12 0 L 12 12 A 12 12 0 0 0 0 0 Z" fill="var(--card)" />
      </svg>
    </>
  );
}

function MemberAvatar({ member, selected, size = 'size-6' }) {
  const [src, setSrc] = useState(() => avatarCache.get(member.avatarUrl) || null);

  useEffect(() => {
    let alive = true;
    if (avatarCache.has(member.avatarUrl)) {
      setSrc(avatarCache.get(member.avatarUrl));
      return;
    }
    fetchAvatar(member.avatarUrl).then((url) => {
      if (alive && url) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [member.avatarUrl]);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(
          size,
          'shrink-0 rounded-full object-cover ring-1 transition-shadow',
          selected ? 'ring-primary/50' : 'ring-border/70',
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-[10px] font-semibold transition-colors',
        size,
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground group-hover:bg-secondary group-hover:text-secondary-foreground',
      )}
    >
      {member.initials}
    </span>
  );
}

const CARD_W = 272;
const NOTE_W = 288;
const PAD = 12;
const GAP = 16;
const SNAP_X = 36;
const SNAP_Y = 18;
const EST_H = 126;
const SLACK = 140;
const SLACK_X = 240;
const LEGACY_W = 1600;

const snapX = (px) => Math.max(PAD, PAD + Math.round((px - PAD) / SNAP_X) * SNAP_X);
const snapY = (py) => Math.max(PAD, PAD + Math.round((py - PAD) / SNAP_Y) * SNAP_Y);

function computeWhiteboardLayout(items, colKey, viewW, heights, rawLayout) {
  const lanes = Math.max(1, Math.floor((viewW - PAD * 2 + GAP) / (CARD_W + GAP)));
  const legacy = Math.max(0, Math.max(viewW, LEGACY_W) - CARD_W - PAD * 2);
  const pos = new Map();
  let bottom = 0;
  let right = 0;
  const free = [];
  for (const item of items) {
    const s = rawLayout?.[item.id];
    if (s && !s.deleted && s.col === colKey) {
      const rawX = s.px ?? PAD + (s.x ?? 0) * legacy;
      const p = { x: snapX(rawX), y: snapY(s.y ?? PAD), z: s.z ?? 1 };
      pos.set(item.id, p);
      bottom = Math.max(bottom, p.y + (heights[item.id] ?? EST_H));
      right = Math.max(right, p.x + CARD_W);
    } else {
      free.push(item);
    }
  }
  const laneX = (i) => PAD + i * (CARD_W + GAP);
  const laneY = Array(lanes).fill(bottom ? snapY(bottom + SNAP_Y * 2) : PAD);
  for (const item of free) {
    const i = laneY.indexOf(Math.min(...laneY));
    const y = snapY(laneY[i]);
    pos.set(item.id, { x: laneX(i), y, z: 0 });
    laneY[i] = snapY(y + (heights[item.id] ?? EST_H) + SNAP_Y);
    right = Math.max(right, laneX(i) + CARD_W);
  }
  return { pos, right, height: Math.max(bottom, ...laneY) + SLACK };
}

function resolveMemberBoard(member, sprintPath, standupBoards, myLayout, myNotes, meEmail) {
  const isMe = member.aliases.some((a) => a.toLowerCase() === String(meEmail || '').toLowerCase());
  if (isMe) {
    return { layout: myLayout || {}, notes: myNotes || {}, synced: true };
  }
  const boards = standupBoards || {};
  let doc = null;
  for (const alias of member.aliases) {
    const key = alias.toLowerCase();
    const slug = key.split('@')[0].replace(/[^a-z0-9]/g, '-');
    if (boards[key]) {
      doc = boards[key];
      break;
    }
    if (boards[slug]) {
      doc = boards[slug];
      break;
    }
  }
  if (!doc) return { layout: {}, notes: {}, synced: false };
  const layoutItems = doc.layout?.items && typeof doc.layout.items === 'object' ? doc.layout.items : doc.layout || {};
  const noteItems = doc.notes?.items && typeof doc.notes.items === 'object' ? doc.notes.items : doc.notes || {};
  return { layout: layoutItems, notes: noteItems, synced: true };
}

function MemberWhiteboard({ member, items, sprintPath, data, features, pendingIds, reasonsById, onUpdate, standupBoards }) {
  const { layout: myLayout, place } = useBoardLayout();
  const { notes: myNotes } = useBoardNotes();
  const boardRef = useRef(null);
  const cardRefs = useRef(new Map());
  const [viewW, setViewW] = useState(1100);
  const [heights, setHeights] = useState({});
  const [drag, setDrag] = useState(null);
  const [snapPreview, setSnapPreview] = useState(null);
  const [glide, setGlide] = useState(null);
  const [settleInfo, setSettleInfo] = useState({ id: null, count: 0 });
  const { zoom, zoomRef } = useSmoothBoardZoom(boardRef, sprintPath);

  const isMe = useMemo(
    () => member.aliases.some((a) => a.toLowerCase() === String(data?.me?.email || 'raulpo@microsoft.com').toLowerCase()),
    [member, data?.me?.email],
  );

  const { layout, notes } = useMemo(
    () => resolveMemberBoard(member, sprintPath, standupBoards, myLayout, myNotes, data?.me?.email),
    [member, sprintPath, standupBoards, myLayout, myNotes, data?.me?.email],
  );

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth || 1100));
    ro.observe(el);
    setViewW(el.clientWidth || 1100);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const next = {};
    let changed = false;
    for (const [id, el] of cardRefs.current.entries()) {
      if (el) {
        const h = el.offsetHeight;
        next[id] = h;
        if (heights[id] !== h) changed = true;
      }
    }
    if (changed) setHeights((prev) => ({ ...prev, ...next }));
  }, [items, heights]);

  const ordered = useMemo(
    () =>
      items
        .filter((i) => canBeInSprint(i.type))
        .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || a.type.localeCompare(b.type) || b.id - a.id),
    [items],
  );

  const { pos, right, height } = useMemo(
    () => computeWhiteboardLayout(ordered, sprintPath, viewW, heights, layout),
    [ordered, sprintPath, viewW, heights, layout],
  );

  const sprintNotes = useMemo(() => {
    const legacy = Math.max(0, Math.max(viewW, LEGACY_W) - NOTE_W - PAD * 2);
    return Object.entries(notes || {})
      .filter(([, n]) => n && !n.deleted && n.col === sprintPath && String(n.text || '').trim())
      .map(([id, n]) => ({
        id,
        text: n.text,
        left: snapX(n.px ?? PAD + (n.x ?? 0) * legacy),
        top: snapY(n.y ?? PAD),
        z: n.z ?? 1,
      }));
  }, [notes, sprintPath, viewW]);

  const startPan = (e) => {
    if (e.button !== 0 || e.target.closest('[data-wb-card], [data-wb-note]')) return;
    const el = boardRef.current;
    if (!el) return;
    const s = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    let panning = false;
    const move = (ev) => {
      const dx = ev.clientX - s.x;
      const dy = ev.clientY - s.y;
      if (!panning && Math.hypot(dx, dy) < 4) return;
      if (!panning) {
        panning = true;
        document.body.style.cursor = 'grabbing';
        window.getSelection()?.removeAllRanges();
      }
      ev.preventDefault();
      el.scrollLeft = s.l - dx;
      el.scrollTop = s.t - dy;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const startCardDrag = (e, item) => {
    if (!isMe || e.button !== 0 || pendingIds.has(item.id) || e.target.closest('input, textarea, select, [role="combobox"], [aria-haspopup], a')) return;
    const el = boardRef.current;
    if (!el) return;
    const z = zoomRef.current;
    const cardEl = e.currentTarget;
    const rect = cardEl.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / z;
    const dy = (e.clientY - rect.top) / z;
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;

    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        started = true;
        window.getSelection()?.removeAllRanges();
        document.body.style.cursor = 'grabbing';
      }
      ev.preventDefault();
      const curZ = zoomRef.current;
      const r = el.getBoundingClientRect();
      const rawPx = Math.max(PAD, Math.round((ev.clientX - r.left + el.scrollLeft) / curZ - dx));
      const rawPy = Math.max(PAD, Math.round((ev.clientY - r.top + el.scrollTop) / curZ - dy));
      setDrag({ id: item.id, x: rawPx, y: rawPy });
      setSnapPreview({ x: snapX(rawPx), y: snapY(rawPy), h: heights[item.id] ?? EST_H });
    };

    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      setSnapPreview(null);
      if (!started) return;
      const swallow = (c) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

      if (ev.type === 'pointerup') {
        const curZ = zoomRef.current;
        const r = el.getBoundingClientRect();
        const rawPx = Math.max(PAD, Math.round((ev.clientX - r.left + el.scrollLeft) / curZ - dx));
        const rawPy = Math.max(PAD, Math.round((ev.clientY - r.top + el.scrollTop) / curZ - dy));
        const px = snapX(rawPx);
        const py = snapY(rawPy);
        const entries = {};
        pos.forEach((p, id) => {
          if (id !== item.id) entries[id] = { col: sprintPath, px: Math.round(p.x), y: p.y, z: p.z };
        });
        const topZ = Math.max(0, ...Object.values(layout || {}).map((v) => v?.z ?? 0));
        entries[item.id] = { col: sprintPath, px, y: py, z: topZ + 1 };
        setDrag(null);
        setGlide({ id: item.id, x: rawPx, y: rawPy });
        setSettleInfo((s) => ({ id: item.id, count: s.count + 1 }));
        place(entries);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setGlide(null));
        });
      } else {
        setDrag(null);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const canvasW = Math.max(viewW, right + SLACK_X);
  const canvasH = Math.max(height, 420);

  return (
    <div
      ref={boardRef}
      onPointerDown={startPan}
      className="whiteboard-dots whiteboard-scroll relative min-h-0 flex-1 cursor-grab overflow-auto rounded-lg select-none"
      style={{ backgroundSize: `${18 * zoom}px ${18 * zoom}px` }}
    >
      {ordered.length === 0 && sprintNotes.length === 0 ? (
        <div className="flex h-full items-center justify-center p-8 text-xs text-muted-foreground">
          No sprint tickets for {member.name} in this sprint.
        </div>
      ) : (
        <div
          className="relative"
          style={{
            width: Math.ceil(canvasW * zoom),
            height: Math.ceil(canvasH * zoom),
          }}
        >
          <div
            className="relative origin-top-left"
            style={{
              width: canvasW,
              height: canvasH,
              transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            }}
          >
            {snapPreview && (
              <div
                aria-hidden
                style={{ left: snapPreview.x, top: snapPreview.y, width: CARD_W, height: snapPreview.h }}
                className="pointer-events-none absolute rounded-lg border border-dashed border-primary/40 bg-primary/[0.04] transition-[left,top,height] duration-120 ease-out"
              />
            )}
            {sprintNotes.map((n) => (
              <div
                key={n.id}
                data-wb-note
                style={{ left: n.left, top: n.top, maxWidth: NOTE_W }}
                className="group absolute z-[5000]"
              >
                <p className="rounded-md bg-background/60 px-2 py-1 text-sm leading-snug font-medium break-words whitespace-pre-wrap text-foreground/80">
                  {n.text}
                </p>
              </div>
            ))}
            {ordered.map((item) => {
              const p = pos.get(item.id) || { x: PAD, y: PAD, z: 1 };
              const isDragging = drag?.id === item.id;
              const isGliding = glide?.id === item.id;
              const x = isDragging ? drag.x : isGliding ? glide.x : p.x;
              const y = isDragging ? drag.y : isGliding ? glide.y : p.y;
              const settleKey = settleInfo.id === item.id ? settleInfo.count : 0;
              return (
                <div
                  key={item.id}
                  data-wb-card
                  onPointerDown={(e) => startCardDrag(e, item)}
                  ref={(el) => {
                    if (el) cardRefs.current.set(item.id, el);
                    else cardRefs.current.delete(item.id);
                  }}
                  style={{ left: x, top: y, width: CARD_W, zIndex: isDragging ? 9999 : p.z }}
                  className={cn(
                    'absolute touch-none',
                    !isDragging && !isGliding && 'transition-[left,top] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                  )}
                >
                  <div
                    key={settleKey}
                    className={cn(
                      isDragging && 'animate-card-pickup',
                      !isDragging && settleKey > 0 && 'animate-card-settle motion-reduce:animate-none',
                    )}
                  >
                    <HierarchyHover item={item}>
                      <WorkItemCard
                        item={item}
                        data={data}
                        features={features}
                        pending={pendingIds.has(item.id)}
                        reasons={reasonsById?.get(item.id)}
                        grabbable={isMe}
                        onUpdate={onUpdate}
                      />
                    </HierarchyHover>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const COLUMN_META = {
  todo: { icon: Circle, tone: 'text-stone-500 dark:text-stone-400' },
  active: { icon: Clock, tone: 'text-sky-600 dark:text-sky-300' },
  done: { icon: CircleCheckBig, tone: 'text-emerald-600 dark:text-emerald-300' },
};

function sortStandupItems(a, b) {
  const pa = a.priority ?? 2;
  const pb = b.priority ?? 2;
  if (pa !== pb) return pa - pb;
  const ua = Number(isSprintUnplanned(b)) - Number(isSprintUnplanned(a));
  if (ua !== 0) return ua;
  return b.id - a.id;
}

const STATE_VERTICAL_RANK = { todo: 0, active: 1, done: 2 };

function sortFeatureColumnItems(a, b) {
  const sa = STATE_VERTICAL_RANK[standupColumnOf(a)] ?? 1;
  const sb = STATE_VERTICAL_RANK[standupColumnOf(b)] ?? 1;
  if (sa !== sb) return sa - sb;
  return sortStandupItems(a, b);
}

function StandUpFeatureColumns({ items, data, features, featureById, pendingIds, reasonsById, onUpdate, memberName }) {
  const { openItem } = useDetail();
  const scrollRef = useRef(null);

  const startPan = (e) => {
    if (e.button !== 0 || e.target.closest('input, textarea, select, [role="combobox"], [aria-haspopup], a')) return;
    const el = scrollRef.current;
    if (!el) return;
    const s = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    let panning = false;
    const move = (ev) => {
      const dx = ev.clientX - s.x;
      const dy = ev.clientY - s.y;
      if (!panning && Math.hypot(dx, dy) < 4) return;
      if (!panning) {
        panning = true;
        document.body.style.cursor = 'grabbing';
        window.getSelection()?.removeAllRanges();
      }
      ev.preventDefault();
      el.scrollLeft = s.l - dx;
      el.scrollTop = s.t - dy;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      if (panning) {
        const swallow = (c) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const columns = useMemo(() => {
    const groups = new Map();
    for (const item of items) {
      const key = item.featureId ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const rankFeature = (fid) => {
      if (fid == null) return 999;
      const f = featureById.get(fid);
      if (!f) return 998;
      if (!f.onBoard) return 997;
      return columnRank(f.column);
    };
    return [...groups.entries()]
      .sort(([a], [b]) => {
        const ra = rankFeature(a);
        const rb = rankFeature(b);
        if (ra !== rb) return ra - rb;
        return (featureById.get(a)?.title || '').localeCompare(featureById.get(b)?.title || '');
      })
      .map(([fid, list]) => ({
        featureId: fid,
        feature: fid != null ? featureById.get(fid) : null,
        items: [...list].sort(sortFeatureColumnItems),
      }));
  }, [items, featureById]);

  if (columns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-xs text-muted-foreground">
        No sprint tickets for {memberName} in this sprint.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onPointerDown={startPan}
      className="whiteboard-scroll flex min-h-0 flex-1 cursor-grab gap-6 overflow-x-auto overflow-y-auto pt-1 pb-2 select-none active:cursor-grabbing"
    >
      {columns.map((col) => (
        <section
          key={col.featureId ?? 'unparented'}
          aria-label={col.feature ? col.feature.title : 'Standalone'}
          className="flex min-h-0 w-[20.5rem] shrink-0 flex-col"
        >
          <header className="mb-2.5 flex items-center gap-2 px-1">
            <span
              aria-hidden
              className={cn(
                'size-2 shrink-0 rounded-full',
                col.feature ? 'bg-emerald-400 dark:bg-emerald-300' : 'bg-stone-300 dark:bg-stone-500',
              )}
            />
            {col.feature ? (
              <button
                type="button"
                onClick={() => openItem(col.feature.id)}
                title={`${col.feature.title} (#${col.feature.id})`}
                className="min-w-0 truncate text-left text-xs font-semibold text-foreground/90 hover:text-primary hover:underline hover:underline-offset-2 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {col.feature.title}
              </button>
            ) : (
              <h3 className="truncate text-xs font-semibold text-muted-foreground">Standalone / No Feature</h3>
            )}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{col.items.length}</span>
          </header>
          <div className="flex flex-col gap-2">
            {col.items.map((item) => (
              <WorkItemCard
                key={item.id}
                item={item}
                data={data}
                features={features}
                pending={pendingIds.has(item.id)}
                reasons={reasonsById?.get(item.id)}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const STATS_TAB_ID = '__stats__';

function DonutChart({ slices, centerValue, centerLabel, ready = true, size = 132, strokeWidth = 20 }) {
  const total = slices.reduce((acc, s) => acc + s.count, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/70"
        />
        {total > 0 &&
          slices
            .filter((s) => s.count > 0)
            .map((s) => {
              const frac = s.count / total;
              const len = ready ? frac * circumference : 0;
              const offset = ready ? -accumulated * circumference : 0;
              accumulated += frac;
              return (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${len} ${circumference}`}
                  strokeDashoffset={offset}
                  className="transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                />
              );
            })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg leading-none font-semibold tracking-tight text-foreground tabular-nums">{centerValue}</span>
        {centerLabel && <span className="mt-1 text-[10.5px] leading-none text-muted-foreground">{centerLabel}</span>}
      </div>
    </div>
  );
}

const PRIORITY_COLORS = {
  0: 'oklch(0.60 0.19 22)',   // P0 rose
  1: 'oklch(0.72 0.16 65)',   // P1 amber
  2: 'oklch(0.56 0.12 265)',  // P2 indigo/periwinkle
  3: 'oklch(0.66 0.04 250)',  // P3 slate
  4: 'oklch(0.78 0.02 80)',   // P4 warm stone
  unset: 'oklch(0.84 0.01 80)',
};

const isIncidentOrBug = (item) =>
  item.type === 'Bug' || (item.tags || []).some((t) => /incident/i.test(String(t)));

function StandUpStatsView({ items, sprint, featureById, onSelectPerson }) {
  const { openItem } = useDetail();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReady(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [sprint?.path, items.length]);

  const total = items.length;
  const doneCount = items.filter((i) => standupColumnOf(i) === 'done').length;
  const activeCount = items.filter((i) => standupColumnOf(i) === 'active').length;
  const todoCount = items.filter((i) => standupColumnOf(i) === 'todo').length;
  const closedPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Flow friction: carried 3+ weeks & stalled 7+ days
  const carriedCount = items.filter((i) => !isDone(i) && (i.weeksCarried || 0) >= 3).length;
  const stalledCount = items.filter((i) => {
    if (isDone(i) || i.state === 'New' || !i.changedDate) return false;
    return (Date.now() - Date.parse(i.changedDate)) / 86400000 >= 7;
  }).length;

  // Sprint time calculation (working days Mon–Fri only, excluding weekends)
  const sprintTiming = useMemo(() => computeWorkingSprintTiming(sprint), [sprint]);

  // Planned vs Unplanned
  const unplannedCount = items.filter((i) => isSprintUnplanned(i)).length;
  const plannedCount = Math.max(0, total - unplannedCount);
  const unplannedPct = total > 0 ? Math.round((unplannedCount / total) * 100) : 0;
  const plannedPct = total > 0 ? 100 - unplannedPct : 0;

  const scopeSlices = [
    { key: 'planned', label: 'Planned scope', count: plannedCount, pct: plannedPct, color: 'oklch(0.56 0.12 265)' },
    { key: 'unplanned', label: 'Sprint-Unplanned', count: unplannedCount, pct: unplannedPct, color: 'oklch(0.76 0.16 70)', flame: true },
  ];

  // Priority breakdown
  const prioritySlices = useMemo(() => {
    const counts = new Map(PRIORITIES.map((p) => [p.value, 0]));
    let unset = 0;
    for (const item of items) {
      if (item.priority != null && counts.has(Number(item.priority))) {
        counts.set(Number(item.priority), counts.get(Number(item.priority)) + 1);
      } else {
        unset += 1;
      }
    }
    const list = PRIORITIES.map((p) => {
      const c = counts.get(p.value) || 0;
      return {
        key: `p${p.value}`,
        priority: p.value,
        label: p.label,
        hint: p.hint,
        count: c,
        pct: total > 0 ? Math.round((c / total) * 100) : 0,
        color: PRIORITY_COLORS[p.value],
      };
    });
    if (unset > 0) {
      list.push({
        key: 'unset',
        priority: null,
        label: 'Unset',
        hint: 'Unassigned',
        count: unset,
        pct: total > 0 ? Math.round((unset / total) * 100) : 0,
        color: PRIORITY_COLORS.unset,
      });
    }
    return list;
  }, [items, total]);

  // Simple unplanned fires count per teammate
  const memberFires = useMemo(() => {
    const rows = STANDUP_TEAM.map((m) => {
      const list = items.filter((i) => matchTeamMember(i, m));
      const unplanned = list.filter((i) => isSprintUnplanned(i)).length;
      return { member: m, unplanned, total: list.length };
    }).filter((r) => r.unplanned > 0);
    rows.sort((a, b) => b.unplanned - a.unplanned || b.total - a.total);
    return rows;
  }, [items]);
  const maxFires = Math.max(1, ...memberFires.map((r) => r.unplanned));

  // Top 10 Features in this sprint
  const topFeatures = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!item.featureId) continue;
      const cur = map.get(item.featureId) || { featureId: item.featureId, total: 0, done: 0, unplanned: 0 };
      cur.total += 1;
      if (standupColumnOf(item) === 'done') cur.done += 1;
      if (isSprintUnplanned(item)) cur.unplanned += 1;
      map.set(item.featureId, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total || b.done - a.done)
      .slice(0, 10)
      .map((row) => ({
        ...row,
        title: featureById.get(row.featureId)?.title || `Feature #${row.featureId}`,
        pct: Math.round((row.done / row.total) * 100),
      }));
  }, [items, featureById]);
  const maxFeatureTotal = Math.max(1, ...topFeatures.map((f) => f.total));

  const urgentCount = (prioritySlices.find((s) => s.priority === 0)?.count || 0) + (prioritySlices.find((s) => s.priority === 1)?.count || 0);
  const onPace = sprintTiming ? closedPct >= sprintTiming.elapsedPct : true;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 pb-6">
        {/* Tier 1: Sprint Pace & Completion */}
        <section aria-label="Sprint completion progress">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{closedPct}%</span>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                closed ({doneCount} of {total} tickets) · {activeCount} in progress · {todoCount} to do
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
              {carriedCount > 0 && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
                  {carriedCount} carried 3+ wks
                </span>
              )}
              {stalledCount > 0 && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
                  {stalledCount} stalled 7+ days
                </span>
              )}
              {sprintTiming && (
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 font-medium',
                    onPace
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200'
                      : 'bg-amber-50 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
                  )}
                >
                  {onPace ? 'On pace' : 'Behind sprint clock'}
                </span>
              )}
            </div>
          </div>

          <div className="relative mt-4 mb-7">
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                  onPace ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-primary',
                )}
                style={{ width: `${ready ? closedPct : 0}%` }}
              />
            </div>

            {sprintTiming && (
              <div
                className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col items-center transition-[left] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{ left: `${ready ? Math.min(96, Math.max(4, sprintTiming.elapsedPct)) : 4}%` }}
              >
                <span aria-hidden className="-mt-1 h-5 w-0.5 rounded-full bg-foreground" />
                <svg viewBox="0 0 10 6" className="mt-0.5 size-2.5 fill-foreground text-foreground" aria-hidden="true">
                  <path d="M5 0L10 6H0L5 0Z" />
                </svg>
                <span className="mt-0.5 rounded bg-foreground px-1.5 py-0.5 text-[10.5px] leading-none font-medium whitespace-nowrap text-background tabular-nums shadow-xs">
                  {sprintTiming.remainingPct}% workdays left ({sprintTiming.remainingDays}d)
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Tier 2: Bounded Donut Charts (Interruptions vs Planned, and Priority P0-P4) */}
        <div className="grid grid-cols-1 gap-6 border-t border-border/60 pt-6 md:grid-cols-2 md:gap-8">
          <section aria-label="Planned vs Unplanned" className="flex flex-col gap-3">
            <div>
              <h3 className="text-xs font-semibold text-foreground">Planned vs. Unplanned ratio</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Planned sprint tickets compared against unplanned fires.
              </p>
            </div>
            <div className="flex items-center gap-5 pt-1">
              <DonutChart
                slices={scopeSlices}
                ready={ready}
                centerValue={`${unplannedPct}%`}
                centerLabel="unplanned"
              />
              <ul className="flex w-full max-w-[14.5rem] flex-col gap-2 text-xs">
                {scopeSlices.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 font-medium text-foreground/90">
                      {s.flame ? (
                        <Flame className="size-3.5 shrink-0 fill-current text-amber-600 dark:text-amber-300" />
                      ) : (
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                      )}
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                      <strong className="font-semibold text-foreground">{s.count}</strong> ({s.pct}%)
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 text-muted-foreground">
                  <span>Total sprint tickets</span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">{total}</span>
                </li>
              </ul>
            </div>
          </section>

          <section aria-label="Tickets by priority" className="flex flex-col gap-3">
            <div>
              <h3 className="text-xs font-semibold text-foreground">Priority distribution (P0–P4)</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Urgency split across the team&apos;s current sprint workload.
              </p>
            </div>
            <div className="flex items-center gap-5 pt-1">
              <DonutChart
                slices={prioritySlices}
                ready={ready}
                centerValue={urgentCount}
                centerLabel="P0 / P1 urgent"
              />
              <ul className="flex w-full max-w-[14.5rem] flex-col gap-1.5 text-xs">
                {prioritySlices.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.priority != null ? (
                        <PriorityPill priority={s.priority} compact />
                      ) : (
                        <span className="font-medium text-muted-foreground">Unset</span>
                      )}
                      <span className="truncate text-muted-foreground">{s.hint}</span>
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                      <strong className="font-semibold text-foreground">{s.count}</strong> ({s.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* Tier 3: Unplanned Fires by Teammate & Top Sprint Initiatives */}
        <div className="grid grid-cols-1 gap-6 border-t border-border/60 pt-6 md:grid-cols-2 md:gap-8">
          <section aria-label="Unplanned fires by teammate" className="flex flex-col gap-3">
            <div>
              <h3 className="text-xs font-semibold text-foreground">Unplanned fires by teammate</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Number of Sprint-Unplanned tickets per person in this sprint.
              </p>
            </div>
            {memberFires.length === 0 ? (
              <p className="py-4 text-xs text-muted-foreground">No unplanned tickets in this sprint.</p>
            ) : (
              <ul className="flex flex-col gap-2.5 pt-1">
                {memberFires.map((row) => {
                  const barW = (row.unplanned / maxFires) * 100;
                  return (
                    <li key={row.member.id}>
                      <button
                        type="button"
                        onClick={() => onSelectPerson?.(row.member.id)}
                        className="group flex w-full flex-col gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground">
                            <MemberAvatar member={row.member} size="size-5" />
                            <span className="truncate group-hover:underline">{row.member.name}</span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-700 tabular-nums dark:text-amber-300">
                            <Flame className="size-3.5 fill-current text-amber-500 dark:text-amber-300" />
                            {row.unplanned}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/70">
                          <div
                            className="h-full rounded-full bg-amber-400 transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-amber-400"
                            style={{ width: `${ready ? barW : 0}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Top sprint initiatives" className="flex flex-col gap-3">
            <div>
              <h3 className="text-xs font-semibold text-foreground">Top sprint initiatives (by Feature)</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Features concentrating the most team tickets in this sprint and their completion.
              </p>
            </div>
            {topFeatures.length === 0 ? (
              <p className="py-4 text-xs text-muted-foreground">No parented Features in this sprint.</p>
            ) : (
              <ul className="flex flex-col gap-2.5 pt-1">
                {topFeatures.map((f) => {
                  const totalW = (f.total / maxFeatureTotal) * 100;
                  const doneW = (f.done / maxFeatureTotal) * 100;
                  return (
                    <li key={f.featureId}>
                      <button
                        type="button"
                        onClick={() => openItem(f.featureId)}
                        className="group flex w-full flex-col gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-medium text-foreground group-hover:underline">
                            {f.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            <strong className="font-semibold text-foreground">{f.done}/{f.total}</strong> done ({f.pct}%)
                          </span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-primary/25 transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                            style={{ width: `${ready ? totalW : 0}%` }}
                          />
                          <div
                            className="relative h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-emerald-400"
                            style={{ width: `${ready ? doneW : 0}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function StandUpView({
  data,
  standup,
  sprintPath,
  onSprintChange,
  onRefreshStandup,
  filters,
  pendingIds,
  onUpdate,
  active,
}) {
  const [teamOrder, setTeamOrder] = useState(() => STANDUP_TEAM);
  const [shuffleTick, setShuffleTick] = useState(0);
  const tabRefs = useRef(new Map());
  const prevTops = useRef(new Map());
  const [indicatorTop, setIndicatorTop] = useState(12);
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [selectedId, setSelectedId] = useState(() => {
    const meEmail = String(data?.me?.email || 'raulpo@microsoft.com').toLowerCase();
    const match = STANDUP_TEAM.find((m) => m.aliases.some((a) => a.toLowerCase() === meEmail));
    return match ? match.id : STANDUP_TEAM[0].id;
  });
  const [layoutMode, setLayoutMode] = useState('kanban');
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const isStatsSelected = selectedId === STATS_TAB_ID;
  const selectedMember = useMemo(
    () => teamOrder.find((m) => m.id === selectedId) || teamOrder[0],
    [teamOrder, selectedId],
  );
  const currentSprintObj = useMemo(
    () => (data?.sprints || []).find((s) => s.path === sprintPath) || null,
    [data?.sprints, sprintPath],
  );

  function shuffleTeam() {
    const tops = new Map();
    for (const [id, el] of tabRefs.current.entries()) {
      if (el) tops.set(id, el.getBoundingClientRect().top);
    }
    prevTops.current = tops;
    setShuffleTick((n) => n + 1);
    setTeamOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      if (next.length > 1 && next[0].id === prev[0].id) {
        [next[0], next[1]] = [next[1], next[0]];
      }
      setSelectedId(next[0].id);
      return next;
    });
  }

  useLayoutEffect(() => {
    if (!prevTops.current.size) return;
    const oldTops = prevTops.current;
    prevTops.current = new Map();
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    teamOrder.forEach((m, idx) => {
      const el = tabRefs.current.get(m.id);
      const oldTop = oldTops.get(m.id);
      if (!el || oldTop == null) return;
      const newTop = el.getBoundingClientRect().top;
      const dy = oldTop - newTop;
      const fanX = (idx % 2 === 0 ? -1 : 1) * Math.min(12, Math.max(4, Math.abs(dy) * 0.055));
      el.animate?.(
        [
          { transform: `translate3d(0, ${dy}px, 0) scale(1)` },
          { transform: `translate3d(${fanX}px, ${dy * 0.32}px, 0) scale(0.965)`, offset: 0.45 },
          { transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        {
          duration: 440 + idx * 14,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    });
  }, [teamOrder, shuffleTick]);

  // [ / ] or Up / Down arrows step through the vertical team member tabs (+ Stats tab at the end).
  useEffect(() => {
    if (!active) return;
    const navIds = [...teamOrder.map((m) => m.id), STATS_TAB_ID];
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || overlayOpen()) return;
      if (e.key === '[' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedId((cur) => {
          const idx = navIds.indexOf(cur);
          const nextIdx = (idx - 1 + navIds.length) % navIds.length;
          return navIds[nextIdx];
        });
      } else if (e.key === ']' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedId((cur) => {
          const idx = navIds.indexOf(cur);
          const nextIdx = (idx + 1) % navIds.length;
          return navIds[nextIdx];
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, teamOrder]);

  // Refresh Stand Up data in the background whenever entering Stand Up or switching to a person's tab.
  const refreshRef = useRef(onRefreshStandup);
  useLayoutEffect(() => {
    refreshRef.current = onRefreshStandup;
  });
  useEffect(() => {
    if (!active || !sprintPath) return;
    refreshRef.current?.();
  }, [active, selectedId, sprintPath]);

  const mergedFeatures = useMemo(() => {
    const map = new Map();
    for (const f of data?.features || []) map.set(f.id, f);
    for (const f of standup?.features || []) map.set(f.id, f);
    return [...map.values()];
  }, [data?.features, standup?.features]);

  const featureById = useMemo(() => new Map(mergedFeatures.map((f) => [f.id, f])), [mergedFeatures]);

  const allItems = standup?.items || [];
  const reasonsById = useMemo(
    () => new Map(allItems.map((i) => [i.id, attentionReasons(i, data, featureById)])),
    [allItems, data, featureById],
  );

  const unplannedByMember = useMemo(() => {
    return new Map(
      STANDUP_TEAM.map((m) => {
        const count = allItems.filter((i) => matchTeamMember(i, m) && isSprintUnplanned(i)).length;
        return [m.id, count];
      }),
    );
  }, [allItems]);

  const activeTabKey = isStatsSelected ? STATS_TAB_ID : selectedMember.id;
  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeTabKey);
    if (!el) return;
    setIndicatorTop(el.offsetTop);
    setIndicatorReady(true);
  }, [activeTabKey, teamOrder, active]);

  const memberItems = useMemo(() => {
    const withClosed = { ...filters, showClosed: true };
    return allItems
      .filter((i) => matchTeamMember(i, selectedMember) && matchesFilters(i, withClosed, featureById))
      .sort(sortStandupItems);
  }, [allItems, selectedMember, filters, featureById]);

  return (
    <div className="mx-4 mb-3 flex h-full min-h-0 flex-1 items-stretch rounded-2xl bg-muted/65 p-1.5 dark:bg-muted/40">
      {/* Vertical tab rail with fixed-height tabs and a constant-height sliding bg-card indicator */}
      <nav
        aria-label="Team members"
        role="tablist"
        aria-orientation="vertical"
        className="relative z-20 flex w-44 shrink-0 flex-col gap-0.5 py-3 pl-1"
      >
        {indicatorReady && (
          <div
            aria-hidden="true"
            style={{
              transform: `translate3d(0, ${indicatorTop}px, 0)`,
            }}
            className="pointer-events-none absolute top-0 right-0 left-1 h-11 rounded-l-2xl bg-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          >
            <TabCurveEars />
          </div>
        )}

        {teamOrder.map((m) => {
          const isSelected = !isStatsSelected && m.id === selectedMember.id;
          const unplanned = unplannedByMember.get(m.id) || 0;
          return (
            <button
              key={m.id}
              ref={(el) => {
                if (el) tabRefs.current.set(m.id, el);
                else tabRefs.current.delete(m.id);
              }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedId(m.id)}
              className={cn(
                'group relative z-10 flex h-11 shrink-0 items-center gap-2.5 pr-3 pl-2.5 text-left transition-colors focus-visible:outline-none',
                isSelected
                  ? 'rounded-l-2xl font-semibold text-foreground'
                  : 'mr-1.5 rounded-xl font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
              )}
            >
              <MemberAvatar member={m} selected={isSelected} size="size-7" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs leading-tight">{m.name}</span>
                {unplanned > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] leading-none font-medium text-amber-700 tabular-nums dark:text-amber-300">
                    <Flame className="size-2.5 shrink-0 fill-current text-amber-600 dark:text-amber-300" />
                    {unplanned} unplanned
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {/* Stats tab at the bottom of the vertical tab list */}
        <div className="my-1 mr-3 ml-2 border-t border-border/60" aria-hidden />
        <button
          ref={(el) => {
            if (el) tabRefs.current.set(STATS_TAB_ID, el);
            else tabRefs.current.delete(STATS_TAB_ID);
          }}
          type="button"
          role="tab"
          aria-selected={isStatsSelected}
          onClick={() => setSelectedId(STATS_TAB_ID)}
          className={cn(
            'group relative z-10 flex h-11 shrink-0 items-center gap-2.5 pr-3 pl-2.5 text-left transition-colors focus-visible:outline-none',
            isStatsSelected
              ? 'rounded-l-2xl font-semibold text-foreground'
              : 'mr-1.5 rounded-xl font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full transition-colors',
              isStatsSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-background/80 text-muted-foreground group-hover:bg-background group-hover:text-foreground',
            )}
          >
            <PieChart className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs leading-tight">Sprint stats</span>
          </div>
        </button>

        <button
          type="button"
          onClick={shuffleTeam}
          title="Shuffle speaker order"
          className="group/shuf relative z-10 mt-auto mr-2 ml-1 inline-flex h-8 items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 hover:border-foreground/25 hover:bg-background hover:text-foreground active:scale-95 focus-visible:outline-none"
        >
          <span key={shuffleTick} className={cn('inline-flex', shuffleTick > 0 && 'animate-shuffle-spin motion-reduce:animate-none')}>
            <Shuffle className="size-3.5 transition-transform duration-200 group-hover/shuf:rotate-12" />
          </span>
          <span>Shuffle</span>
        </button>
      </nav>

      {/* Active person or stats tab enclosure */}
      <div
        role="tabpanel"
        aria-label={isStatsSelected ? 'Sprint statistics' : `${selectedMember.fullName} sprint board`}
        className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-xl bg-card p-4"
      >
        {/* Minimal top-right controls inside the enclosure */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={sprintPath} onValueChange={onSprintChange}>
            <SelectTrigger size="sm" aria-label="Stand Up sprint" className="h-7! border-border/70 bg-transparent text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {(data?.sprints || []).map((s) => (
                <SelectItem key={s.path} value={s.path}>
                  Sprint {s.name}{' '}
                  <span className={s.timeFrame === 'current' ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                    · {s.timeFrame}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!isStatsSelected && (
            <div className="inline-flex h-7 items-center rounded-md bg-muted/60 p-0.5">
              <button
                type="button"
                onClick={() => setLayoutMode('board')}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors',
                  layoutMode === 'board' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="size-3.5" />
                Board
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('kanban')}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors',
                  layoutMode === 'kanban' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <KanbanSquare className="size-3.5" />
                Kanban
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('features')}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors',
                  layoutMode === 'features' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Layers className="size-3.5" />
                By Feature
              </button>
            </div>
          )}
        </div>

        {standup?.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not load Stand Up tickets: {standup.error}{' '}
            <button type="button" className="underline underline-offset-2" onClick={onRefreshStandup}>
              Try again
            </button>
          </div>
        )}

        {/* Main content area inside the tab enclosure */}
        {standup?.loading && !allItems.length ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-[repeat(3,minmax(0,20rem))]">
            {STANDUP_COLUMNS.map((col) => (
              <div key={col.key} className="flex flex-col gap-2.5">
                <Skeleton className="h-4 w-24" />
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        ) : isStatsSelected ? (
          <StandUpStatsView
            items={allItems}
            sprint={currentSprintObj}
            featureById={featureById}
            onSelectPerson={(id) => setSelectedId(id)}
          />
        ) : layoutMode === 'board' ? (
          <MemberWhiteboard
            member={selectedMember}
            items={memberItems}
            sprintPath={sprintPath}
            data={data}
            features={mergedFeatures}
            pendingIds={pendingIds}
            reasonsById={reasonsById}
            onUpdate={onUpdate}
            standupBoards={standup?.boards}
          />
        ) : layoutMode === 'features' ? (
          <StandUpFeatureColumns
            items={memberItems}
            data={data}
            features={mergedFeatures}
            featureById={featureById}
            pendingIds={pendingIds}
            reasonsById={reasonsById}
            onUpdate={onUpdate}
            memberName={selectedMember.name}
          />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto pt-1 md:grid-cols-[repeat(3,minmax(0,20.5rem))]">
            {STANDUP_COLUMNS.map((col) => {
              const colItems = memberItems.filter((i) => standupColumnOf(i) === col.key);
              const { icon: ColIcon, tone } = COLUMN_META[col.key];
              const isOver = overCol === col.key;
              return (
                <section
                  key={col.key}
                  aria-label={col.label}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overCol !== col.key) setOverCol(col.key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverCol(null);
                    const id = Number(e.dataTransfer.getData('text/plain')) || draggingId;
                    setDraggingId(null);
                    const item = memberItems.find((i) => i.id === id);
                    if (!item || standupColumnOf(item) === col.key) return;
                    onUpdate(item, { state: col.defaultState });
                  }}
                  className={cn(
                    'flex min-h-0 flex-col rounded-lg transition-colors',
                    isOver && 'bg-primary/5 ring-2 ring-primary/20',
                  )}
                >
                  <header className="mb-2.5 flex items-center gap-2 px-1">
                    <ColIcon className={cn('size-3.5 shrink-0', tone)} aria-hidden />
                    <h3 className="text-xs font-semibold text-foreground/90">{col.label}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{colItems.length}</span>
                  </header>
                  <div className="flex flex-col gap-2">
                    {colItems.length === 0 ? (
                      <p className="px-1 py-6 text-xs text-muted-foreground/70">No {col.label.toLowerCase()} tickets.</p>
                    ) : (
                      colItems.map((item) => (
                        <WorkItemCard
                          key={item.id}
                          item={item}
                          data={data}
                          features={mergedFeatures}
                          pending={pendingIds.has(item.id)}
                          reasons={reasonsById.get(item.id)}
                          onUpdate={onUpdate}
                          onDragStart={(id) => setDraggingId(id)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setOverCol(null);
                          }}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
