import { useCallback, useSyncExternalStore } from 'react';

// Free-floating notes on the Sprint planning whiteboard. Browser-only scribbles, never ticket data.
// Shape: { [id]: { col, x, y, text } } where x is 0..1 across the board's free width and y is px from the top.
const KEY = 'planner.board-notes.v1';
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
    // Storage full or blocked: notes still work for this session.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));

export function useBoardNotes() {
  const notes = useSyncExternalStore(subscribe, () => cache);
  const addNote = useCallback((note) => {
    const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    write({ ...cache, [id]: { text: '', ...note } });
    return id;
  }, []);
  const updateNote = useCallback((id, patch) => cache[id] && write({ ...cache, [id]: { ...cache[id], ...patch } }), []);
  const removeNote = useCallback((id) => {
    const { [id]: _gone, ...rest } = cache;
    write(rest);
  }, []);
  return { notes, addNote, updateNote, removeNote };
}
