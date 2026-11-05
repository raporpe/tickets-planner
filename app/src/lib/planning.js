export const DONE_STATES = ['Closed', 'Removed', 'Done'];
export const isDone = (item) => DONE_STATES.includes(item.state);

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

// The parent type a work item is expected to hang under (null for top-level types).
export const expectedParent = (t) =>
  ({ Task: 'Story or Feature', Bug: 'Story or Feature', 'User Story': 'Feature', Feature: 'Epic', Epic: 'Strategic Priority' })[t] ?? null;

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

const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const fmtDate = (d) => (d ? fmt.format(new Date(d)) : '');
export const sprintRange = (s) => (s.start ? `${fmtDate(s.start)} – ${fmtDate(s.finish)}` : 'No dates');

export const OTHER = '__other__';

export function buildColumns(data) {
  return [
    { key: data.backlogPath, path: data.backlogPath, title: 'Backlog', subtitle: 'Not planned', kind: 'backlog' },
    ...data.sprints.map((s) => ({
      key: s.path,
      path: s.path,
      title: s.name,
      subtitle: sprintRange(s),
      kind: 'sprint',
      sprint: s,
    })),
    { key: OTHER, path: null, title: 'Other iterations', subtitle: 'Legacy Month / past paths', kind: 'other' },
  ];
}

export function columnKeyOf(item, data) {
  if (item.iterationPath === data.backlogPath) return data.backlogPath;
  if (data.sprints.some((s) => s.path === item.iterationPath)) return item.iterationPath;
  return OTHER;
}

export function isUnderSprintRoot(item, data) {
  return item.iterationPath === data.backlogPath || item.iterationPath.startsWith(`${data.backlogPath}\\`);
}

// Only Tasks and Bugs are planned into sprints; Stories and Features always stay on the `SAN SA\Sprint` backlog.
export const SPRINT_TYPES = ['Task', 'Bug'];
export const canBeInSprint = (type) => SPRINT_TYPES.includes(type);
export const isInSprint = (path, data) => path.startsWith(`${data.backlogPath}\\`);

export const IDLE_DAYS = 7;
// Info reasons are shown for context but don't count as something to fix.
export const needsAction = (reasons) => reasons.some((r) => r.severity !== 'info');

// Features your open work rolls up to that sit inside a sprint instead of the sprint root.
export function featuresInSprint(items, features, data) {
  const used = new Set(items.filter((i) => !isDone(i) && i.featureId).map((i) => i.featureId));
  return features.filter((f) => used.has(f.id) && isInSprint(f.iterationPath, data));
}

export function attentionReasons(item, data, featureById) {
  if (isDone(item)) return [];
  const reasons = [];
  if (!canBeInSprint(item.type) && isInSprint(item.iterationPath, data)) {
    reasons.push({ key: 'not-sprintable', label: `${typeShort(item.type)} in a sprint`, severity: 'high' });
  }
  if (!item.featureId) reasons.push({ key: 'no-feature', label: 'No parent Feature', severity: 'high' });
  else if (!item.onBoard) {
    const f = featureById.get(item.featureId);
    reasons.push({ key: 'off-board', label: `Feature not on board${f ? ` (${f.iterationPath.split('\\').slice(-2).join('\\')})` : ''}`, severity: 'high' });
  }
  if (!isUnderSprintRoot(item, data)) reasons.push({ key: 'legacy-iteration', label: 'Legacy iteration', severity: 'medium' });
  const sprint = data.sprints.find((s) => s.path === item.iterationPath);
  if (sprint?.timeFrame === 'past') reasons.push({ key: 'past-sprint', label: 'Open in a past sprint', severity: 'medium' });
  if (item.weeksCarried >= 4) reasons.push({ key: 'carried', label: `Carried ${item.weeksCarried} weeks`, severity: 'info' });
  // Gone quiet: started work, or anything planned into the sprint in progress, that nobody has touched in ADO for a week.
  const idleDays = item.changedDate ? Math.floor((Date.now() - Date.parse(item.changedDate)) / 86400000) : 0;
  if (canBeInSprint(item.type) && idleDays >= IDLE_DAYS && (item.state !== 'New' || sprint?.timeFrame === 'current')) {
    reasons.push({ key: 'idle', label: `No update in ${idleDays} days`, severity: 'low' });
  }
  if (item.type === 'User Story' && item.childCount > 0 && item.openChildCount === 0 && item.childrenKnown) {
    reasons.push({ key: 'story-done', label: 'All children closed', severity: 'low' });
  }
  return reasons;
}

export function matchesFilters(item, filters, featureById) {
  if (!filters.showClosed && isDone(item)) return false;
  const q = filters.search.trim().toLowerCase();
  if (!q) return true;
  const feature = featureById.get(item.featureId);
  return (
    String(item.id).includes(q) ||
    item.title.toLowerCase().includes(q) ||
    item.tags.some((t) => t.toLowerCase().includes(q)) ||
    (feature && feature.title.toLowerCase().includes(q))
  );
}

