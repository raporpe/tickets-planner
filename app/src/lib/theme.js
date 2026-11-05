import { useSyncExternalStore } from 'react';

// index.html applies the stored (or OS) theme before first paint; this keeps React in sync with it.
const KEY = 'theme';
const listeners = new Set();
const current = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

export function setTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this tab only.
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), current);
}
