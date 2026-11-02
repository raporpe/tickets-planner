import { useEffect, useState, useSyncExternalStore } from 'react';
import { ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { StatePill, TypeLabel } from '@/components/work-item';
import { api } from '@/api';
import { cn } from '@/lib/utils';
import { DONE_STATES, expectedParent, typeShort, typeStyle } from '@/lib/planning';

/** Amber note when an item lacks the parent its type should have; nothing for top-level types. */
export function MissingParent({ type, className }) {
  const want = expectedParent(type);
  if (!want) return null;
  return (
    <p className={cn('flex items-center gap-1.5 text-[12px] text-amber-800 dark:text-amber-200', className)}>
      <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
      This {typeShort(type).toLowerCase()} isn't linked to a parent {want}.
    </p>
  );
}

/**
 * Tree from the top-most ancestor down to `self`, plus `self`'s direct children one level below.
 * Each type's dot is a node; the trunk hangs from the parent's dot. Other items are clickable when `onOpen` is given.
 */
export function HierarchyTree({ ancestors, self, children = [], onOpen, compact = false }) {
  const chain = [...ancestors.map((n, i) => ({ ...n, depth: i })), { ...self, self: true, depth: ancestors.length }];
  const nodes = [...chain, ...children.map((c) => ({ ...c, depth: ancestors.length + 1 }))];
  const step = compact ? 16 : 20;
  // Elbows start just below the parent's dot (centre ≈ 3.5px in, radius 4px) and stop just short of the child's dot,
  // or at the edge of the highlighted current row, so they never run under a dot or a label.
  const elbow = (n) => ({
    left: (n.depth - 1) * step + 3.5,
    width: step - 3.5 - (n.self ? 6 : 3),
    top: 'calc(-50% + 6px)',
    height: 'calc(100% - 6px)',
  });
  return (
    <ol className="flex flex-col">
      {nodes.map((n) => {
        const done = !n.self && DONE_STATES.includes(n.state);
        return (
          <li
            key={n.id}
            aria-level={n.depth + 1}
            className={cn('relative min-w-0', compact ? 'py-px' : 'py-0.5')}
            style={{ paddingLeft: n.depth * step }}
          >
            {n.depth > 0 && (
              // From the previous row's dot down and across to this row's dot (rows share one height).
              <span
                aria-hidden
                className="absolute rounded-bl-md border-b border-l border-stone-300 dark:border-stone-600"
                style={elbow(n)}
              />
            )}
            <div
              className={cn(
                'relative flex min-w-0 items-center gap-2 rounded-md',
                compact ? 'h-6 pr-1' : 'h-7 pr-1.5',
                n.self && cn(typeStyle(n.type).tint, '-ml-1.5 pl-1.5'),
                done && 'opacity-55',
              )}
            >
              <span className="shrink-0 whitespace-nowrap">
                <TypeLabel type={n.type} />
              </span>
              {n.self || !onOpen ? (
                <span
                  className={cn('min-w-0 truncate text-[13px]', n.self ? 'font-semibold' : 'text-foreground/85')}
                  aria-current={n.self ? 'true' : undefined}
                  title={n.title}
                >
                  {n.title}
                </span>
              ) : (
                <button
                  type="button"
                  className="min-w-0 truncate rounded-sm text-left text-[13px] text-foreground/85 hover:text-primary hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onOpen(n.id)}
                  title={`Open ${typeShort(n.type)} ${n.id}: ${n.title}`}
                >
                  {n.title}
                </button>
              )}
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{n.id}</span>
              <StatePill state={n.state} className="shrink-0" />
              {!n.self && !compact && (
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="-m-1 shrink-0 rounded-sm p-1 text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Open ${n.id} in Azure DevOps`}
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Modifier key state, shared by every card: Shift → parents, Ctrl → children ----
let keys = '';
const listeners = new Set();
const isEditable = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const setKeys = (e) => {
  // Typing capitals in a field shouldn't pop up a card's parents.
  const shift = e.shiftKey && !(e.type === 'keydown' && isEditable(e.target));
  const v = (shift ? 's' : '') + (e.ctrlKey ? 'c' : '');
  if (v === keys) return;
  keys = v;
  listeners.forEach((l) => l());
};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', setKeys);
  window.addEventListener('keyup', setKeys);
  window.addEventListener('blur', () => setKeys({}));
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
const useModifierKeys = () => useSyncExternalStore(subscribe, () => keys);

// Session caches; clearAncestors() after any re-parent. Children expire quickly since they change more often.
const ancestorCache = new Map();
const childCache = new Map();
const CHILD_TTL = 30_000;
function cached(cache, id, load, ttl = Infinity) {
  const hit = cache.get(id);
  if (!hit || Date.now() - hit.at > ttl) {
    const promise = load(id).catch((e) => {
      cache.delete(id);
      throw e;
    });
    cache.set(id, { at: Date.now(), promise });
    return promise;
  }
  return hit.promise;
}
const loadAncestors = (id) => cached(ancestorCache, id, (i) => api.ancestors(i).then((r) => r.ancestors));
const loadChildren = (id) => cached(childCache, id, (i) => api.children(i).then((r) => r.children), CHILD_TTL);
export const clearAncestors = () => {
  ancestorCache.clear();
  childCache.clear();
};

function HoverTree({ item, parents, kids }) {
  const want = `${item.id}:${parents}:${kids}`;
  const [state, setState] = useState({ want: null });
  useEffect(() => {
    let live = true;
    Promise.all([parents ? loadAncestors(item.id) : [], kids ? loadChildren(item.id) : []]).then(
      ([ancestors, children]) => live && setState({ want, ancestors, children }),
      (e) => live && setState({ want, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [item.id, parents, kids, want]);

  if (state.want !== want) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading {parents && kids ? 'hierarchy' : parents ? 'parents' : 'children'}…
      </p>
    );
  }
  if (state.error) return <p className="text-xs text-destructive">{state.error}</p>;
  return (
    <>
      <HierarchyTree ancestors={state.ancestors} self={item} children={state.children} compact />
      {parents && state.ancestors.length === 0 && <MissingParent type={item.type} />}
      {kids && state.children.length === 0 && <p className="text-xs text-muted-foreground">No children.</p>}
    </>
  );
}

/**
 * Wraps a ticket card/row: hover while holding Shift to see its parents, Ctrl to see its children
 * (both for the whole tree). The child must accept a ref (a DOM element).
 */
export function HierarchyHover({ item, children }) {
  const [hovered, setHovered] = useState(false);
  const mods = useModifierKeys();
  const parents = mods.includes('s');
  const kids = mods.includes('c');
  const open = hovered && (parents || kids);
  return (
    <Popover open={open}>
      <PopoverAnchor
        asChild
        onPointerEnter={(e) => {
          setHovered(true);
          setKeys(e);
        }}
        onPointerMove={setKeys}
        onPointerLeave={() => setHovered(false)}
      >
        {children}
      </PopoverAnchor>
      {open && (
        <PopoverContent
          side="bottom"
          align="start"
          className="pointer-events-none w-auto max-w-[min(40rem,calc(100vw-2rem))] gap-2 p-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {parents && kids ? 'Hierarchy' : parents ? 'Parents' : 'Children'}
          </p>
          <HoverTree item={item} parents={parents} kids={kids} />
        </PopoverContent>
      )}
    </Popover>
  );
}
