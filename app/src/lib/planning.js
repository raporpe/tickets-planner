export const DONE_STATES = ['Closed', 'Removed', 'Done'];
export const isDone = (item) => DONE_STATES.includes(item.state);

const STATE_TONE = {
  New: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/25',
  Active: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  'Work in Progress': 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  Resolved: 'bg-teal-500/15 text-teal-300 ring-teal-400/30',
  Flighting: 'bg-violet-500/15 text-violet-300 ring-violet-400/30',
  Pending: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  'On Hold': 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  'At Risk': 'bg-orange-500/15 text-orange-300 ring-orange-400/30',
  Blocked: 'bg-red-500/15 text-red-300 ring-red-400/30',
  Closed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  Removed: 'bg-zinc-500/10 text-zinc-500 ring-zinc-500/20',
};
export const stateTone = (s) => STATE_TONE[s] || STATE_TONE.New;

const TYPE_TONE = {
  Task: 'text-amber-300',
  Bug: 'text-red-300',
  'User Story': 'text-sky-300',
};
export const typeTone = (t) => TYPE_TONE[t] || 'text-muted-foreground';
export const typeShort = (t) => ({ 'User Story': 'Story' })[t] || t;

export const BOARD_COLUMNS = [
  'New',
  'Backlog of ideas',
  'Product & Design',
  'Ready for development',
  'In Development',
  'Ready to flight',
  'Flighting',
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

export function attentionReasons(item, data, featureById) {
  if (isDone(item)) return [];
  const reasons = [];
  if (!item.featureId) reasons.push({ key: 'no-feature', label: 'No parent Feature', severity: 'high' });
  else if (!item.onBoard) {
    const f = featureById.get(item.featureId);
    reasons.push({ key: 'off-board', label: `Feature not on board${f ? ` (${f.iterationPath.split('\\').slice(-2).join('\\')})` : ''}`, severity: 'high' });
  }
  if (!isUnderSprintRoot(item, data)) reasons.push({ key: 'legacy-iteration', label: 'Legacy iteration', severity: 'medium' });
  const sprint = data.sprints.find((s) => s.path === item.iterationPath);
  if (sprint?.timeFrame === 'past') reasons.push({ key: 'past-sprint', label: 'Open in a past sprint', severity: 'medium' });
  if (item.iterationPath === data.backlogPath && ['Active', 'Work in Progress'].includes(item.state)) {
    reasons.push({ key: 'active-backlog', label: 'Active but unplanned', severity: 'low' });
  }
  if (item.weeksCarried >= 4) reasons.push({ key: 'stale', label: `Carried ${item.weeksCarried} weeks`, severity: 'low' });
  if (item.type === 'User Story' && item.childCount > 0 && item.openChildCount === 0 && item.childrenKnown) {
    reasons.push({ key: 'story-done', label: 'All children closed', severity: 'low' });
  }
  return reasons;
}

export function matchesFilters(item, filters, featureById) {
  if (!filters.showClosed && isDone(item)) return false;
  if (filters.types.length && !filters.types.includes(item.type)) return false;
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
