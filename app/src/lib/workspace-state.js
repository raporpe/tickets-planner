import { useCallback, useSyncExternalStore } from 'react';
import { api } from '@/api';
import { columnKeyOf } from '@/lib/planning';

const LAYOUT_KEY = 'planner.board-layout.v1';
const NOTES_KEY = 'planner.board-notes.v1';
const THEME_KEY = 'theme';
const META_KEY = 'planner.workspace-meta.v1';
const DEBOUNCE_MS = 800;
const TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) ?? fallback) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full: state still works in memory for this session.
  }
}

function readDomTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyDomTheme(theme) {
  if (typeof document === 'undefined') return;
  const normalized = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', normalized === 'dark');
  root.style.colorScheme = normalized;
  try {
    localStorage.setItem(THEME_KEY, normalized);
  } catch {
    // Ignore storage error
  }
}

function sanitizeLayoutEntry(v, fallbackAt = 1) {
  if (!v || typeof v !== 'object') return null;
  const at = Number.isFinite(Number(v.at)) && Number(v.at) > 0 ? Number(v.at) : fallbackAt;
  if (v.deleted === true) return { deleted: true, at };
  if (typeof v.col !== 'string' || !v.col) return null;
  const y = Number(v.y);
  if (!Number.isFinite(y)) return null;
  const px = Number(v.px);
  const x = Number(v.x);
  if (!Number.isFinite(px) && !Number.isFinite(x)) return null;
  const z = Number.isFinite(Number(v.z)) ? Number(v.z) : 1;
  return {
    col: v.col,
    ...(Number.isFinite(px) ? { px: Math.max(0, Math.round(px)) } : { x: Math.min(1, Math.max(0, x)) }),
    y: Math.max(0, Math.round(y)),
    z,
    at,
  };
}

function sanitizeNoteEntry(v, fallbackAt = 1) {
  if (!v || typeof v !== 'object') return null;
  const at = Number.isFinite(Number(v.at)) && Number(v.at) > 0 ? Number(v.at) : fallbackAt;
  if (v.deleted === true) return { deleted: true, at };
  if (typeof v.col !== 'string' || !v.col) return null;
  const y = Number(v.y);
  if (!Number.isFinite(y)) return null;
  const px = Number(v.px);
  const x = Number(v.x);
  if (!Number.isFinite(px) && !Number.isFinite(x)) return null;
  const z = Number.isFinite(Number(v.z)) ? Number(v.z) : 1;
  return {
    col: v.col,
    ...(Number.isFinite(px) ? { px: Math.max(0, Math.round(px)) } : { x: Math.min(1, Math.max(0, x)) }),
    y: Math.max(0, Math.round(y)),
    z,
    text: String(v.text ?? '').slice(0, 4000),
    at,
  };
}

function sanitizeMap(raw, sanitizeFn, fallbackAt = 1) {
  if (!raw || typeof raw !== 'object') return {};
  const now = Date.now();
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const clean = sanitizeFn(v, fallbackAt);
    if (!clean) continue;
    if (clean.deleted && now - clean.at > TOMBSTONE_TTL_MS) continue;
    out[k] = clean;
  }
  return out;
}

function activeEntriesOnly(records) {
  const out = {};
  for (const [k, v] of Object.entries(records)) {
    if (v && !v.deleted) out[k] = v;
  }
  return out;
}

function mergePerItem(localMap, remoteMap, sanitizeFn) {
  const cleanLocal = sanitizeMap(localMap, sanitizeFn, 1);
  const cleanRemote = sanitizeMap(remoteMap, sanitizeFn, 1);
  const keys = new Set([...Object.keys(cleanLocal), ...Object.keys(cleanRemote)]);
  const merged = {};
  let changedLocal = false;
  let localAhead = false;

  for (const k of keys) {
    const l = cleanLocal[k];
    const r = cleanRemote[k];
    if (l && !r) {
      merged[k] = l;
      localAhead = true;
    } else if (!l && r) {
      merged[k] = r;
      changedLocal = true;
    } else if (r.at > l.at) {
      merged[k] = r;
      changedLocal = true;
    } else if (l.at > r.at) {
      merged[k] = l;
      localAhead = true;
    } else {
      merged[k] = l;
    }
  }
  return { merged, changedLocal, localAhead };
}

/**
 * Encapsulates sprint whiteboard card layout, sticky notes, and UI preferences,
 * with per-item Last-Write-Wins (LWW) cloud merging and automatic reconciliation
 * against live Azure DevOps tickets.
 */
export class WorkspaceState {
  constructor() {
    this._meta = readJson(META_KEY, { prefsAt: 0 });
    this._layoutRecords = sanitizeMap(readJson(LAYOUT_KEY, {}), sanitizeLayoutEntry, 1);
    this._notesRecords = sanitizeMap(readJson(NOTES_KEY, {}), sanitizeNoteEntry, 1);
    this._layoutView = activeEntriesOnly(this._layoutRecords);
    this._notesView = activeEntriesOnly(this._notesRecords);
    this._prefs = { theme: readDomTheme() };
    this._dirty = new Set();
    this._timer = null;
    this._flushing = false;
    this._listeners = {
      layout: new Set(),
      notes: new Set(),
      theme: new Set(),
    };
  }

  subscribeLayout = (fn) => {
    this._listeners.layout.add(fn);
    return () => this._listeners.layout.delete(fn);
  };

  subscribeNotes = (fn) => {
    this._listeners.notes.add(fn);
    return () => this._listeners.notes.delete(fn);
  };

  subscribeTheme = (fn) => {
    this._listeners.theme.add(fn);
    return () => this._listeners.theme.delete(fn);
  };

  getLayout = () => this._layoutView;
  getNotes = () => this._notesView;
  getTheme = () => this._prefs.theme;

  placeCards = (entries) => {
    const now = Date.now();
    const next = { ...this._layoutRecords };
    for (const [id, pos] of Object.entries(entries || {})) {
      const clean = sanitizeLayoutEntry({ ...pos, at: now }, now);
      if (clean) next[id] = clean;
    }
    this._commitLayout(next, true);
  };

  clearColumn = (col) => {
    const now = Date.now();
    const next = { ...this._layoutRecords };
    let changed = false;
    for (const [id, v] of Object.entries(next)) {
      if (!v.deleted && v.col === col) {
        next[id] = { deleted: true, at: now };
        changed = true;
      }
    }
    if (changed) this._commitLayout(next, true);
  };

  addNote = (note) => {
    const now = Date.now();
    const id = `n${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const clean = sanitizeNoteEntry({ text: '', ...note, at: now }, now);
    if (clean) {
      this._commitNotes({ ...this._notesRecords, [id]: clean }, true);
    }
    return id;
  };

  updateNote = (id, patch) => {
    const cur = this._notesRecords[id];
    if (!cur || cur.deleted) return;
    const now = Date.now();
    const clean = sanitizeNoteEntry({ ...cur, ...patch, at: now }, now);
    if (clean) {
      this._commitNotes({ ...this._notesRecords, [id]: clean }, true);
    }
  };

  removeNote = (id) => {
    const cur = this._notesRecords[id];
    if (!cur || cur.deleted) return;
    const now = Date.now();
    this._commitNotes({ ...this._notesRecords, [id]: { deleted: true, at: now } }, true);
  };

  setTheme = (theme) => {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    this._prefs = { ...this._prefs, theme: normalized };
    this._meta = { ...this._meta, prefsAt: Date.now() };
    applyDomTheme(normalized);
    writeJson(META_KEY, this._meta);
    this._emit('theme');
    this._scheduleSync('prefs');
  };

  /**
   * Reconciles cloud settings AND prunes stale/mismatched card positions against
   * the live tickets currently returned by Azure DevOps.
   */
  reconcileWithOverview = (overview) => {
    if (!overview || typeof overview !== 'object') return;
    if (overview.settings) {
      this._mergeRemote(overview.settings, { allowSchedule: true });
    }

    if (!Array.isArray(overview.items) || !Array.isArray(overview.sprints)) return;
    const liveColById = new Map();
    for (const item of overview.items) {
      liveColById.set(String(item.id), columnKeyOf(item, overview));
    }

    const now = Date.now();
    let prunedLayout = false;
    const nextLayout = { ...this._layoutRecords };
    for (const [id, entry] of Object.entries(nextLayout)) {
      if (!entry || entry.deleted) continue;
      const actualCol = liveColById.get(String(id));
      // If the ticket no longer exists in the workspace or moved to another sprint in ADO, discard its old position.
      if (!actualCol || entry.col !== actualCol) {
        nextLayout[id] = { deleted: true, at: now };
        prunedLayout = true;
      }
    }
    if (prunedLayout) {
      this._commitLayout(nextLayout, true);
    }
  };

  _mergeRemote(remote, { allowSchedule = true } = {}) {
    if (!remote || typeof remote !== 'object') return;

    const remoteLayoutMap = remote.layout?.items ?? (typeof remote.layout === 'object' ? remote.layout : {});
    const layoutRes = mergePerItem(this._layoutRecords, remoteLayoutMap, sanitizeLayoutEntry);
    if (layoutRes.changedLocal) {
      this._commitLayout(layoutRes.merged, false);
    }
    if (layoutRes.localAhead) {
      this._dirty.add('layout');
    }

    const remoteNotesMap = remote.notes?.items ?? (typeof remote.notes === 'object' ? remote.notes : {});
    const notesRes = mergePerItem(this._notesRecords, remoteNotesMap, sanitizeNoteEntry);
    if (notesRes.changedLocal) {
      this._commitNotes(notesRes.merged, false);
    }
    if (notesRes.localAhead) {
      this._dirty.add('notes');
    }

    const remotePrefs = remote.prefs;
    const remotePrefsAt = Number(remotePrefs?.updatedAt || 0);
    if (remotePrefs?.theme && remotePrefsAt > (this._meta.prefsAt || 0)) {
      const normalized = remotePrefs.theme === 'dark' ? 'dark' : 'light';
      this._prefs = { ...this._prefs, theme: normalized };
      this._meta = { ...this._meta, prefsAt: remotePrefsAt };
      applyDomTheme(normalized);
      writeJson(META_KEY, this._meta);
      this._emit('theme');
    } else if ((this._meta.prefsAt || 0) > remotePrefsAt) {
      this._dirty.add('prefs');
    }

    if (allowSchedule && this._dirty.size > 0) {
      this._scheduleSync();
    }
  }

  _commitLayout(records, markDirty) {
    this._layoutRecords = records;
    this._layoutView = activeEntriesOnly(records);
    writeJson(LAYOUT_KEY, records);
    this._emit('layout');
    if (markDirty) this._scheduleSync('layout');
  }

  _commitNotes(records, markDirty) {
    this._notesRecords = records;
    this._notesView = activeEntriesOnly(records);
    writeJson(NOTES_KEY, records);
    this._emit('notes');
    if (markDirty) this._scheduleSync('notes');
  }

  _emit(channel) {
    this._listeners[channel].forEach((fn) => fn());
  }

  _scheduleSync(slice) {
    if (slice) this._dirty.add(slice);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  async flush() {
    if (!this._dirty.size || this._flushing) return;
    this._flushing = true;
    const slices = [...this._dirty];
    this._dirty.clear();
    try {
      // Pull and merge per-item before writing so concurrent sessions never overwrite each other's cards.
      const remote = await api.settings().catch(() => null);
      if (remote) {
        this._mergeRemote(remote, { allowSchedule: false });
      }
      const payload = {};
      if (slices.includes('layout') || this._dirty.has('layout')) {
        payload.layout = { updatedAt: Date.now(), items: this._layoutRecords };
        this._dirty.delete('layout');
      }
      if (slices.includes('notes') || this._dirty.has('notes')) {
        payload.notes = { updatedAt: Date.now(), items: this._notesRecords };
        this._dirty.delete('notes');
      }
      if (slices.includes('prefs') || this._dirty.has('prefs')) {
        payload.prefs = { updatedAt: this._meta.prefsAt || Date.now(), ...this._prefs };
        this._dirty.delete('prefs');
      }
      if (Object.keys(payload).length > 0) {
        await api.saveSettings(payload);
      }
    } catch {
      slices.forEach((s) => this._dirty.add(s));
    } finally {
      this._flushing = false;
      if (this._dirty.size > 0) this._scheduleSync();
    }
  }
}

export const workspaceState = new WorkspaceState();

export function useBoardLayout() {
  const layout = useSyncExternalStore(workspaceState.subscribeLayout, workspaceState.getLayout);
  const place = useCallback((entries) => workspaceState.placeCards(entries), []);
  const clearColumn = useCallback((col) => workspaceState.clearColumn(col), []);
  return { layout, place, clearColumn };
}

export function useBoardNotes() {
  const notes = useSyncExternalStore(workspaceState.subscribeNotes, workspaceState.getNotes);
  const addNote = useCallback((note) => workspaceState.addNote(note), []);
  const updateNote = useCallback((id, patch) => workspaceState.updateNote(id, patch), []);
  const removeNote = useCallback((id) => workspaceState.removeNote(id), []);
  return { notes, addNote, updateNote, removeNote };
}

export function setTheme(theme) {
  workspaceState.setTheme(theme);
}

export function useTheme() {
  return useSyncExternalStore(workspaceState.subscribeTheme, workspaceState.getTheme);
}
