import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PRIORITIES, priorityTone } from '../priority-scale.js';
import {
  DONE_STATES,
  isDone,
  SPRINT_TYPES,
  canBeInSprint,
  isInSprint,
  isUnderSprintRoot,
  OTHER,
  buildColumns,
  columnKeyOf,
} from '../sprint-policy.js';
import {
  CURRENT_CYCLE_TAG,
  PLATFORM_TAGS,
  SPRINT_UNPLANNED_TAG,
  hasCycleTag,
  hasPlatformTag,
  isSprintUnplanned,
  attentionReasons,
  featuresInSprint,
  needsAction,
  matchesFilters,
} from '../hygiene-rules.js';
import {
  stateTone,
  typeStyle,
  typeTone,
  typeShort,
  expectedParent,
  BOARD_COLUMNS,
  columnRank,
} from '../theme-tones.js';
import { WorkspaceState } from '../../lib/workspace-state.js';

const MOCK_OVERVIEW = {
  backlogPath: 'SAN SA\\Sprint',
  sprints: [
    { name: '2026.01', path: 'SAN SA\\Sprint\\2026.01', timeFrame: 'past', start: '2026-01-01T00:00:00Z', finish: '2026-01-07T00:00:00Z' },
    { name: '2026.02', path: 'SAN SA\\Sprint\\2026.02', timeFrame: 'current', start: '2026-01-08T00:00:00Z', finish: '2026-01-14T00:00:00Z' },
    { name: '2026.03', path: 'SAN SA\\Sprint\\2026.03', timeFrame: 'future', start: '2026-01-15T00:00:00Z', finish: '2026-01-21T00:00:00Z' },
  ],
};

describe('priority-scale domain', () => {
  it('defines P0 through P4 with hints, rules, and SLAs', () => {
    assert.equal(PRIORITIES.length, 5);
    assert.deepEqual(
      PRIORITIES.map((p) => p.label),
      ['P0', 'P1', 'P2', 'P3', 'P4'],
    );
    assert.deepEqual(
      PRIORITIES.map((p) => p.value),
      [0, 1, 2, 3, 4],
    );
    for (const p of PRIORITIES) {
      assert.ok(p.hint.length > 0);
      assert.ok(p.rule.length > 0);
      assert.ok(p.sla.length > 0);
    }
  });

  it('maps priority levels 0..4 to distinct tones and defaults unknown to P3', () => {
    assert.match(priorityTone(0), /rose/);
    assert.match(priorityTone(1), /amber/);
    assert.match(priorityTone(2), /bg-muted/);
    assert.equal(priorityTone(99), priorityTone(3));
    assert.equal(priorityTone(undefined), priorityTone(3));
  });
});

describe('sprint-policy domain', () => {
  it('identifies done states accurately', () => {
    assert.deepEqual(DONE_STATES, ['Closed', 'Removed', 'Done']);
    assert.equal(isDone({ state: 'Closed' }), true);
    assert.equal(isDone({ state: 'Removed' }), true);
    assert.equal(isDone({ state: 'Done' }), true);
    assert.equal(isDone({ state: 'Active' }), false);
  });

  it('allows only Task and Bug in sprints', () => {
    assert.deepEqual(SPRINT_TYPES, ['Task', 'Bug']);
    assert.equal(canBeInSprint('Task'), true);
    assert.equal(canBeInSprint('Bug'), true);
    assert.equal(canBeInSprint('User Story'), false);
    assert.equal(canBeInSprint('Feature'), false);
  });

  it('classifies sprint paths, backlog root, and column keys', () => {
    assert.equal(isInSprint('SAN SA\\Sprint\\2026.02', MOCK_OVERVIEW), true);
    assert.equal(isInSprint('SAN SA\\Sprint', MOCK_OVERVIEW), false);
    assert.equal(isUnderSprintRoot({ iterationPath: 'SAN SA\\Sprint' }, MOCK_OVERVIEW), true);
    assert.equal(isUnderSprintRoot({ iterationPath: 'SAN SA\\Sprint\\2026.02' }, MOCK_OVERVIEW), true);
    assert.equal(isUnderSprintRoot({ iterationPath: 'SAN SA\\Month\\Feb' }, MOCK_OVERVIEW), false);

    assert.equal(columnKeyOf({ iterationPath: 'SAN SA\\Sprint' }, MOCK_OVERVIEW), 'SAN SA\\Sprint');
    assert.equal(columnKeyOf({ iterationPath: 'SAN SA\\Sprint\\2026.02' }, MOCK_OVERVIEW), 'SAN SA\\Sprint\\2026.02');
    assert.equal(columnKeyOf({ iterationPath: 'SAN SA\\Month\\Feb' }, MOCK_OVERVIEW), OTHER);

    const cols = buildColumns(MOCK_OVERVIEW);
    assert.equal(cols.length, 5);
    assert.equal(cols[0].kind, 'backlog');
    assert.equal(cols[cols.length - 1].key, OTHER);
  });
});

describe('hygiene-rules domain', () => {
  it('recognizes cycle, platform, and sprint-unplanned tags case-insensitively', () => {
    assert.equal(CURRENT_CYCLE_TAG, 'FY26 C5');
    assert.ok(PLATFORM_TAGS.includes('Backend'));
    assert.equal(SPRINT_UNPLANNED_TAG, 'Sprint-Unplanned');

    assert.equal(hasCycleTag({ tags: ['fy26 c5', 'iOS'] }), true);
    assert.equal(hasCycleTag({ tags: ['FY27C1'] }), true);
    assert.equal(hasCycleTag({ tags: ['Backend'] }), false);

    assert.equal(hasPlatformTag({ tags: ['miniapps'] }), true);
    assert.equal(hasPlatformTag({ tags: ['Android'] }), true);
    assert.equal(hasPlatformTag({ tags: ['FY26 C5'] }), false);

    assert.equal(isSprintUnplanned({ tags: ['sprint-unplanned'] }), true);
    assert.equal(isSprintUnplanned({ tags: ['FY26 C5'] }), false);
  });

  it('flags stories in sprint, off-board features, missing tags, and idle items', () => {
    const featureById = new Map([
      [500, { id: 500, title: 'Auth Feature', iterationPath: 'SAN SA\\Month\\Legacy' }],
    ]);
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();

    const item = {
      id: 10,
      type: 'User Story',
      state: 'Active',
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      featureId: 500,
      onBoard: false,
      tags: [],
      weeksCarried: 5,
      changedDate: tenDaysAgo,
      childCount: 2,
      openChildCount: 0,
      childrenKnown: true,
    };

    const reasons = attentionReasons(item, MOCK_OVERVIEW, featureById);
    const keys = reasons.map((r) => r.key);
    assert.ok(keys.includes('not-sprintable'));
    assert.ok(keys.includes('off-board'));
    assert.ok(keys.includes('missing-cycle'));
    assert.ok(keys.includes('missing-platform'));
    assert.ok(keys.includes('carried'));
    assert.ok(keys.includes('story-done'));
    assert.equal(needsAction(reasons), true);

    const idleTask = {
      id: 11,
      type: 'Task',
      state: 'Active',
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      featureId: 500,
      onBoard: true,
      tags: ['FY26 C5', 'Backend'],
      weeksCarried: 0,
      changedDate: tenDaysAgo,
    };
    const taskReasons = attentionReasons(idleTask, MOCK_OVERVIEW, featureById);
    assert.deepEqual(
      taskReasons.map((r) => r.key),
      ['idle'],
    );
  });

  it('finds features misplaced inside a sprint and filters items', () => {
    const items = [{ id: 1, state: 'Active', featureId: 100, title: 'Fix crash', tags: ['iOS'] }];
    const features = [
      { id: 100, title: 'Mobile Shell', iterationPath: 'SAN SA\\Sprint\\2026.02' },
      { id: 101, title: 'Root Feature', iterationPath: 'SAN SA\\Sprint' },
    ];
    const misplaced = featuresInSprint(items, features, MOCK_OVERVIEW);
    assert.equal(misplaced.length, 1);
    assert.equal(misplaced[0].id, 100);

    const featureById = new Map(features.map((f) => [f.id, f]));
    assert.equal(matchesFilters(items[0], { showClosed: false, search: 'mobile' }, featureById), true);
    assert.equal(matchesFilters(items[0], { showClosed: false, search: 'nonexistent' }, featureById), false);
  });
});

describe('theme-tones domain', () => {
  it('resolves tones, parent expectations, and board column ranks', () => {
    assert.equal(typeShort('User Story'), 'Story');
    assert.equal(typeShort('Task'), 'Task');
    assert.equal(expectedParent('Task'), 'Story or Feature');
    assert.equal(expectedParent('User Story'), 'Feature');
    assert.equal(expectedParent('Feature'), 'Epic');
    assert.ok(stateTone('Active').includes('sky'));
    assert.ok(typeTone('Bug').includes('rose'));
    assert.ok(typeStyle('Epic').dot.includes('violet'));
    assert.equal(columnRank('New'), 0);
    assert.equal(columnRank('Unknown Column'), BOARD_COLUMNS.length);
  });
});

describe('WorkspaceState LWW merge and reconciliation', () => {
  it('merges layout and notes per-item using Last-Write-Wins and respects tombstones', () => {
    const state = new WorkspaceState();
    clearTimeout(state._timer);

    state.placeCards({
      101: { col: 'SAN SA\\Sprint\\2026.02', px: 40, y: 80, z: 2 },
      102: { col: 'SAN SA\\Sprint\\2026.02', px: 100, y: 120, z: 3 },
    });
    clearTimeout(state._timer);

    const localAt = state._layoutRecords['101'].at;

    // Simulate remote payload where 101 has an older timestamp, 102 is deleted more recently, and 103 is new
    state._mergeRemote(
      {
        layout: {
          items: {
            101: { col: 'SAN SA\\Sprint\\2026.01', px: 10, y: 10, z: 1, at: localAt - 5000 },
            102: { deleted: true, at: localAt + 5000 },
            103: { col: 'SAN SA\\Sprint\\2026.03', px: 200, y: 60, z: 4, at: localAt + 1000 },
          },
        },
      },
      { allowSchedule: false },
    );

    const view = state.getLayout();
    assert.equal(view['101'].col, 'SAN SA\\Sprint\\2026.02');
    assert.equal(view['102'], undefined);
    assert.equal(view['103'].col, 'SAN SA\\Sprint\\2026.03');
  });

  it('prunes cards whose ticket moved to another sprint or disappeared in reconcileWithOverview', () => {
    const state = new WorkspaceState();
    clearTimeout(state._timer);

    state.placeCards({
      201: { col: 'SAN SA\\Sprint\\2026.02', px: 30, y: 50, z: 1 },
      202: { col: 'SAN SA\\Sprint\\2026.02', px: 90, y: 50, z: 2 },
      203: { col: 'SAN SA\\Sprint\\2026.02', px: 150, y: 50, z: 3 },
    });
    clearTimeout(state._timer);

    // 201 stays in 2026.02, 202 moved to 2026.03 in ADO, 203 was deleted/unassigned
    state.reconcileWithOverview({
      ...MOCK_OVERVIEW,
      items: [
        { id: 201, iterationPath: 'SAN SA\\Sprint\\2026.02' },
        { id: 202, iterationPath: 'SAN SA\\Sprint\\2026.03' },
      ],
    });
    clearTimeout(state._timer);

    const view = state.getLayout();
    assert.ok(view['201']);
    assert.equal(view['202'], undefined);
    assert.equal(view['203'], undefined);
    assert.equal(state._layoutRecords['202'].deleted, true);
    assert.equal(state._layoutRecords['203'].deleted, true);
  });
});
