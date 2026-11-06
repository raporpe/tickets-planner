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

const DAY_MS = 86400000;

/**
 * Computes sprint progress and remaining days counting only working days (Mon–Fri, UTC),
 * excluding weekends (Sat/Sun) from both the elapsed percentage and remaining day count.
 */
export function computeWorkingSprintTiming(sprint, nowMs = Date.now()) {
  const startRaw = sprint?.start || sprint?.startDate;
  const finishRaw = sprint?.finish || sprint?.finishDate;
  if (!startRaw || !finishRaw) return null;

  const startMs = Date.parse(startRaw);
  const finishMs = Date.parse(finishRaw);
  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs < startMs) return null;

  const firstDayStart = Date.UTC(
    new Date(startMs).getUTCFullYear(),
    new Date(startMs).getUTCMonth(),
    new Date(startMs).getUTCDate(),
  );
  const lastDayStart = Date.UTC(
    new Date(finishMs).getUTCFullYear(),
    new Date(finishMs).getUTCMonth(),
    new Date(finishMs).getUTCDate(),
  );

  let totalDays = 0;
  let elapsedWorkMs = 0;
  let remainingDays = 0;

  for (let dayStart = firstDayStart; dayStart <= lastDayStart; dayStart += DAY_MS) {
    const dow = new Date(dayStart).getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip Sunday (0) and Saturday (6)
    totalDays += 1;
    const dayEnd = dayStart + DAY_MS;
    if (nowMs >= dayEnd) {
      elapsedWorkMs += DAY_MS;
    } else if (nowMs > dayStart) {
      elapsedWorkMs += nowMs - dayStart;
      remainingDays += 1;
    } else {
      remainingDays += 1;
    }
  }

  if (totalDays === 0) return null;
  const totalWorkMs = totalDays * DAY_MS;
  const elapsedPct = Math.min(100, Math.max(0, Math.round((elapsedWorkMs / totalWorkMs) * 100)));
  const remainingPct = 100 - elapsedPct;

  return { totalDays, elapsedPct, remainingPct, remainingDays };
}
