import { useEffect, useState, useSyncExternalStore } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { StatePill, TypeLabel } from '@/components/work-item';
import { api } from '@/api';
import { cn } from '@/lib/utils';

/** Tree from the top-most ancestor down to `self`. Ancestors are clickable when `onOpen` is given. */
export function HierarchyTree({ ancestors, self, onOpen, compact = false }) {
  const chain = [...ancestors, { ...self, self: true }];
  const step = compact ? 12 : 16;
  return (
    <ol className="flex flex-col">
      {chain.map((n, i) => (
        <li key={n.id} className={cn('relative flex min-w-0 items-center gap-2', compact ? 'py-0.5' : 'py-1')} style={{ paddingLeft: i * step }}>
          {i > 0 && (
            <span
              aria-hidden
              className="absolute top-0 h-1/2 w-2.5 rounded-bl border-b border-l border-border"
              style={{ left: (i - 1) * step + 5 }}
            />
          )}
          <span className="shrink-0 whitespace-nowrap">
            <TypeLabel type={n.type} />
          </span>
          {n.self || !onOpen ? (
            <span className={cn('min-w-0 truncate text-[13px]', n.self ? 'font-medium' : 'text-foreground/85')} aria-current={n.self || undefined}>
              {n.title}
            </span>
          ) : (
            <button
              type="button"
              className="min-w-0 truncate text-left text-[13px] text-foreground/85 hover:text-primary hover:underline"
              onClick={() => onOpen(n.id)}
              title={`Open ${n.type} ${n.id}`}
            >
              {n.title}
            </button>
          )}
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{n.id}</span>
          <StatePill state={n.state} className="shrink-0" />
          {!n.self && !compact && (
            <a href={n.url} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary" aria-label={`Open ${n.id} in Azure DevOps`}>
              <ExternalLink className="size-3" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

// ---- Ctrl key state, shared by every card ----
let ctrlDown = false;
const listeners = new Set();
const setCtrl = (v) => {
  if (v === ctrlDown) return;
  ctrlDown = v;
  listeners.forEach((l) => l());
};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => setCtrl(e.ctrlKey));
  window.addEventListener('keyup', (e) => setCtrl(e.ctrlKey));
  window.addEventListener('blur', () => setCtrl(false));
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
const useCtrlKey = () => useSyncExternalStore(subscribe, () => ctrlDown);

// Ancestors rarely change during a session; clearAncestors() after any re-parent.
const cache = new Map();
function loadAncestors(id) {
  if (!cache.has(id)) {
    cache.set(
      id,
      api.ancestors(id).then(
        (r) => r.ancestors,
        (e) => {
          cache.delete(id);
          throw e;
        },
      ),
    );
  }
  return cache.get(id);
}
export const clearAncestors = () => cache.clear();

function HoverTree({ item }) {
  const [state, setState] = useState({ id: null });
  useEffect(() => {
    let live = true;
    loadAncestors(item.id).then(
      (ancestors) => live && setState({ id: item.id, ancestors }),
      (e) => live && setState({ id: item.id, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [item.id]);

  if (state.id !== item.id) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading hierarchy…
      </p>
    );
  }
  if (state.error) return <p className="text-xs text-destructive">{state.error}</p>;
  return (
    <>
      <HierarchyTree ancestors={state.ancestors} self={item} compact />
      {state.ancestors.length === 0 && <p className="text-xs text-amber-300">No parent. This item isn't linked to any Feature.</p>}
    </>
  );
}

/**
 * Wraps a ticket card/row: hovering it while holding Ctrl shows its full hierarchy.
 * The child must accept a ref (a DOM element).
 */
export function HierarchyHover({ item, children }) {
  const [hovered, setHovered] = useState(false);
  const ctrl = useCtrlKey();
  const open = hovered && ctrl;
  return (
    <Popover open={open}>
      <PopoverAnchor
        asChild
        onPointerEnter={(e) => {
          setHovered(true);
          setCtrl(e.ctrlKey);
        }}
        onPointerMove={(e) => setCtrl(e.ctrlKey)}
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
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Hierarchy</p>
          <HoverTree item={item} />
        </PopoverContent>
      )}
    </Popover>
  );
}
