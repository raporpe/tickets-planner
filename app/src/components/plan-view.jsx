import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, ChevronUp, Inbox, History, LayoutGrid, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { WorkItemCard } from '@/components/work-item';
import { HierarchyHover } from '@/components/hierarchy';
import { useBoardLayout } from '@/lib/board-layout';
import { useBoardNotes } from '@/lib/board-notes';
import { buildColumns, canBeInSprint, columnKeyOf, isDone } from '@/lib/planning';

const CARD_W = 272;
const PAD = 12;
const GAP = 16; // 272 + 16 = 288 (8 * 36px grid units)
const SNAP_X = 36;
const SNAP_Y = 18;
const EST_H = 126;
const NOTE_W = 288;
const SLACK = 180; // free space below the lowest card, so there is always room to drop
const SLACK_X = 320; // and to the right of the rightmost one, so the board can grow sideways
// Older saves stored x as a fraction of the board's free width; read them against at least this width
// so a narrower window scrolls instead of squeezing cards on top of each other.
const LEGACY_W = 1600;
const legacyUsable = (viewW, w) => Math.max(0, Math.max(viewW, LEGACY_W) - w - PAD * 2);
const NO_DRAG = 'input, textarea, select, [role="combobox"], [aria-haspopup], [data-no-drag]';
const ORDER = (a, b) => Number(isDone(a)) - Number(isDone(b)) || a.type.localeCompare(b.type) || b.id - a.id;

const snapX = (px) => Math.max(PAD, PAD + Math.round((px - PAD) / SNAP_X) * SNAP_X);
const snapY = (py) => Math.max(PAD, PAD + Math.round((py - PAD) / SNAP_Y) * SNAP_Y);

/**
 * Where each card sits on the whiteboard. Cards you have moved keep their spot (snapped to the 36×18 grid);
 * the rest flow into evenly spread grid lanes below them, so new arrivals never land on top of a group you made.
 */
function layoutBoard(list, colKey, viewW, heights, layout) {
  const lanes = Math.max(1, Math.floor((viewW - PAD * 2 + GAP) / (CARD_W + GAP)));
  const legacy = legacyUsable(viewW, CARD_W);
  const pos = new Map();
  let bottom = 0;
  let right = 0;
  const free = [];
  for (const item of list) {
    const s = layout[item.id];
    if (s?.col === colKey) {
      const rawX = s.px ?? PAD + (s.x ?? 0) * legacy;
      const p = { x: snapX(rawX), y: snapY(s.y ?? PAD), z: s.z ?? 1 };
      pos.set(item.id, p);
      bottom = Math.max(bottom, p.y + (heights[item.id] ?? EST_H));
      right = Math.max(right, p.x + CARD_W);
    } else free.push(item);
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
  return { pos, cardW: CARD_W, right, height: Math.max(bottom, ...laneY) + SLACK };
}

function ColumnTitle({ col }) {
  const Icon = col.kind === 'backlog' ? Inbox : col.kind === 'other' ? History : CalendarClock;
  return (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-sm font-semibold">{col.title}</h2>
          {col.sprint?.timeFrame === 'current' && <Badge className="h-4 px-1.5 text-[10px]">In progress</Badge>}
          {col.sprint?.timeFrame === 'future' && col.next && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Next</Badge>}
          {col.sprint && !col.sprint.subscribed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="h-4 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200">
                  Not on team
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Not selected in team settings, so it won't show on the team's sprint views. Ask the team admin to add it.</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{col.subtitle}</p>
      </div>
    </>
  );
}

function Count({ items }) {
  const open = items.filter((i) => !isDone(i)).length;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {open}
      {items.length !== open && <span className="opacity-60"> / {items.length}</span>}
    </span>
  );
}

/**
 * One card on the plan. Memoized with primitive/stable props so starting a drag or crossing into another
 * section only re-renders the section frames, not every card.
 */
const PlanCard = memo(function PlanCard({ item, data, features, pending, reasons, onUpdate, onStart, register, hidden, settle, free, x, y, w, z, animate }) {
  const ref = useCallback((el) => register(item.id, el), [register, item.id]);
  return (
    <div
      ref={ref}
      onPointerDown={(e) => onStart(e, item)}
      className={cn(
        free ? 'absolute' : 'select-none',
        'touch-none',
        free && animate && 'transition-[left,top] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        hidden && 'opacity-0',
      )}
      style={free ? { left: x, top: y, width: w, zIndex: z } : undefined}
    >
      {/* Re-keyed on every drop so the settle animation replays even when the same card lands twice. */}
      <div key={settle} className={cn(settle > 0 && 'animate-card-settle motion-reduce:animate-none')}>
        <HierarchyHover item={item}>
          <WorkItemCard item={item} data={data} features={features} pending={pending} reasons={reasons} onUpdate={onUpdate} grabbable />
        </HierarchyHover>
      </div>
    </div>
  );
});

/**
 * A free-floating note on the whiteboard: plain text you can drop next to a group of cards.
 * Drag to move, double-click to edit, empty it (or press ×) to delete.
 */
function BoardNote({ id, note, left, top, zoom = 1, editing, onEdit, onChange, onRemove, toPos }) {
  const el = useRef(null);
  const startMove = (e) => {
    if (editing || e.button !== 0 || e.target.closest('button')) return;
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / zoom;
      const dy = (ev.clientY - sy) / zoom;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      el.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (el.current) el.current.style.transform = '';
      if (moved && ev.type === 'pointerup') {
        onChange(id, toPos(left + (ev.clientX - sx) / zoom, top + (ev.clientY - sy) / zoom));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const finish = (e) => {
    if (!e.currentTarget.value.trim()) onRemove(id);
    onEdit(null);
  };
  return (
    <div
      ref={el}
      data-note
      onPointerDown={startMove}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit(id);
      }}
      className={cn('group absolute z-[5000] touch-none', !editing && 'cursor-grab active:cursor-grabbing')}
      style={{ left, top, maxWidth: NOTE_W }}
    >
      {editing ? (
        <textarea
          autoFocus
          rows={1}
          aria-label="Note"
          placeholder="Write a note…"
          defaultValue={note.text}
          onChange={(e) => onChange(id, { text: e.target.value })}
          onBlur={finish}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) e.currentTarget.blur();
          }}
          className="block min-w-40 resize-none rounded-md border-0 bg-background/90 px-2 py-1 text-sm leading-snug font-medium text-foreground shadow-sm ring-2 ring-ring outline-none [field-sizing:content] placeholder:text-muted-foreground"
          style={{ maxWidth: NOTE_W }}
        />
      ) : (
        <>
          <p className="rounded-md bg-background/60 px-2 py-1 text-sm leading-snug font-medium break-words whitespace-pre-wrap text-foreground/80 transition-[background-color,box-shadow] group-hover:bg-background/90 group-hover:ring-1 group-hover:ring-border">
            {note.text}
          </p>
          <button
            type="button"
            aria-label="Delete note"
            onClick={() => onRemove(id)}
            className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </div>
  );
}

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));
const ghostTransform = (x, y, z = 1) => `translate3d(${x}px, ${y}px, 0) scale(${z})`;

export function PlanView({ data, items, features, pendingIds, reasonsById, onUpdate }) {
  const { layout, place, clearColumn } = useBoardLayout();
  const { notes, addNote, updateNote, removeNote } = useBoardNotes();
  const [editingNote, setEditingNote] = useState(null);
  const [drag, setDrag] = useState(null);
  const [snapPreview, setSnapPreview] = useState(null);
  const [glide, setGlide] = useState(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const backlogEl = useRef(null);
  const peekTimer = useRef(0);
  const [heights, setHeights] = useState({});
  const [boardWidth, setBoardWidth] = useState(CARD_W + PAD * 2);
  const board = useRef(null);
  const cardEls = useRef(new Map());
  const resizer = useRef(null);
  const computed = useRef(null);
  const lastDrop = useRef(null);
  const drops = useRef(0);
  const ghost = useRef(null);

  const { columns, byCol } = useMemo(() => {
    const cols = buildColumns(data);
    const map = new Map(cols.map((c) => [c.key, []]));
    items.forEach((i) => map.get(columnKeyOf(i, data))?.push(i));
    map.forEach((l) => l.sort(ORDER));
    return { columns: cols, byCol: map };
  }, [data, items]);

  const backlog = columns.find((c) => c.kind === 'backlog');
  // The whiteboard shows one sprint: the one in progress by default, and ‹ › step through the others.
  const sprints = data.sprints;
  const firstFuture = sprints.find((s) => s.timeFrame === 'future');
  const defaultSprint = sprints.find((s) => s.timeFrame === 'current') ?? firstFuture ?? sprints[sprints.length - 1];
  const [boardPath, setBoardPath] = useState(null);
  const boardIdx = Math.max(0, sprints.findIndex((s) => s.path === (boardPath ?? defaultSprint?.path)));
  const boardSprint = sprints[boardIdx];
  const laterSprint = sprints[boardIdx + 1];
  const next = boardSprint && { ...columns.find((c) => c.key === boardSprint.path), next: boardSprint === firstFuture };
  const step = (d) => {
    const s = sprints[boardIdx + d];
    if (s) setBoardPath(s.path);
  };
  // The sprint after the whiteboard's sits in a side drawer, so work can be pushed one sprint further.
  const later = laterSprint && columns.find((c) => c.key === laterSprint.path);
  // Everything that isn't the backlog or one of those two lives in the bottom drawer: the sprint in progress
  // first (when the whiteboard shows another one), then any other sprint or legacy iteration that still holds tickets.
  const drawerCols = columns
    .filter((c) => c !== backlog && c.key !== next?.key && c.key !== later?.key)
    .filter((c) => c.sprint?.timeFrame === 'current' || byCol.get(c.key).length);
  const current = drawerCols.find((c) => c.sprint?.timeFrame === 'current');
  const drawerCount = drawerCols.reduce((n, c) => n + byCol.get(c.key).filter((i) => !isDone(i)).length, 0);
  const allCols = [backlog, next, later, ...drawerCols].filter(Boolean);

  useEffect(() => {
    if (!board.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBoardWidth(Math.round(e.contentRect.width)));
    ro.observe(board.current);
    return () => ro.disconnect();
  }, [next?.key]);

  // Trackpad two-finger swipe pans; trackpad pinch (ctrlKey) and physical mouse wheel zoom centered on cursor.
  useEffect(() => {
    const el = board.current;
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
          return; // allow native two-finger pan
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
  }, [next?.key]);

  useEffect(() => {
    if (!drawerOpen && !sideOpen && !backlogOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || drag) return;
      setDrawerOpen(false);
      setSideOpen(false);
      setBacklogOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, sideOpen, backlogOpen, drag]);

  // The backlog peeks out on hover. A short delay on the way in ignores the pointer just passing by;
  // a slightly longer one on the way out forgives overshooting the edge.
  const peekBacklog = (open, delay) => {
    clearTimeout(peekTimer.current);
    const settle = () => {
      const el = backlogEl.current;
      // Keep it open while a menu from one of its cards is showing, or the keyboard is working inside it.
      if (!open && el && (el.matches(':hover') || el.querySelector(':focus-visible') || document.querySelector('[data-radix-popper-content-wrapper]'))) {
        peekTimer.current = setTimeout(settle, 250);
        return;
      }
      setBacklogOpen(open);
    };
    peekTimer.current = setTimeout(settle, delay);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);

  // Card heights feed the whiteboard layout. A ResizeObserver reports them without forcing a layout on every render.
  useEffect(() => {
    const ro = new ResizeObserver((entries) =>
      setHeights((prev) => {
        let next = null;
        for (const e of entries) {
          const id = e.target.dataset.cardId;
          const h = e.target.offsetHeight;
          if (id && prev[id] !== h) (next ??= { ...prev })[id] = h;
        }
        return next ?? prev;
      }),
    );
    cardEls.current.forEach((el) => ro.observe(el));
    resizer.current = ro;
    return () => ro.disconnect();
  }, []);
  const register = useCallback((id, el) => {
    el.dataset.cardId = id;
    cardEls.current.set(id, el);
    resizer.current?.observe(el);
    return () => {
      resizer.current?.unobserve(el);
      if (cardEls.current.get(id) === el) cardEls.current.delete(id);
    };
  }, []);

  const droppableFor = (col, item) => col.kind === 'backlog' || (col.kind === 'sprint' && canBeInSprint(item.type));
  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]')?.dataset.drop ?? null;

  const drop = (d, x, y) => {
    const item = items.find((i) => i.id === d.id);
    const col = allCols.find((c) => c.key === targetAt(x, y));
    if (!item || !col || !droppableFor(col, item)) return;
    if (col.key === next?.key && computed.current) {
      const el = board.current;
      const r = el.getBoundingClientRect();
      const z = d.z || zoomRef.current;
      const { pos } = computed.current;
      const rawPx = Math.max(PAD, Math.round((x - r.left + el.scrollLeft) / z - d.dx));
      const rawPy = Math.max(PAD, Math.round((y - r.top + el.scrollTop) / z - d.dy));
      const px = snapX(rawPx);
      const py = snapY(rawPy);
      // Freeze everything else on the board where it is now, so nothing shuffles around the drop.
      const entries = {};
      pos.forEach((p, id) => {
        if (id !== d.id) entries[id] = { col: col.key, px: Math.round(p.x), y: p.y, z: p.z };
      });
      const topZ = Math.max(0, ...Object.values(layout).map((v) => v.z ?? 0));
      entries[d.id] = { col: col.key, px, y: py, z: topZ + 1 };
      // Seed at the exact release position for 1 frame so CSS transition glides softly into the snapped grid cell
      setGlide({ id: d.id, x: rawPx, y: rawPy, animate: false });
      place(entries);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setGlide(null);
        });
      });
    }
    if (item.iterationPath !== col.path) onUpdate(item, { iterationPath: col.path });
  };

  const startDrag = (e, item) => {
    if (e.button !== 0 || pendingIds.has(item.id) || e.target.closest(NO_DRAG)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const onBoard = board.current?.contains(e.currentTarget);
    const z = onBoard ? zoomRef.current : 1;
    const d = {
      id: item.id,
      dx: (e.clientX - rect.left) / z,
      dy: (e.clientY - rect.top) / z,
      w: onBoard ? CARD_W : rect.width,
      z,
      sx: e.clientX,
      sy: e.clientY,
    };
    let started = false;
    let over;
    let frame = 0;
    let last = null;
    // Pointer moves only touch the floating card's transform; React re-renders just when the drop target or grid cell changes.
    const paint = () => {
      frame = 0;
      const curZ = zoomRef.current;
      if (ghost.current) {
        ghost.current.style.transform = ghostTransform(last.clientX - d.dx * curZ, last.clientY - d.dy * curZ, curZ);
      }
      const o = targetAt(last.clientX, last.clientY);
      if (o !== over) {
        over = o;
        setDrag((cur) => cur && { ...cur, over: o });
      }
      if (o === next?.key && board.current) {
        const el = board.current;
        const r = el.getBoundingClientRect();
        const rawPx = Math.max(PAD, Math.round((last.clientX - r.left + el.scrollLeft) / curZ - d.dx));
        const rawPy = Math.max(PAD, Math.round((last.clientY - r.top + el.scrollTop) / curZ - d.dy));
        const gx = snapX(rawPx);
        const gy = snapY(rawPy);
        setSnapPreview((prev) => (prev && prev.x === gx && prev.y === gy ? prev : { x: gx, y: gy, h: heights[d.id] ?? EST_H }));
      } else {
        setSnapPreview((prev) => (prev ? null : prev));
      }
    };
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
        started = true;
        window.getSelection()?.removeAllRanges();
        document.body.style.cursor = 'grabbing';
        setDrag({ ...d, x: ev.clientX, y: ev.clientY, over: null });
      }
      ev.preventDefault();
      last = ev;
      frame ||= requestAnimationFrame(paint);
    };
    const up = (ev) => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      setSnapPreview(null);
      if (!started) return;
      lastDrop.current = d.id;
      drops.current += 1;
      // The pointer-up ends in a click on the card (or its ADO link); swallow it so a move doesn't open anything.
      const swallow = (c) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => {
        window.removeEventListener('click', swallow, { capture: true });
        setDrag(null);
      }, 0);
      if (ev.type === 'pointerup') drop(d, ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Cards get a stable handler that always calls the latest startDrag, so they never re-render because of it.
  const startRef = useRef(startDrag);
  useLayoutEffect(() => {
    startRef.current = startDrag;
  });
  const onStart = useCallback((e, item) => startRef.current(e, item), []);

  const dragged = drag && items.find((i) => i.id === drag.id);
  const zoneState = (col) => {
    if (!dragged) return null;
    if (!droppableFor(col, dragged)) return 'blocked';
    return drag.over === col.key && columnKeyOf(dragged, data) !== col.key ? 'over' : null;
  };
  const zoneClass = (col) => ({ blocked: 'opacity-50', over: 'border-primary bg-primary/10' })[zoneState(col)];

  const cardProps = (item) => ({ item, data, features, pending: pendingIds.has(item.id), reasons: reasonsById.get(item.id), onUpdate });
  const listCard = (item) => <PlanCard key={item.id} {...cardProps(item)} onStart={onStart} register={register} hidden={drag?.id === item.id} settle={lastDrop.current === item.id ? drops.current : 0} />;

  const nextList = next ? byCol.get(next.key) : [];
  const placed = useMemo(() => next && layoutBoard(nextList, next.key, boardWidth, heights, layout), [nextList, next?.key, boardWidth, heights, layout]);
  computed.current = placed;

  const noteLegacy = legacyUsable(boardWidth, NOTE_W);
  const noteLeft = (n) => snapX(n.px ?? PAD + (n.x ?? 0) * noteLegacy);
  const notePos = useCallback((px, py) => ({ px: snapX(px), y: snapY(py) }), []);
  const boardNotes = next ? Object.entries(notes).filter(([, n]) => n.col === next.key) : [];
  const boardHeight = placed ? Math.max(placed.height, ...boardNotes.map(([, n]) => n.y + 120 + SLACK)) : 0;
  const canvasWidth = placed ? Math.max(boardWidth, placed.right + SLACK_X, ...boardNotes.map(([, n]) => noteLeft(n) + NOTE_W + SLACK_X)) : 0;
  const addNoteAt = (e) => {
    if (e.target.closest('[data-card-id], [data-note]')) return;
    const el = board.current;
    const r = el.getBoundingClientRect();
    const z = zoomRef.current;
    setEditingNote(
      addNote({
        col: next.key,
        ...notePos((e.clientX - r.left + el.scrollLeft) / z - 8, (e.clientY - r.top + el.scrollTop) / z - 14),
      }),
    );
  };

  // Dragging empty space pans the whiteboard, like a canvas.
  const startPan = (e) => {
    if (e.button !== 0 || e.target.closest('[data-card-id], [data-note]')) return;
    const el = board.current;
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

  return (
    // While dragging, cards ignore the pointer so hovering them costs nothing (and drop targets resolve straight to the column).
    <div className={cn('relative h-full overflow-hidden', drag && '[&_article]:pointer-events-none')}>
      <div className={cn('flex h-full gap-3 pr-4 pb-14 pl-[3.75rem]', later && 'pr-14')}>
        {/* Next sprint: the whiteboard, where cards sit wherever you leave them. */}
        {next ? (
          <section
            aria-label={next.title}
            data-drop={next.key}
            className={cn(
              'flex h-full min-w-[19rem] flex-1 flex-col rounded-lg border bg-muted/40 transition-[opacity,border-color,background-color]',
              zoneClass(next),
            )}
          >
            <header className="flex items-start gap-2 border-b px-3 py-2.5">
              <div className="-ml-1 flex shrink-0 items-center">
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" onClick={() => step(-1)} disabled={boardIdx === 0} aria-label="Previous sprint" title="Previous sprint">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" onClick={() => step(1)} disabled={boardIdx >= sprints.length - 1} aria-label="Next sprint" title="Next sprint">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <ColumnTitle col={next} />
              <div className="ml-auto flex items-center gap-1">
                {Math.round(zoom * 100) !== 100 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground tabular-nums"
                    title="Reset zoom to 100%"
                    onClick={() => {
                      zoomRef.current = 1;
                      setZoom(1);
                    }}
                  >
                    {Math.round(zoom * 100)}%
                  </Button>
                )}
                {boardPath && boardPath !== defaultSprint?.path && (
                  <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setBoardPath(null)}>
                    Back to {defaultSprint.timeFrame === 'current' ? 'current' : defaultSprint.name}
                  </Button>
                )}
                {nextList.some((i) => layout[i.id]?.col === next.key) && (
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label={`Tidy up ${next.title}`}>
                            <LayoutGrid className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Tidy up: forget where you placed these cards</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Tidy up {next.title}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your ordering will be removed and you won't be able to go back.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => clearColumn(next.key)}>
                          Tidy up
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Count items={nextList} />
              </div>
            </header>
            <div ref={board} className="whiteboard-scroll relative min-h-0 flex-1 overflow-auto">
              <div
                className="whiteboard-dots relative isolate min-h-full cursor-grab select-none"
                style={{
                  height: Math.ceil(boardHeight * zoom),
                  width: canvasWidth ? Math.ceil(canvasWidth * zoom) : undefined,
                  backgroundSize: `${18 * zoom}px ${18 * zoom}px`,
                }}
                onPointerDown={startPan}
                onDoubleClick={addNoteAt}
              >
                <div
                  className="relative origin-top-left"
                  style={{
                    height: boardHeight,
                    width: canvasWidth || undefined,
                    transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                  }}
                >
                  {nextList.length === 0 && boardNotes.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing planned yet. Drag cards here, or double-click to write a note.</p>
                  )}
                  {boardNotes.map(([id, n]) => (
                    <BoardNote
                      key={id}
                      id={id}
                      note={n}
                      left={noteLeft(n)}
                      top={n.y}
                      zoom={zoom}
                      editing={editingNote === id}
                      onEdit={setEditingNote}
                      onChange={updateNote}
                      onRemove={removeNote}
                      toPos={notePos}
                    />
                  ))}
                  {snapPreview && (
                    <div
                      aria-hidden
                      style={{ left: snapPreview.x, top: snapPreview.y, width: placed.cardW, height: snapPreview.h }}
                      className="pointer-events-none absolute rounded-lg border border-dashed border-primary/40 bg-primary/[0.04] transition-[left,top,height] duration-120 ease-out"
                    />
                  )}
                  {nextList.map((item) => {
                    const p = placed.pos.get(item.id);
                    const isGliding = glide?.id === item.id;
                    return (
                      <PlanCard
                        key={item.id}
                        {...cardProps(item)}
                        onStart={onStart}
                        register={register}
                        hidden={drag?.id === item.id}
                        settle={lastDrop.current === item.id ? drops.current : 0}
                        free
                        x={isGliding ? glide.x : p.x}
                        y={isGliding ? glide.y : p.y}
                        w={placed.cardW}
                        z={p.z}
                        animate={!isGliding}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex h-full flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No upcoming sprint under {data.backlogPath}.
          </section>
        )}
      </div>

      {/* Backlog: a rail on the left that slides out over the whiteboard while you hover it. */}
      <div
        ref={backlogEl}
        onPointerEnter={() => peekBacklog(true, 70)}
        onPointerLeave={() => peekBacklog(false, 220)}
        className={cn(
          'absolute top-0 bottom-14 left-0 z-20 flex w-[min(22rem,85vw)] rounded-r-xl border border-l-0 bg-card/95 backdrop-blur-sm will-change-transform',
          'transition-[translate,box-shadow] motion-reduce:transition-none',
          backlogOpen
            ? 'shadow-[10px_0_30px_-12px_oklch(0.35_0.04_60/0.3)] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] dark:shadow-[12px_0_30px_-10px_oklch(0_0_0/0.6)]'
            : '-translate-x-[calc(100%-2.75rem)] shadow-none duration-[170ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
        )}
      >
        <section
          id="backlog-panel"
          inert={!backlogOpen}
          aria-label={backlog.title}
          data-drop={backlog.key}
          className={cn(
            'my-3 ml-3 flex min-w-0 flex-1 flex-col rounded-lg border bg-muted/40 transition-[opacity,translate,border-color,background-color] motion-reduce:transition-none',
            backlogOpen ? 'delay-[40ms] duration-200 ease-out' : 'translate-x-[-0.75rem] opacity-0 duration-100',
            zoneClass(backlog),
          )}
        >
          <header className="flex items-start gap-2 border-b px-3 py-2.5">
            <ColumnTitle col={backlog} />
            <span className="ml-auto">
              <Count items={byCol.get(backlog.key)} />
            </span>
          </header>
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
            {byCol.get(backlog.key).length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Empty.</p>}
            {byCol.get(backlog.key).map(listCard)}
          </div>
        </section>
        <button
          type="button"
          aria-expanded={backlogOpen}
          aria-controls="backlog-panel"
          aria-label={`${backlogOpen ? 'Hide' : 'Show'} ${backlog.title}`}
          onClick={() => {
            clearTimeout(peekTimer.current);
            setBacklogOpen((o) => !o);
          }}
          data-drop={backlog.key}
          className={cn(
            'group relative flex w-11 shrink-0 flex-col items-center gap-2 rounded-r-xl py-3 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            zoneState(backlog) === 'over' && 'bg-primary/10',
          )}
        >
          <span aria-hidden className="absolute top-1/2 right-1.5 h-9 w-1 -translate-y-1/2 rounded-full bg-foreground/15 transition-[height,background-color] duration-150 group-hover:h-12 group-hover:bg-foreground/25" />
          <ChevronRight className={cn('size-4 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]', backlogOpen && 'rotate-180')} />
          <Inbox className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold [writing-mode:vertical-rl]">{backlog.title}</span>
          <span className="text-xs text-muted-foreground tabular-nums [writing-mode:vertical-rl]">{byCol.get(backlog.key).filter((i) => !isDone(i)).length} open</span>
        </button>
      </div>

      {/* The sprint after next: a drawer on the right that slides in to take tickets you push one sprint further. */}
      {later && (
        <div
          className={cn(
            'absolute top-0 right-0 bottom-14 z-20 flex w-[min(24rem,40vw)] rounded-l-xl border border-r-0 bg-card/95 shadow-[-10px_0_30px_-12px_oklch(0.35_0.04_60/0.25)] backdrop-blur-sm dark:shadow-[-12px_0_30px_-10px_oklch(0_0_0/0.6)]',
            'transition-transform duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none',
            !sideOpen && 'translate-x-[calc(100%-2.75rem)] ease-[cubic-bezier(0.5,0,0.2,1)] duration-300',
          )}
        >
          <button
            type="button"
            aria-expanded={sideOpen}
            aria-controls="later-drawer"
            aria-label={`${sideOpen ? 'Hide' : 'Show'} ${later.title}`}
            onClick={() => setSideOpen((o) => !o)}
            data-drop={later.key}
            className={cn(
              'group relative flex w-11 shrink-0 flex-col items-center gap-2 rounded-l-xl py-3 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              zoneState(later) === 'over' && 'bg-primary/10',
              zoneState(later) === 'blocked' && 'opacity-50',
            )}
          >
            <span aria-hidden className="absolute top-1/2 left-1.5 h-9 w-1 -translate-y-1/2 rounded-full bg-foreground/15 transition-[height,background-color] group-hover:h-12 group-hover:bg-foreground/25" />
            <ChevronLeft className={cn('size-4 text-muted-foreground transition-transform duration-300', sideOpen && 'rotate-180')} />
            <CalendarPlus className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold [writing-mode:vertical-rl]">{later.title}</span>
            <span className="text-xs text-muted-foreground tabular-nums [writing-mode:vertical-rl]">
              {byCol.get(later.key).filter((i) => !isDone(i)).length} open
            </span>
          </button>
          <section
            id="later-drawer"
            inert={!sideOpen}
            aria-label={later.title}
            data-drop={later.key}
            className={cn('my-3 mr-3 flex min-w-0 flex-1 flex-col rounded-lg border bg-muted/40 transition-[opacity,border-color,background-color]', zoneClass(later))}
          >
            <header className="flex items-start gap-2 border-b px-3 py-2">
              <ColumnTitle col={later} />
              <span className="ml-auto">
                <Count items={byCol.get(later.key)} />
              </span>
            </header>
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
              {byCol.get(later.key).length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing here yet. Drag a card onto this drawer to push it one sprint further.</p>}
              {byCol.get(later.key).map(listCard)}
            </div>
          </section>
        </div>
      )}

      {/* Current sprint drawer: tucked away at the bottom, slides up when you want to pull tickets out of it. */}
      <div
        className={cn(
          'absolute inset-x-4 bottom-0 z-30 flex h-[min(48vh,440px)] flex-col rounded-t-xl border border-b-0 bg-card/95 shadow-[0_-10px_30px_-12px_oklch(0.35_0.04_60/0.25)] backdrop-blur-sm dark:shadow-[0_-12px_30px_-10px_oklch(0_0_0/0.6)]',
          'transition-transform duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none',
          !drawerOpen && 'translate-y-[calc(100%-2.75rem)] ease-[cubic-bezier(0.5,0,0.2,1)] duration-300',
        )}
      >
        <button
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="sprint-drawer"
          onClick={() => setDrawerOpen((o) => !o)}
          data-drop={current?.key}
          className={cn(
            'group relative flex h-11 shrink-0 items-center gap-2 rounded-t-xl px-4 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            current && zoneState(current) === 'over' && 'bg-primary/10',
          )}
        >
          <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/15 transition-[width,background-color] group-hover:w-12 group-hover:bg-foreground/25" />
          <CalendarClock className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{current ? current.title : 'Other sprints'}</span>
          {current && <span className="text-xs text-muted-foreground">{current.subtitle}</span>}
          <span className="text-xs text-muted-foreground">
            · {drawerCount} open {drawerCount === 1 ? 'ticket' : 'tickets'}
            {current && drawerCols.some((c) => c !== current) && ' (incl. other iterations)'}
          </span>
          <ChevronUp className={cn('ml-auto size-4 text-muted-foreground transition-transform duration-300', drawerOpen && 'rotate-180')} />
        </button>
        <div id="sprint-drawer" inert={!drawerOpen} className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-3">
          {drawerCols.length === 0 && (
            <p className="m-auto text-sm text-muted-foreground">No open tickets in other sprints or iterations.</p>
          )}
          {drawerCols.map((col) => {
            const list = byCol.get(col.key);
            return (
              <section
                key={col.key}
                aria-label={col.title}
                data-drop={col.kind === 'other' ? undefined : col.key}
                className={cn('flex min-w-[20rem] flex-1 flex-col rounded-lg border bg-muted/40 transition-[opacity,border-color,background-color]', zoneClass(col))}
              >
                <header className="flex items-start gap-2 border-b px-3 py-2">
                  <ColumnTitle col={col} />
                  <span className="ml-auto">
                    <Count items={list} />
                  </span>
                </header>
                <div className="no-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-1.5 overflow-y-auto p-2">
                  {list.length === 0 && <p className="col-span-full py-6 text-center text-xs text-muted-foreground">Empty.</p>}
                  {list.map(listCard)}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {dragged &&
        createPortal(
          <div
            ref={ghost}
            className="pointer-events-none fixed top-0 left-0 z-50 origin-top-left will-change-transform"
            style={{
              width: drag.w,
              transform: ghostTransform(drag.x - drag.dx * zoom, drag.y - drag.dy * zoom, zoom),
            }}
          >
            <div className="animate-card-pickup motion-reduce:animate-none" style={{ transformOrigin: `${drag.dx}px ${drag.dy}px` }}>
              <WorkItemCard {...cardProps(dragged)} className="cursor-grabbing" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

