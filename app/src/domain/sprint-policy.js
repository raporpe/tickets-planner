export const DONE_STATES = ['Closed', 'Removed', 'Done'];
export const isDone = (item) => DONE_STATES.includes(item.state);

// Only Tasks and Bugs are planned into sprints; Stories and Features always stay on the `SAN SA\Sprint` backlog.
export const SPRINT_TYPES = ['Task', 'Bug'];
export const canBeInSprint = (type) => SPRINT_TYPES.includes(type);
export const isInSprint = (path, data) => path.startsWith(`${data.backlogPath}\\`);

export function isUnderSprintRoot(item, data) {
  return item.iterationPath === data.backlogPath || item.iterationPath.startsWith(`${data.backlogPath}\\`);
}

export const OTHER = '__other__';

const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const fmtDate = (d) => (d ? fmt.format(new Date(d)) : '');
export const sprintRange = (s) => (s.start ? `${fmtDate(s.start)} – ${fmtDate(s.finish)}` : 'No dates');

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
