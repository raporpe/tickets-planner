import { useEffect, useRef, useState } from 'react';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Ticket actions. `keys` is what the cheat sheet and hints show; `detailOnly` actions open the ticket first. */
export const TICKET_ACTIONS = [
  { id: 'state', label: 'Change state', keys: ['S'] },
  { id: 'priority', label: 'Change priority', keys: ['P'] },
  { id: 'sprint', label: 'Change sprint', keys: ['Shift', 'C'] },
  { id: 'feature', label: 'Change Feature', keys: ['F'] },
  { id: 'link-pr', label: 'Link a pull request', keys: ['L'], detailOnly: true },
  { id: 'comment', label: 'Add a comment', keys: ['M'], detailOnly: true },
  { id: 'edit', label: 'Edit description', keys: ['E'], detailOnly: true },
  { id: 'open-ado', label: 'Open in Azure DevOps', keys: ['O'] },
  { id: 'copy', label: 'Copy link, title and state', keys: ['C'] },
];

export const NAV_ACTIONS = [
  { id: 'plan', label: 'Go to My sprint', keys: ['G', 'S'] },
  { id: 'standup', label: 'Go to Stand Up', keys: ['G', 'U'] },
  { id: 'features', label: 'Go to By Feature', keys: ['G', 'F'] },
  { id: 'attention', label: 'Go to Hygiene', keys: ['G', 'H'] },
];

export const VIEW_ACTIONS = [
  { id: 'filter', label: 'Filter tickets', keys: ['/'] },
  { id: 'toggle-closed', label: 'Show closed tickets (last 21 days)', onLabel: 'Hide closed tickets', keys: ['Shift', 'D'] },
];

export const SHORTCUT_GROUPS = [
  { title: 'Ticket (hovered card or open ticket)', items: TICKET_ACTIONS },
  {
    title: 'Open ticket',
    items: [
      { label: 'Next / previous ticket', keys: ['J', 'K'], or: true },
      { label: 'Close', keys: ['Esc'] },
    ],
  },
  { title: 'Navigate', items: NAV_ACTIONS },
  { title: 'View', items: [VIEW_ACTIONS[0], { label: 'Show or hide closed tickets', keys: VIEW_ACTIONS[1].keys }] },
  {
    title: 'General',
    items: [
      { label: 'Find a ticket or run an action', keys: [MOD, 'K'] },
      { label: 'Keyboard shortcuts', keys: ['?'] },
    ],
  },
];

export const hint = (actionId) => {
  const a = TICKET_ACTIONS.find((x) => x.id === actionId);
  return a ? a.keys.join(' ') : '';
};

/** True while the user is typing somewhere a letter key must not trigger a shortcut. */
export function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || !!t.closest('input, textarea, select, [contenteditable="true"]'));
}

/** True while a picker, menu or palette is open; it owns the keyboard then. */
export const overlayOpen = () =>
  !!document.querySelector('[data-radix-popper-content-wrapper], [role="listbox"], [role="alertdialog"], [cmdk-root] input:focus');

const EVENT = 'planner:action';

/**
 * Asks the control for `action` on ticket `id` inside `scope` to activate.
 * Returns false when nothing in that scope handled it.
 */
export function runAction(action, id, scope) {
  const detail = { action, id, scope, handled: false };
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
}

/** Lets a control respond to a shortcut aimed at its ticket, when it sits inside the targeted scope. */
export function useAction(action, id, handler) {
  const ref = useRef(null);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const on = (e) => {
      const d = e.detail;
      if (d.handled || d.action !== action || d.id !== id || !ref.current || !d.scope?.contains(ref.current)) return;
      d.handled = true;
      latest.current();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [action, id]);
  return ref;
}

/** A Radix Select/Popover whose open state can also be driven by a shortcut. */
export function useShortcutOpen(action, id) {
  const [open, setOpen] = useState(false);
  const ref = useAction(action, id, () => setOpen(true));
  return { open, onOpenChange: setOpen, ref };
}

// An action that needs the detail panel waits here until that ticket's panel has loaded.
let queued = null;
export const queueAction = (action, id) => (queued = { action, id });
export function takeQueued(id) {
  if (queued?.id !== id) return null;
  const q = queued;
  queued = null;
  return q.action;
}
