import { useCallback, useSyncExternalStore } from 'react';

// Card positions on the Sprint planning board. Pure view state (where you left a card), never ticket data.
// Shape: { [id]: { col, x, y, z } } where x is 0..1 across the column's free width and y is px from the top.
const KEY = 'planner.board-layout.v1';
const listeners = new Set();
let cache = read();

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function write(next) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: positions still work for this session.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));

export function useBoardLayout() {
  const layout = useSyncExternalStore(subscribe, () => cache);
  const place = useCallback((entries) => write({ ...cache, ...entries }), []);
  const clearColumn = useCallback((col) => {
    write(Object.fromEntries(Object.entries(cache).filter(([, v]) => v.col !== col)));
  }, []);
  return { layout, place, clearColumn };
}
