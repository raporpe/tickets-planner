// Pale tinted pills with deep same-hue text (≥4.5:1 on the tint); in dark, a faint wash with pastel text.
const STATE_TONE = {
  New: 'bg-stone-100 text-stone-700 ring-stone-300/70 dark:bg-stone-300/10 dark:text-stone-300 dark:ring-stone-300/20',
  Active: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-300/10 dark:text-sky-200 dark:ring-sky-300/25',
  'Work in Progress': 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-300/10 dark:text-sky-200 dark:ring-sky-300/25',
  Resolved: 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-300/10 dark:text-teal-200 dark:ring-teal-300/25',
  Flighting: 'bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-300/10 dark:text-indigo-200 dark:ring-indigo-300/25',
  Pending: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-300/10 dark:text-amber-200 dark:ring-amber-300/25',
  'On Hold': 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-300/10 dark:text-amber-200 dark:ring-amber-300/25',
  'At Risk': 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-300/10 dark:text-orange-200 dark:ring-orange-300/25',
  Blocked: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-300/10 dark:text-rose-200 dark:ring-rose-300/25',
  Closed: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-300/10 dark:text-emerald-200 dark:ring-emerald-300/25',
  Removed: 'bg-stone-50 text-stone-500 ring-stone-200 dark:bg-transparent dark:text-stone-400 dark:ring-stone-300/15',
};

export const stateTone = (s) => STATE_TONE[s] || STATE_TONE.New;

// Each type owns a pastel family: `text` for the label, `dot` for its marker, `tint` for a highlighted row.
const TYPE_STYLE = {
  Epic: { text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-300', tint: 'bg-violet-50 dark:bg-violet-300/10' },
  Feature: { text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-300', tint: 'bg-emerald-50 dark:bg-emerald-300/10' },
  'User Story': { text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-300', tint: 'bg-indigo-50 dark:bg-indigo-300/10' },
  Task: { text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-300', tint: 'bg-orange-50 dark:bg-orange-300/10' },
  Bug: { text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-300', tint: 'bg-rose-50 dark:bg-rose-300/10' },
};
const OTHER_TYPE = { text: 'text-stone-600 dark:text-stone-300', dot: 'bg-stone-300', tint: 'bg-stone-100 dark:bg-stone-300/10' };

export const typeStyle = (t) => TYPE_STYLE[t] || OTHER_TYPE;
export const typeTone = (t) => typeStyle(t).text;
export const typeShort = (t) => ({ 'User Story': 'Story' })[t] || t;

// The parent type a work item is expected to hang under (null for top-level or standalone types like Bug).
export const expectedParent = (t) =>
  ({ Task: 'Story or Feature', 'User Story': 'Feature', Feature: 'Epic', Epic: 'Strategic Priority' })[t] ?? null;

export const BOARD_COLUMNS = [
  'New',
  'Backlog of ideas',
  'Product & Design',
  'Ready for development',
  'In Development',
  'QA/Testing',
  'Ready to flight',
  'Flighting',
  'Shipped/Closed',
  'Shipped',
];

export const columnRank = (c) => {
  const i = BOARD_COLUMNS.indexOf(c);
  return i < 0 ? BOARD_COLUMNS.length : i;
};
