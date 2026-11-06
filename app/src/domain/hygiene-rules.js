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
export const requiresFeature = (type) => type !== 'Bug';

export const IDLE_DAYS = 7;
// Info reasons are shown for context but don't count as something to fix.
export const needsAction = (reasons) => reasons.some((r) => r.severity !== 'info');

// Features your open work rolls up to that sit inside a sprint instead of the sprint root.
export function featuresInSprint(items, features, data) {
  const used = new Set(items.filter((i) => !isDone(i) && i.featureId).map((i) => i.featureId));
  return features.filter((f) => used.has(f.id) && isInSprint(f.iterationPath, data));
}

export function featureComplianceExplanation(item, feature) {
  if (!feature && !item?.featureId) {
    return 'Not linked to any parent Feature. Because team delivery is tracked on aka.ms/sa-kanban at the Feature level, unparented work has no visibility on the team board. Press F or click to pick a board Feature.';
  }
  const f = feature || {};
  const where = f.iterationPath || f.areaPath || 'outside SAN SA\\Sprint';
  return `Parent Feature${f.id ? ` #${f.id}` : ''}${f.title ? ` ("${f.title}")` : ''} is in "${where}" instead of Area SAN SA and Iteration SAN SA\\Sprint, so it does not appear on aka.ms/sa-kanban and work under it has no team board visibility.`;
}

export function missingTagsExplanation(missingCycle, missingPlatform) {
  if (missingCycle && missingPlatform) {
    return `Missing both the current cycle tag (${CURRENT_CYCLE_TAG}) and a platform tag (${PLATFORM_TAGS.join(', ')}). Without them, this ticket is excluded from cycle reporting and platform dashboards.`;
  }
  if (missingCycle) {
    return `Missing the current cycle tag (${CURRENT_CYCLE_TAG}). Every open ticket must be tagged with the active cycle so work is counted in cycle planning and delivery queries.`;
  }
  if (missingPlatform) {
    return `Missing a platform tag (${PLATFORM_TAGS.join(', ')}). Every ticket needs a platform tag so work is attributed to its target surface in SAN SA queries and dashboards.`;
  }
  return '';
}

export function attentionReasons(item, data, featureById) {
  if (isDone(item)) return [];
  const reasons = [];
  if (!canBeInSprint(item.type) && isInSprint(item.iterationPath, data)) {
    const kind = typeShort(item.type);
    reasons.push({
      key: 'not-sprintable',
      label: `${kind} in a sprint`,
      severity: 'high',
      explanation: `${kind} items represent larger deliverables and belong in the ${data.backlogPath || 'SAN SA\\Sprint'} backlog root. Only Tasks and Bugs go into individual sprints—putting a ${kind} in a sprint distorts sprint execution tracking.`,
    });
  }
  if (requiresFeature(item.type)) {
    if (!item.featureId) {
      reasons.push({
        key: 'no-feature',
        label: 'No parent Feature',
        severity: 'high',
        explanation: featureComplianceExplanation(item, null),
      });
    } else if (!item.onBoard) {
      const f = featureById.get(item.featureId);
      reasons.push({
        key: 'off-board',
        label: `Feature not on board${f ? ` (${f.iterationPath.split('\\').slice(-2).join('\\')})` : ''}`,
        severity: 'high',
        explanation: featureComplianceExplanation(item, f),
      });
    }
  }
  if (!hasCycleTag(item)) {
    reasons.push({
      key: 'missing-cycle',
      label: `Missing cycle (${CURRENT_CYCLE_TAG})`,
      severity: 'medium',
      explanation: missingTagsExplanation(true, false),
    });
  }
  if (!hasPlatformTag(item)) {
    reasons.push({
      key: 'missing-platform',
      label: 'Missing platform tag',
      severity: 'medium',
      explanation: missingTagsExplanation(false, true),
    });
  }
  if (!isUnderSprintRoot(item, data)) {
    reasons.push({
      key: 'legacy-iteration',
      label: 'Legacy iteration',
      severity: 'medium',
      explanation: `This ticket sits in "${item.iterationPath}", outside the ${data.backlogPath || 'SAN SA\\Sprint'} hierarchy. Tickets in legacy or monthly iterations do not show up in active sprint boards or backlog filters.`,
    });
  }
  const sprint = data.sprints.find((s) => s.path === item.iterationPath);
  if (sprint?.timeFrame === 'past') {
    reasons.push({
      key: 'past-sprint',
      label: 'Open in a past sprint',
      severity: 'medium',
      explanation: `This ticket is still open inside a completed sprint (${sprint.name}). Move it to the current sprint, an upcoming sprint, or the backlog—or close it if the work is already finished.`,
    });
  }
  if (item.weeksCarried >= 4) {
    reasons.push({
      key: 'carried',
      label: `Carried ${item.weeksCarried} weeks`,
      severity: 'info',
      explanation: `Informational: this ticket has accumulated ${item.weeksCarried} weekly carry-over tags. Long-carried items often hide oversized scope or blockers—consider splitting it or returning it to the backlog.`,
    });
  }
  // Gone quiet: started work, or anything planned into the sprint in progress, that nobody has touched in ADO for a week.
  const idleDays = item.changedDate ? Math.floor((Date.now() - Date.parse(item.changedDate)) / 86400000) : 0;
  if (canBeInSprint(item.type) && idleDays >= IDLE_DAYS && (item.state !== 'New' || sprint?.timeFrame === 'current')) {
    reasons.push({
      key: 'idle',
      label: `No update in ${idleDays} days`,
      severity: 'low',
      explanation: `This ticket is active or scheduled in the current sprint, but hasn't been updated in Azure DevOps for ${idleDays} days. Update its state, post a progress comment, or move it back to the backlog if paused.`,
    });
  }
  if (item.type === 'User Story' && item.childCount > 0 && item.openChildCount === 0 && item.childrenKnown) {
    reasons.push({
      key: 'story-done',
      label: 'All children closed',
      severity: 'low',
      explanation: `All ${item.childCount} child items under this User Story are closed, while the Story itself is still "${item.state}". Close the Story if the deliverable is complete so Feature progress stays accurate.`,
    });
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
