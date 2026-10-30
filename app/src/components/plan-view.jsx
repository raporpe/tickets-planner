import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronUp, Inbox, History, LayoutGrid, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { WorkItemCard } from '@/components/work-item';
import { HierarchyHover } from '@/components/hierarchy';
import { useBoardLayout } from '@/lib/board-layout';
import { useBoardNotes } from '@/lib/board-notes';
import { buildColumns, canBeInSprint, columnKeyOf, isDone } from '@/lib/planning';

const MIN_W = 236;
const MAX_W = 320;
const PAD = 12;
const GAP = 10;
const EST_H = 130;
const NOTE_W = 288;
const SLACK = 180; // free space below the lowest card, so there is always room to drop
const NO_DRAG = 'input, textarea, select, [role="combobox"], [aria-haspopup], [data-no-drag]';
const ORDER = (a, b) => Number(isDone(a)) - Number(isDone(b)) || a.type.localeCompare(b.type) || b.id - a.id;

/**
 * Where each card sits on the whiteboard. Cards you have moved keep their spot; the rest flow into
 * evenly spread lanes below them, so new arrivals never land on top of a group you made.
 */
function layoutBoard(list, colKey, width, heights, layout) {
  const lanes = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (MIN_W + GAP)));
  const fit = (width - PAD * 2 - (lanes - 1) * GAP) / lanes;
  // A single lane still leaves some sideways room, so cards can be nudged and grouped.
  const cardW = Math.max(200, Math.min(MAX_W, lanes === 1 ? fit - 56 : fit));
  const usable = Math.max(0, width - cardW - PAD * 2);
  const pos = new Map();
  let bottom = 0;
  const free = [];
  for (const item of list) {
    const s = layout[item.id];
    if (s?.col === colKey) {
      const p = { x: PAD + s.x * usable, y: s.y, z: s.z ?? 1 };
      pos.set(item.id, p);
      bottom = Math.max(bottom, p.y + (heights[item.id] ?? EST_H));
    } else free.push(item);
  }
  const laneX = (i) => PAD + (lanes > 1 ? (i * usable) / (lanes - 1) : 0);
  const laneY = Array(lanes).fill(bottom ? bottom + GAP * 3 : PAD);
  for (const item of free) {
    const i = laneY.indexOf(Math.min(...laneY));
    pos.set(item.id, { x: laneX(i), y: laneY[i], z: 0 });
    laneY[i] += (heights[item.id] ?? EST_H) + GAP;
  }
  return { pos, usable, cardW, height: Math.max(bottom, ...laneY) + SLACK };
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
      className={cn(free ? 'absolute' : 'select-none', 'touch-none', free && animate && 'transition-[left,top] duration-200 ease-out', hidden && 'opacity-0')}
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
function BoardNote({ id, note, left, top, editing, onEdit, onChange, onRemove, toPos }) {
  const el = useRef(null);
  const startMove = (e) => {
    if (editing || e.button !== 0 || e.target.closest('button')) return;
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      el.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (el.current) el.current.style.transform = '';
      if (moved && ev.type === 'pointerup') onChange(id, toPos(left + ev.clientX - sx, top + ev.clientY - sy));
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

const ghostTransform = (x, y) => `translate3d(${x}px, ${y}px, 0)`;

export function PlanView({ data, items, features, pendingIds, reasonsById, onUpdate }) {
  const { layout, place, clearColumn } = useBoardLayout();
  const { notes, addNote, updateNote, removeNote } = useBoardNotes();
  const [editingNote, setEditingNote] = useState(null);
  const [drag, setDrag] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [heights, setHeights] = useState({});
  const [boardWidth, setBoardWidth] = useState(MIN_W + PAD * 2);
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
  const [nextSprint, laterSprint] = data.sprints.filter((s) => s.timeFrame === 'future');
  const next = nextSprint && { ...columns.find((c) => c.key === nextSprint.path), next: true };
  // The sprint after the whiteboard's sits in a side drawer, so work can be pushed one sprint further.
  const later = laterSprint && columns.find((c) => c.key === laterSprint.path);
  // Everything that isn't the backlog or an upcoming sprint lives in the bottom drawer: the sprint in progress
  // first, then any other sprint or legacy iteration that still holds tickets.
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

  useEffect(() => {
    if (!drawerOpen && !sideOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || drag) return;
      setDrawerOpen(false);
      setSideOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, sideOpen, drag]);

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
      const { usable, pos } = computed.current;
      const px = Math.min(Math.max(PAD, x - r.left - d.dx), PAD + usable);
      const py = Math.max(PAD, y - r.top - d.dy + el.scrollTop);
      const frac = (v) => (usable > 0 ? (v - PAD) / usable : 0);
      // Freeze everything else on the board where it is now, so nothing shuffles around the drop.
      const entries = {};
      pos.forEach((p, id) => {
        if (id !== d.id) entries[id] = { col: col.key, x: frac(p.x), y: p.y, z: p.z };
      });
      const topZ = Math.max(0, ...Object.values(layout).map((v) => v.z ?? 0));
      entries[d.id] = { col: col.key, x: frac(px), y: py, z: topZ + 1 };
      place(entries);
    }
    if (item.iterationPath !== col.path) onUpdate(item, { iterationPath: col.path });
  };

  const startDrag = (e, item) => {
    if (e.button !== 0 || pendingIds.has(item.id) || e.target.closest(NO_DRAG)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const d = { id: item.id, dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, sx: e.clientX, sy: e.clientY };
    let started = false;
    let over;
    let frame = 0;
    let last = null;
    // Pointer moves only touch the floating card's transform; React re-renders just when the drop target changes.
    const paint = () => {
      frame = 0;
      if (ghost.current) ghost.current.style.transform = ghostTransform(last.clientX - d.dx, last.clientY - d.dy);
      const o = targetAt(last.clientX, last.clientY);
      if (o !== over) {
        over = o;
        setDrag((cur) => cur && { ...cur, over: o });
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

  const noteUsable = Math.max(0, boardWidth - NOTE_W - PAD * 2);
  const notePos = useCallback(
    (px, py) => ({ x: noteUsable > 0 ? Math.min(1, Math.max(0, (px - PAD) / noteUsable)) : 0, y: Math.max(PAD, Math.round(py)) }),
    [noteUsable],
  );
  const boardNotes = next ? Object.entries(notes).filter(([, n]) => n.col === next.key) : [];
  const boardHeight = placed ? Math.max(placed.height, ...boardNotes.map(([, n]) => n.y + 120 + SLACK)) : 0;
  const addNoteAt = (e) => {
    if (e.target.closest('[data-card-id], [data-note]')) return;
    const r = e.currentTarget.getBoundingClientRect();
    setEditingNote(addNote({ col: next.key, ...notePos(e.clientX - r.left - 8, e.clientY - r.top - 14) }));
  };

  return (
    // While dragging, cards ignore the pointer so hovering them costs nothing (and drop targets resolve straight to the column).
    <div className={cn('relative h-full overflow-hidden', drag && '[&_article]:pointer-events-none')}>
      <div className={cn('flex h-full gap-3 px-4 pb-14', later && 'pr-14')}>
        {/* Backlog: a plain vertical stack, exactly one card wide. */}
        <section
          aria-label={backlog.title}
          data-drop={backlog.key}
          className={cn('flex h-full w-[20rem] shrink-0 flex-col rounded-lg border bg-muted/40 transition-[opacity,border-color,background-color]', zoneClass(backlog))}
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
              <ColumnTitle col={next} />
              <div className="ml-auto flex items-center gap-1">
                {nextList.some((i) => layout[i.id]?.col === next.key) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" onClick={() => clearColumn(next.key)} aria-label={`Tidy up ${next.title}`}>
                        <LayoutGrid className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Tidy up: forget where you placed these cards</TooltipContent>
                  </Tooltip>
                )}
                <Count items={nextList} />
              </div>
            </header>
            <div ref={board} className="no-scrollbar relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <div className="whiteboard-dots relative isolate min-h-full select-none" style={{ height: boardHeight }} onDoubleClick={addNoteAt}>
                {nextList.length === 0 && boardNotes.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing planned yet. Drag cards here, or double-click to write a note.</p>
                )}
                {boardNotes.map(([id, n]) => (
                  <BoardNote
                    key={id}
                    id={id}
                    note={n}
                    left={PAD + n.x * noteUsable}
                    top={n.y}
                    editing={editingNote === id}
                    onEdit={setEditingNote}
                    onChange={updateNote}
                    onRemove={removeNote}
                    toPos={notePos}
                  />
                ))}
                {nextList.map((item) => {
                  const p = placed.pos.get(item.id);
                  return (
                    <PlanCard
                      key={item.id}
                      {...cardProps(item)}
                      onStart={onStart}
                      register={register}
                      hidden={drag?.id === item.id}
                      settle={lastDrop.current === item.id ? drops.current : 0}
                      free
                      x={p.x}
                      y={p.y}
                      w={placed.cardW}
                      z={p.z}
                      animate={lastDrop.current !== item.id}
                    />
                  );
                })}

              </div>
            </div>
          </section>
        ) : (
          <section className="flex h-full flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No upcoming sprint under {data.backlogPath}.
          </section>
        )}
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
          <span className="text-sm font-semibold">{current ? current.title : 'No sprint in progress'}</span>
          {current && <span className="text-xs text-muted-foreground">{current.subtitle}</span>}
          <span className="text-xs text-muted-foreground">
            · {drawerCount} open {drawerCount === 1 ? 'ticket' : 'tickets'}
            {drawerCols.some((c) => c !== current) && ' (incl. other iterations)'}
          </span>
          <ChevronUp className={cn('ml-auto size-4 text-muted-foreground transition-transform duration-300', drawerOpen && 'rotate-180')} />
        </button>
        <div id="sprint-drawer" inert={!drawerOpen} className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-3">
          {drawerCols.length === 0 && (
            <p className="m-auto text-sm text-muted-foreground">Nothing in progress. When {next?.title ?? 'the next sprint'} starts it moves down here.</p>
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
            className="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
            style={{ width: drag.w, transform: ghostTransform(drag.x - drag.dx, drag.y - drag.dy) }}
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

