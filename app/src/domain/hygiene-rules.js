import { canBeInSprint, isDone, isInSprint, isUnderSprintRoot } from './sprint-policy.js';
import { typeShort } from './theme-tones.js';

export const CURRENT_CYCLE_TAG = 'FY26 C5';
export const PLATFORM_TAGS = ['iOS', 'Android', 'Backend', 'MiniApps'];
export const SPRINT_UNPLANNED_TAG = 'Sprint-Unplanned';

export const isCycleTag = (t) => /^FY\d{2}\s*C\d+$/i.test(String(t || '').trim());
export const isPlatformTag = (t) => /^(ios|android|backend|miniapps?|mobile|web|windows|macos)$/i.test(String(t || '').trim());
export const isSprintUnplannedTag = (t) => String(t || '').trim().toLowerCase() === SPRINT_UNPLANNED_TAG.toLowerCase();

export const hasCycleTag = (item) => (item?.tags || []).some(isCycleTag);
export const hasPlatformTag = (item) => (item?.tags || []).some(isPlatformTag);
export const isSprintUnplanned = (item) => (item?.tags || []).some(isSprintUnplannedTag);

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
  if (!hasCycleTag(item)) {
    reasons.push({ key: 'missing-cycle', label: `Missing cycle (${CURRENT_CYCLE_TAG})`, severity: 'medium' });
  }
  if (!hasPlatformTag(item)) {
    reasons.push({ key: 'missing-platform', label: 'Missing platform tag', severity: 'medium' });
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
