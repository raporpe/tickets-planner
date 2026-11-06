import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleCheckBig, Clock, Flame, KanbanSquare, Layers, LayoutGrid, Shuffle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HierarchyHover } from '@/components/hierarchy';
import { WorkItemCard } from '@/components/work-item';
import { api } from '@/api';
import { isDesktop } from '@/lib/desktop';
import { useDetail } from '@/lib/detail';
import { useBoardLayout } from '@/lib/board-layout';
import { useBoardNotes } from '@/lib/board-notes';
import { cn } from '@/lib/utils';
import {
  attentionReasons,
  columnRank,
  isDone,
  isSprintUnplanned,
  matchesFilters,
  matchTeamMember,
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

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));

function MemberWhiteboard({ member, items, sprintPath, data, features, pendingIds, onUpdate, standupBoards }) {
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
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

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

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    let trackpadPanUntil = 0;

    const onWheel = (e) => {
      const now = performance.now();
      const isPinch = e.ctrlKey || e.metaKey;
      if (!isPinch) {
        const looksLikeTrackpad =
          Math.abs(e.deltaX) > 0 ||
          (e.deltaMode === 0 && Math.abs(e.deltaY) < 50) ||
          (typeof e.wheelDeltaY === 'number' && Math.abs(e.wheelDeltaY) % 120 !== 0);
        if (looksLikeTrackpad || now < trackpadPanUntil) {
          trackpadPanUntil = now + 220;
          return;
        }
      }
      e.preventDefault();
      const oldZ = zoomRef.current;
      const factor = isPinch ? Math.exp(-e.deltaY * 0.01) : Math.exp(-Math.sign(e.deltaY) * 0.1);
      const newZ = clampZoom(oldZ * factor);
      if (newZ === oldZ) return;

      const r = el.getBoundingClientRect();
      const vx = e.clientX - r.left;
      const vy = e.clientY - r.top;
      const wx = (el.scrollLeft + vx) / oldZ;
      const wy = (el.scrollTop + vy) / oldZ;

      zoomRef.current = newZ;
      setZoom(newZ);
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, wx * newZ - vx);
        el.scrollTop = Math.max(0, wy * newZ - vy);
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
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
    () => [...items].sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || a.type.localeCompare(b.type) || b.id - a.id),
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
                        quiet
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

function StandUpFeatureColumns({ items, data, features, featureById, pendingIds, onUpdate, memberName }) {
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
                quiet
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </section>
      ))}
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
  const [selectedId, setSelectedId] = useState(() => {
    const meEmail = String(data?.me?.email || 'raulpo@microsoft.com').toLowerCase();
    const match = STANDUP_TEAM.find((m) => m.aliases.some((a) => a.toLowerCase() === meEmail));
    return match ? match.id : STANDUP_TEAM[0].id;
  });
  const [layoutMode, setLayoutMode] = useState('kanban');
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const selectedMember = useMemo(
    () => teamOrder.find((m) => m.id === selectedId) || teamOrder[0],
    [teamOrder, selectedId],
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

  // [ / ] or Up / Down arrows step through the vertical team member tabs in their current order.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || overlayOpen()) return;
      if (e.key === '[' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedId((cur) => {
          const idx = teamOrder.findIndex((m) => m.id === cur);
          const nextIdx = (idx - 1 + teamOrder.length) % teamOrder.length;
          return teamOrder[nextIdx].id;
        });
      } else if (e.key === ']' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedId((cur) => {
          const idx = teamOrder.findIndex((m) => m.id === cur);
          const nextIdx = (idx + 1) % teamOrder.length;
          return teamOrder[nextIdx].id;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, teamOrder]);

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

  const memberItems = useMemo(() => {
    const withClosed = { ...filters, showClosed: true };
    return allItems
      .filter((i) => matchTeamMember(i, selectedMember) && matchesFilters(i, withClosed, featureById))
      .sort(sortStandupItems);
  }, [allItems, selectedMember, filters, featureById]);

  return (
    <div className="flex h-full min-h-0 flex-1 items-stretch px-4 pb-3">
      {/* Vertical Chrome-like tab strip: no borders on inactive people, active tab overlaps enclosure border seamlessly */}
      <nav
        aria-label="Team members"
        role="tablist"
        aria-orientation="vertical"
        className="z-20 flex w-44 shrink-0 flex-col gap-0.5 pt-2 pb-1"
      >
        {teamOrder.map((m) => {
          const isSelected = m.id === selectedMember.id;
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
                'group relative flex items-center gap-2.5 rounded-l-xl rounded-r-none py-2 pl-2.5 text-left transition-colors focus-visible:outline-none',
                isSelected
                  ? 'z-20 -mr-[2px] border border-r-0 border-border bg-card pr-3.5 font-semibold text-foreground'
                  : 'border border-transparent bg-transparent pr-2.5 font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <MemberAvatar member={m} selected={isSelected} size="size-7" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs leading-tight">{m.name}</span>
                {unplanned > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-[10.5px] leading-tight font-medium text-amber-700 tabular-nums dark:text-amber-300">
                    <Flame className="size-2.5 shrink-0 fill-current text-amber-600 dark:text-amber-300" />
                    {unplanned} unplanned
                  </span>
                )}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={shuffleTeam}
          title="Shuffle speaker order"
          className="group/shuf relative mt-auto mr-2 inline-flex h-8 items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-border/70 bg-transparent px-3 text-xs font-medium text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 hover:border-foreground/25 hover:bg-muted/60 hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span key={shuffleTick} className={cn('inline-flex', shuffleTick > 0 && 'animate-shuffle-spin motion-reduce:animate-none')}>
            <Shuffle className="size-3.5 transition-transform duration-200 group-hover/shuf:rotate-12" />
          </span>
          <span>Shuffle</span>
        </button>
      </nav>

      {/* Active person tab enclosure */}
      <div
        role="tabpanel"
        aria-label={`${selectedMember.fullName} sprint board`}
        className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-4"
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
                  Sprint {s.name} <span className="text-muted-foreground">· {s.timeFrame}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
        </div>

        {standup?.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not load Stand Up tickets: {standup.error}{' '}
            <button type="button" className="underline underline-offset-2" onClick={onRefreshStandup}>
              Try again
            </button>
          </div>
        )}

        {/* Main content area inside the person's tab enclosure */}
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
                          quiet
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
