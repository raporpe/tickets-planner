const NOW = Date.now();
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

const ME = {
  id: 'mock-user-raulpo',
  name: 'Raul Portillo (Mock)',
  email: 'raulpo@microsoft.com',
};

const SPRINTS = [
  {
    id: 'sprint-past-01',
    name: '2026.01',
    path: 'SAN SA\\Sprint\\2026.01',
    startDate: daysAgo(28),
    finishDate: daysAgo(15),
    timeFrame: 'past',
  },
  {
    id: 'sprint-cur-02',
    name: '2026.02',
    path: 'SAN SA\\Sprint\\2026.02',
    startDate: daysAgo(14),
    finishDate: daysAgo(-1),
    timeFrame: 'current',
  },
  {
    id: 'sprint-fut-03',
    name: '2026.03',
    path: 'SAN SA\\Sprint\\2026.03',
    startDate: daysAgo(-1),
    finishDate: daysAgo(-14),
    timeFrame: 'future',
  },
  {
    id: 'sprint-fut-04',
    name: '2026.04',
    path: 'SAN SA\\Sprint\\2026.04',
    startDate: daysAgo(-15),
    finishDate: daysAgo(-28),
    timeFrame: 'future',
  },
];

const FEATURE_COLUMNS = [
  { name: 'New', state: 'New', type: 'incoming' },
  { name: 'Backlog of ideas', state: 'Active', type: 'inProgress' },
  { name: 'Product & Design', state: 'Active', type: 'inProgress' },
  { name: 'Ready for development', state: 'Active', type: 'inProgress' },
  { name: 'In Development', state: 'Work in Progress', type: 'inProgress' },
  { name: 'QA/Testing', state: 'Testing', type: 'inProgress' },
  { name: 'Ready to flight', state: 'Resolved', type: 'inProgress' },
  { name: 'Flighting', state: 'Flighting', type: 'inProgress' },
  { name: 'Shipped/Closed', state: 'Closed', type: 'outgoing' },
];

const STATES = {
  Task: ['New', 'Active', 'Closed', 'Removed'],
  Bug: ['New', 'Active', 'Resolved', 'Closed', 'Removed'],
  'User Story': ['New', 'Active', 'Resolved', 'Closed', 'Removed'],
  Feature: ['New', 'Active', 'Work in Progress', 'Testing', 'Resolved', 'Flighting', 'Closed', 'Removed'],
};

const BASE_EDIT = 'https://msasg.visualstudio.com/SAN%20SA/_workitems/edit';

function buildInitialMockOverview(preset = 'all-cases') {
  const features = [
    {
      id: 10800101,
      url: `${BASE_EDIT}/10800101`,
      title: 'Sapphire Mobile Core Experience & Startup Reliability',
      state: 'Work in Progress',
      column: 'In Development',
      lane: 'Core Experience & Quality',
      onBoard: true,
      areaPath: 'SAN SA\\Scaffolding\\Fundamental',
      iterationPath: 'SAN SA\\Sprint',
      owner: ME.name,
    },
    {
      id: 10800102,
      url: `${BASE_EDIT}/10800102`,
      title: 'MiniApps Bridge v2 & Telemetry Pipeline',
      state: 'Flighting',
      column: 'Flighting',
      lane: 'Growth',
      onBoard: true,
      areaPath: 'SAN SA\\Scaffolding\\Fundamental',
      iterationPath: 'SAN SA\\Sprint',
      owner: ME.name,
    },
    {
      id: 10800103,
      url: `${BASE_EDIT}/10800103`,
      title: 'Push Notification Volume Reduction & Smart Quiet Hours',
      state: 'Active',
      column: 'Ready for development',
      lane: 'Growth',
      onBoard: true,
      areaPath: 'SAN SA\\Initiative',
      iterationPath: 'SAN SA\\Sprint',
      owner: ME.name,
    },
    {
      id: 10800104,
      url: `${BASE_EDIT}/10800104`,
      title: 'Legacy Month Iteration Feature (Off-board compliance case)',
      state: 'Active',
      column: null,
      lane: null,
      onBoard: false,
      areaPath: 'SAN SA\\Initiative',
      iterationPath: 'SAN SA\\Month\\2026.03',
      owner: ME.name,
    },
    {
      id: 10800105,
      url: `${BASE_EDIT}/10800105`,
      title: 'Feature Misplaced Inside Active Sprint 2026.02',
      state: 'Work in Progress',
      column: 'In Development',
      lane: 'Core Experience & Quality',
      onBoard: true,
      areaPath: 'SAN SA\\Scaffolding\\Fundamental',
      iterationPath: preset === 'all-clear' ? 'SAN SA\\Sprint' : 'SAN SA\\Sprint\\2026.02',
      owner: ME.name,
    },
    {
      id: 10800106,
      url: `${BASE_EDIT}/10800106`,
      title: 'Empty Board Feature (Visible when showing empty features)',
      state: 'Active',
      column: 'Product & Design',
      lane: 'Others',
      onBoard: true,
      areaPath: 'SAN SA\\Scaffolding\\Fundamental',
      iterationPath: 'SAN SA\\Sprint',
      owner: 'Teammate',
    },
  ];

  if (preset === 'all-clear') {
    return {
      generatedAt: new Date().toISOString(),
      project: 'SAN SA (Mock · Clean)',
      backlogPath: 'SAN SA\\Sprint',
      me: ME,
      sprints: SPRINTS,
      featureColumns: FEATURE_COLUMNS,
      states: STATES,
      features: features.filter((f) => f.onBoard),
      items: [
        {
          id: 10850001,
          url: `${BASE_EDIT}/10850001`,
          type: 'Task',
          title: 'Audit cold-start token cache latency on Android',
          state: 'Active',
          priority: 1,
          iterationPath: 'SAN SA\\Sprint\\2026.02',
          parentId: 10800101,
          featureId: 10800101,
          onBoard: true,
          chain: [{ id: 10800101, type: 'Feature', title: 'Sapphire Mobile Core Experience & Startup Reliability', state: 'Work in Progress' }],
          tags: ['FY26 C5', 'Android', '20261102'],
          weeksCarried: 1,
          changedDate: daysAgo(1),
          childCount: 0,
          openChildCount: 0,
          childrenKnown: true,
        },
        {
          id: 10850002,
          url: `${BASE_EDIT}/10850002`,
          type: 'Bug',
          title: 'Standalone Bug without parent Feature (allowed by relaxed rule)',
          state: 'Active',
          priority: 0,
          iterationPath: 'SAN SA\\Sprint\\2026.02',
          parentId: null,
          featureId: null,
          onBoard: false,
          chain: [],
          tags: ['FY26 C5', 'iOS', 'Sprint-Unplanned', '20261102'],
          weeksCarried: 1,
          changedDate: daysAgo(0),
          childCount: 0,
          openChildCount: 0,
          childrenKnown: true,
        },
        {
          id: 10850003,
          url: `${BASE_EDIT}/10850003`,
          type: 'Task',
          title: 'Carried 6 weeks task (informational only, Sapphiry still happy)',
          state: 'Active',
          priority: 2,
          iterationPath: 'SAN SA\\Sprint\\2026.02',
          parentId: 10800102,
          featureId: 10800102,
          onBoard: true,
          chain: [{ id: 10800102, type: 'Feature', title: 'MiniApps Bridge v2 & Telemetry Pipeline', state: 'Flighting' }],
          tags: ['FY26 C5', 'MiniApps', '20260928', '20261005', '20261012', '20261019', '20261026', '20261102'],
          weeksCarried: 6,
          changedDate: daysAgo(2),
          childCount: 0,
          openChildCount: 0,
          childrenKnown: true,
        },
      ],
    };
  }

  const items = [
    // 1. P0 Unplanned Bug (standalone — no parent Feature required!)
    {
      id: 10842501,
      url: `${BASE_EDIT}/10842501`,
      type: 'Bug',
      title: 'P0 crash on startup when Azure CLI token expires mid-session (Standalone Bug, no Feature needed)',
      state: 'Active',
      priority: 0,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: null,
      featureId: null,
      onBoard: false,
      chain: [],
      tags: ['FY26 C5', 'Android', 'Sprint-Unplanned', '20261102'],
      weeksCarried: 1,
      changedDate: daysAgo(0),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 2. P1 Task with a very long title + 8-digit ID to verify ItemRow P-pill & drawer title truncation
    {
      id: 10842502,
      url: `${BASE_EDIT}/10842502`,
      type: 'Task',
      title: 'Verify long 8-digit ID + P1 pill alignment and single-line title truncation without displacing header buttons in drawer',
      state: 'Active',
      priority: 1,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: 10830001,
      featureId: 10800101,
      onBoard: true,
      chain: [
        { id: 10830001, type: 'User Story', title: 'Startup & Auth Resilience', state: 'Active' },
        { id: 10800101, type: 'Feature', title: 'Sapphire Mobile Core Experience & Startup Reliability', state: 'Work in Progress' },
      ],
      tags: ['FY26 C5', 'iOS', '20261102'],
      weeksCarried: 1,
      changedDate: daysAgo(1),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 3. Compliance case: User Story inside an active sprint (`not-sprintable`)
    {
      id: 10842503,
      url: `${BASE_EDIT}/10842503`,
      type: 'User Story',
      title: 'Story accidentally scheduled into Sprint 2026.02 instead of SAN SA\\Sprint backlog',
      state: 'Active',
      priority: 2,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: 10800101,
      featureId: 10800101,
      onBoard: true,
      chain: [{ id: 10800101, type: 'Feature', title: 'Sapphire Mobile Core Experience & Startup Reliability', state: 'Work in Progress' }],
      tags: ['FY26 C5', 'Android'],
      weeksCarried: 2,
      changedDate: daysAgo(2),
      childCount: 2,
      openChildCount: 1,
      childrenKnown: true,
    },
    // 4. Compliance case: Task with NO parent Feature (`no-feature`)
    {
      id: 10842504,
      url: `${BASE_EDIT}/10842504`,
      type: 'Task',
      title: 'Orphan Task with no parent Story or Feature (invisible on aka.ms/sa-kanban)',
      state: 'Active',
      priority: 1,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: null,
      featureId: null,
      onBoard: false,
      chain: [],
      tags: ['FY26 C5', 'Backend', '20261102'],
      weeksCarried: 1,
      changedDate: daysAgo(1),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 5. Compliance case: Task under an Off-board Feature (`off-board`)
    {
      id: 10842505,
      url: `${BASE_EDIT}/10842505`,
      type: 'Task',
      title: 'Task parented under a legacy off-board Feature in SAN SA\\Month\\2026.03',
      state: 'Active',
      priority: 2,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: 10800104,
      featureId: 10800104,
      onBoard: false,
      chain: [{ id: 10800104, type: 'Feature', title: 'Legacy Month Iteration Feature (Off-board compliance case)', state: 'Active' }],
      tags: ['FY26 C5', 'MiniApps', '20261102'],
      weeksCarried: 1,
      changedDate: daysAgo(2),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 6. Compliance case: Missing BOTH cycle tag (FY26 C5) and platform tag (`missing-cycle` + `missing-platform`)
    {
      id: 10842506,
      url: `${BASE_EDIT}/10842506`,
      type: 'Task',
      title: 'Telemetry schema migration missing both FY26 C5 cycle tag and platform tag',
      state: 'Active',
      priority: 2,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: 10800102,
      featureId: 10800102,
      onBoard: true,
      chain: [{ id: 10800102, type: 'Feature', title: 'MiniApps Bridge v2 & Telemetry Pipeline', state: 'Flighting' }],
      tags: ['telemetry', '20261102'],
      weeksCarried: 1,
      changedDate: daysAgo(1),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 7. Compliance case: Bug missing platform tag (`missing-platform`)
    {
      id: 10842507,
      url: `${BASE_EDIT}/10842507`,
      type: 'Bug',
      title: 'WebView bridge timeout on slow 3G networks (has FY26 C5, missing platform tag)',
      state: 'New',
      priority: 3,
      iterationPath: 'SAN SA\\Sprint\\2026.03',
      parentId: null,
      featureId: null,
      onBoard: false,
      chain: [],
      tags: ['FY26 C5'],
      weeksCarried: 0,
      changedDate: daysAgo(1),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 8. Compliance case: Open Task stranded in a past sprint (`past-sprint`)
    {
      id: 10842508,
      url: `${BASE_EDIT}/10842508`,
      type: 'Task',
      title: 'Rollout validation left open in completed Sprint 2026.01',
      state: 'Active',
      priority: 2,
      iterationPath: 'SAN SA\\Sprint\\2026.01',
      parentId: 10800102,
      featureId: 10800102,
      onBoard: true,
      chain: [{ id: 10800102, type: 'Feature', title: 'MiniApps Bridge v2 & Telemetry Pipeline', state: 'Flighting' }],
      tags: ['FY26 C5', 'Android', '20261019'],
      weeksCarried: 1,
      changedDate: daysAgo(3),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 9. Compliance case: Task in a retired Legacy Iteration (`legacy-iteration`)
    {
      id: 10842509,
      url: `${BASE_EDIT}/10842509`,
      type: 'Task',
      title: 'Cleanup old notification hooks stranded in legacy iteration SAN SA\\Month\\2026.02',
      state: 'New',
      priority: 3,
      iterationPath: 'SAN SA\\Month\\2026.02',
      parentId: 10800103,
      featureId: 10800103,
      onBoard: true,
      chain: [{ id: 10800103, type: 'Feature', title: 'Push Notification Volume Reduction & Smart Quiet Hours', state: 'Active' }],
      tags: ['FY26 C5', 'Backend'],
      weeksCarried: 0,
      changedDate: daysAgo(2),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 10. Compliance case: Gone quiet (`idle` — 11 days without update in current sprint) + Carried 5 weeks (`carried`)
    {
      id: 10842510,
      url: `${BASE_EDIT}/10842510`,
      type: 'Task',
      title: 'Investigate intermittent ANR in background sync worker (idle 11d + carried 5w)',
      state: 'Active',
      priority: 2,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: 10800105,
      featureId: 10800105,
      onBoard: true,
      chain: [{ id: 10800105, type: 'Feature', title: 'Feature Misplaced Inside Active Sprint 2026.02', state: 'Work in Progress' }],
      tags: ['FY26 C5', 'Android', '20261005', '20261012', '20261019', '20261026', '20261102'],
      weeksCarried: 5,
      changedDate: daysAgo(11),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 11. Compliance case: User Story whose children are all closed (`story-done`)
    {
      id: 10842511,
      url: `${BASE_EDIT}/10842511`,
      type: 'User Story',
      title: 'Quiet hours settings UI (all 3 child Tasks are Closed, Story still Active)',
      state: 'Active',
      priority: 2,
      iterationPath: 'SAN SA\\Sprint',
      parentId: 10800103,
      featureId: 10800103,
      onBoard: true,
      chain: [{ id: 10800103, type: 'Feature', title: 'Push Notification Volume Reduction & Smart Quiet Hours', state: 'Active' }],
      tags: ['FY26 C5', 'iOS'],
      weeksCarried: 0,
      changedDate: daysAgo(2),
      childCount: 3,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 12. P4 Backlog Task + Carried 7 weeks
    {
      id: 10842512,
      url: `${BASE_EDIT}/10842512`,
      type: 'Task',
      title: 'Polish empty-state illustration spacing on tablet portrait mode',
      state: 'New',
      priority: 4,
      iterationPath: 'SAN SA\\Sprint',
      parentId: 10800101,
      featureId: 10800101,
      onBoard: true,
      chain: [{ id: 10800101, type: 'Feature', title: 'Sapphire Mobile Core Experience & Startup Reliability', state: 'Work in Progress' }],
      tags: ['FY26 C5', 'iOS', '20260921', '20260928', '20261005', '20261012', '20261019', '20261026', '20261102'],
      weeksCarried: 7,
      changedDate: daysAgo(4),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
    // 13. Closed Task in current sprint (always visible in current sprint column)
    {
      id: 10842513,
      url: `${BASE_EDIT}/10842513`,
      type: 'Task',
      title: 'Ship Ed25519 signature verification for Azure Blob Storage auto-updater',
      state: 'Closed',
      priority: 1,
      iterationPath: 'SAN SA\\Sprint\\2026.02',
      parentId: 10800101,
      featureId: 10800101,
      onBoard: true,
      chain: [{ id: 10800101, type: 'Feature', title: 'Sapphire Mobile Core Experience & Startup Reliability', state: 'Work in Progress' }],
      tags: ['FY26 C5', 'Backend', '20261102'],
      weeksCarried: 1,
      changedDate: daysAgo(0),
      childCount: 0,
      openChildCount: 0,
      childrenKnown: true,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    project: 'SAN SA (Mock)',
    backlogPath: 'SAN SA\\Sprint',
    me: ME,
    sprints: SPRINTS,
    featureColumns: FEATURE_COLUMNS,
    states: STATES,
    features,
    items,
  };
}

const STORAGE_KEY = 'tickets.mockMode.v1';

class MockStore {
  constructor() {
    this._enabled = typeof window !== 'undefined' && (import.meta.env?.VITE_MOCK === '1' || window.localStorage?.getItem(STORAGE_KEY) === 'all-cases' || window.localStorage?.getItem(STORAGE_KEY) === 'all-clear');
    this._preset = (typeof window !== 'undefined' && window.localStorage?.getItem(STORAGE_KEY)) || 'all-cases';
    if (this._preset !== 'all-cases' && this._preset !== 'all-clear') this._preset = 'all-cases';
    this._overview = buildInitialMockOverview(this._preset);
    this._details = new Map();
    this._listeners = new Set();
  }

  isEnabled() {
    return this._enabled;
  }

  getPreset() {
    return this._preset;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn();
  }

  enable(preset = 'all-cases') {
    this._enabled = true;
    this._preset = preset;
    this._overview = buildInitialMockOverview(preset);
    this._details.clear();
    try {
      window.localStorage?.setItem(STORAGE_KEY, preset);
    } catch {
      /* ignore */
    }
    this._emit();
  }

  disable() {
    this._enabled = false;
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this._emit();
  }

  reset(preset = this._preset) {
    this.enable(preset);
  }

  overview() {
    this._overview.generatedAt = new Date().toISOString();
    return structuredClone(this._overview);
  }

  standup(_users, sprintPath) {
    const sp = sprintPath || 'SAN SA\\Sprint\\2026.02';
    const teamAssignees = [
      { id: 'u-pboyanoivars', name: 'Paula Boyano Ivars', email: 'pboyanoivars@microsoft.com' },
      { id: 'u-raulpo', name: 'Raul Portugues del Peno', email: 'raulpo@microsoft.com' },
      { id: 'u-soranalatas', name: 'Soran Zana Alatas', email: 'soranalatas@microsoft.com' },
      { id: 'u-amarchesin', name: 'Angelo Marchesin', email: 'amarchesin@microsoft.com' },
      { id: 'u-gfornonssera', name: 'Gemma Fornons Sera', email: 'gfornonssera@microsoft.com' },
      { id: 'u-nlattuada', name: 'Nicolas Lattuada', email: 'nlattuada@microsoft.com' },
      { id: 'u-gemarques', name: 'George Marques', email: 'gemarques@microsoft.com' },
      { id: 'u-masaucaortiz', name: 'Marina Sauca Ortiz', email: 'masaucaortiz@microsoft.com' },
      { id: 'u-tianpli', name: 'Tianpei Li', email: 'tianpli@microsoft.com' },
      { id: 'u-clairewang', name: 'Claire Wang', email: 'clairewang@microsoft.com' },
      { id: 'u-jiaruigui', name: 'Jiarui Gui', email: 'jiaruigui@microsoft.com' },
    ];
    const items = [];
    for (const [idx, person] of teamAssignees.entries()) {
      const baseId = 10910000 + idx * 10;
      items.push(
        {
          id: baseId + 1,
          url: `${BASE_EDIT}/${baseId + 1}`,
          type: 'Task',
          title: `[${person.name.split(' ')[0]}] Ship telemetry & reliability instrumentation for Sprint`,
          state: 'Active',
          priority: 1,
          iterationPath: sp,
          assignedTo: person,
          parentId: 10800101,
          featureId: 10800101,
          onBoard: true,
          chain: [{ id: 10800101, type: 'Feature', title: 'Sapphire Mobile Core Experience & Startup Reliability', state: 'Work in Progress' }],
          tags: ['FY26 C5', idx % 2 === 0 ? 'Android' : 'iOS', '20261102'],
          weeksCarried: 1,
          changedDate: daysAgo(1),
          childCount: 0,
          openChildCount: 0,
          childrenKnown: true,
        },
        {
          id: baseId + 2,
          url: `${BASE_EDIT}/${baseId + 2}`,
          type: 'Bug',
          title: `[${person.name.split(' ')[0]}] Fix edge-case crash during background token refresh`,
          state: 'New',
          priority: idx % 3 === 0 ? 0 : 2,
          iterationPath: sp,
          assignedTo: person,
          parentId: null,
          featureId: null,
          onBoard: false,
          chain: [],
          tags: ['FY26 C5', 'Android', ...(idx % 3 === 0 ? ['Sprint-Unplanned'] : [])],
          weeksCarried: 0,
          changedDate: daysAgo(0),
          childCount: 0,
          openChildCount: 0,
          childrenKnown: true,
        },
        {
          id: baseId + 3,
          url: `${BASE_EDIT}/${baseId + 3}`,
          type: 'Task',
          title: `[${person.name.split(' ')[0]}] Verify rollout metrics and close feature gate`,
          state: 'Closed',
          priority: 2,
          iterationPath: sp,
          assignedTo: person,
          parentId: 10800102,
          featureId: 10800102,
          onBoard: true,
          chain: [{ id: 10800102, type: 'Feature', title: 'MiniApps Bridge v2 & Telemetry Pipeline', state: 'Flighting' }],
          tags: ['FY26 C5', 'MiniApps', '20261102'],
          weeksCarried: 1,
          changedDate: daysAgo(0),
          childCount: 0,
          openChildCount: 0,
          childrenKnown: true,
        },
      );
    }
    this._StandupItems = items;
    return {
      sprintPath: sp,
      items,
      features: structuredClone(this._overview.features),
      generatedAt: new Date().toISOString(),
    };
  }

  _buildDetail(id) {
    if (this._details.has(id)) return this._details.get(id);
    const item = this._overview.items.find((i) => i.id === id) || (this._StandupItems || []).find((i) => i.id === id);
    const feat = this._overview.features.find((f) => f.id === id);
    const target = item || feat;
    if (!target) throw Object.assign(new Error(`Mock work item #${id} not found`), { status: 404 });

    const ancestors = item
      ? [...(item.chain || [])]
          .reverse()
          .map((a) => ({ ...a, url: `${BASE_EDIT}/${a.id}` }))
      : [{ id: 10700001, type: 'Epic', title: 'FY26 Mobile Growth & Quality', state: 'Active', url: `${BASE_EDIT}/10700001` }];

    const children =
      id === 10842511
        ? [
            { id: 10890001, type: 'Task', title: 'Add quiet hours toggle in settings page', state: 'Closed', url: `${BASE_EDIT}/10890001` },
            { id: 10890002, type: 'Task', title: 'Persist quiet hours schedule in User Settings', state: 'Closed', url: `${BASE_EDIT}/10890002` },
            { id: 10890003, type: 'Task', title: 'Add unit tests for timezone transition edge cases', state: 'Closed', url: `${BASE_EDIT}/10890003` },
          ]
        : id === 10842503
          ? [
              { id: 10890004, type: 'Task', title: 'Wire telemetry event batching', state: 'Active', url: `${BASE_EDIT}/10890004` },
              { id: 10890005, type: 'Task', title: 'Add retry backoff test', state: 'Closed', url: `${BASE_EDIT}/10890005` },
            ]
          : [];

    const detail = {
      id: target.id,
      rev: 1,
      url: target.url,
      type: item ? item.type : 'Feature',
      title: target.title,
      state: target.state,
      priority: item ? item.priority : 2,
      iterationPath: target.iterationPath,
      areaPath: target.areaPath || 'SAN SA\\Scaffolding\\Fundamental',
      tags: item ? [...(item.tags || [])] : ['FY26 C5', 'Android'],
      assignedTo: ME,
      createdBy: ME,
      changedBy: ME,
      createdDate: daysAgo(14),
      changedDate: item?.changedDate || daysAgo(1),
      parent: ancestors.at(-1) || null,
      ancestors,
      childCount: children.length,
      children,
      pullRequests: [
        {
          id: '482910',
          artifact: 'vstfs:///Git/PullRequestId/mock%2Frepo%2F482910',
          title: `Fix: ${target.title.slice(0, 56)}`,
          status: 'active',
          repo: 'snrcode',
          source: 'user/raulpo/fix-compliance',
          target: 'main',
          author: ME,
          created: daysAgo(2),
          closed: null,
          url: 'https://msasg.visualstudio.com/Bing_UX/_git/snrcode/pullrequest/482910',
        },
        {
          id: '481104',
          artifact: 'vstfs:///Git/PullRequestId/mock%2Frepo%2F481104',
          title: 'Refactor domain hygiene rules and add LWW workspace state tests',
          status: 'completed',
          repo: 'snrcode',
          source: 'user/raulpo/ddd-refactor',
          target: 'main',
          author: ME,
          created: daysAgo(6),
          closed: daysAgo(4),
          url: 'https://msasg.visualstudio.com/Bing_UX/_git/snrcode/pullrequest/481104',
        },
      ],
      fields: {
        'System.Description': `<p>This is a <strong>mock work item</strong> (#${target.id}) loaded from the built-in demo dataset so you can test every compliance rule, hover tooltip, priority pill, and editor interaction without touching live Azure DevOps data.</p><ul><li>Try editing this description and clicking outside the drawer to test the <strong>Unsaved edits</strong> shake alert.</li><li>Try changing tags, priority (<code>P</code>), state (<code>S</code>), or parent Feature (<code>F</code>).</li></ul>`,
        ...(item?.type === 'Bug'
          ? {
              'Microsoft.VSTS.TCM.ReproSteps':
                '<ol><li>Launch Tickets planner in Mock Mode.</li><li>Inspect the Hygiene and By Feature tabs.</li><li>Hover any yellow warning badge or icon to read the detailed compliance explanation.</li></ol>',
            }
          : {}),
        ...(item?.type === 'User Story'
          ? {
              'Microsoft.VSTS.Common.AcceptanceCriteria':
                '<ul><li>All compliance warnings display a detailed tooltip on hover.</li><li>Standalone Bugs do not require a parent Story or Feature.</li></ul>',
            }
          : {}),
      },
      markdown: [],
      commentCount: 2,
      comments: [
        {
          id: 9001,
          text: '<p>Verified reproduction in local sandbox. Ready for review.</p>',
          format: 'html',
          version: 1,
          createdBy: ME,
          createdDate: daysAgo(2),
          modifiedDate: daysAgo(2),
        },
        {
          id: 9002,
          text: 'Opened follow-up PR `!482910` with unit tests.',
          format: 'markdown',
          version: 1,
          createdBy: { id: 'teammate-1', name: 'Alex Rivera' },
          createdDate: daysAgo(1),
          modifiedDate: daysAgo(1),
        },
      ],
    };
    this._details.set(id, detail);
    return detail;
  }

  detail(id) {
    return structuredClone(this._buildDetail(Number(id)));
  }

  ancestors(id) {
    const d = this._buildDetail(Number(id));
    return { ancestors: structuredClone(d.ancestors) };
  }

  children(id) {
    const d = this._buildDetail(Number(id));
    return { children: structuredClone(d.children) };
  }

  update(id, patch) {
    const numId = Number(id);
    const d = this._buildDetail(numId);
    const item = this._overview.items.find((i) => i.id === numId);

    if (patch.title != null) {
      d.title = patch.title;
      if (item) item.title = patch.title;
    }
    if (patch.state != null) {
      d.state = patch.state;
      if (item) item.state = patch.state;
    }
    if (patch.priority != null) {
      d.priority = Number(patch.priority);
      if (item) item.priority = Number(patch.priority);
    }
    if (patch.iterationPath != null) {
      d.iterationPath = patch.iterationPath;
      if (item) item.iterationPath = patch.iterationPath;
    }
    if (patch.tags != null) {
      d.tags = [...patch.tags];
      if (item) {
        item.tags = [...patch.tags];
        item.weeksCarried = item.tags.filter((t) => /^\d{8}$/.test(t)).length;
      }
    }
    if ('parentId' in patch && item) {
      const feat = this._overview.features.find((f) => f.id === Number(patch.parentId));
      item.parentId = feat ? feat.id : patch.parentId;
      item.featureId = feat ? feat.id : patch.parentId;
      item.onBoard = feat ? !!feat.onBoard : false;
      item.chain = feat ? [{ id: feat.id, type: 'Feature', title: feat.title, state: feat.state }] : [];
      d.ancestors = item.chain.map((a) => ({ ...a, url: `${BASE_EDIT}/${a.id}` }));
      d.parent = d.ancestors.at(-1) || null;
    }
    if (patch.fields) {
      d.fields = { ...d.fields, ...patch.fields };
    }
    d.rev += 1;
    d.changedDate = new Date().toISOString();
    if (item) item.changedDate = d.changedDate;

    return structuredClone({
      id: d.id,
      rev: d.rev,
      title: d.title,
      state: d.state,
      priority: d.priority,
      iterationPath: d.iterationPath,
      tags: d.tags,
      fields: d.fields,
    });
  }

  moveFeature(id, column) {
    const numId = Number(id);
    const feat = this._overview.features.find((f) => f.id === numId);
    const colMeta = FEATURE_COLUMNS.find((c) => c.name === column);
    if (feat && colMeta) {
      feat.column = column;
      feat.state = colMeta.state;
    }
    return { id: numId, column, state: colMeta?.state || feat?.state || 'Active' };
  }

  addComment(id, text) {
    const d = this._buildDetail(Number(id));
    const c = {
      id: Date.now(),
      text,
      format: 'html',
      version: 1,
      createdBy: ME,
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    };
    d.comments = [c, ...d.comments];
    d.commentCount = d.comments.length;
    d.rev += 1;
    return structuredClone(c);
  }

  editComment(id, commentId, text, format) {
    const d = this._buildDetail(Number(id));
    const idx = d.comments.findIndex((c) => c.id === Number(commentId));
    if (idx !== -1) {
      d.comments[idx] = {
        ...d.comments[idx],
        text,
        format: format || d.comments[idx].format,
        version: (d.comments[idx].version || 1) + 1,
        modifiedDate: new Date().toISOString(),
      };
      return structuredClone(d.comments[idx]);
    }
    throw new Error('Comment not found');
  }

  linkPullRequest(id, ref) {
    const d = this._buildDetail(Number(id));
    const numMatch = String(ref).match(/(\d{3,})/);
    const prId = numMatch ? numMatch[1] : String(Math.floor(490000 + Math.random() * 9000));
    const pr = {
      id: prId,
      artifact: `vstfs:///Git/PullRequestId/mock%2Frepo%2F${prId}`,
      title: `Mock PR !${prId} linked from sandbox`,
      status: 'active',
      repo: 'snrcode',
      source: 'user/raulpo/sandbox',
      target: 'main',
      author: ME,
      created: new Date().toISOString(),
      closed: null,
      url: `https://msasg.visualstudio.com/Bing_UX/_git/snrcode/pullrequest/${prId}`,
    };
    d.pullRequests = [pr, ...d.pullRequests.filter((p) => p.artifact !== pr.artifact)];
    d.rev += 1;
    return { rev: d.rev, pullRequest: structuredClone(pr) };
  }

  unlinkPullRequest(id, artifact) {
    const d = this._buildDetail(Number(id));
    d.pullRequests = d.pullRequests.filter((p) => p.artifact !== artifact);
    d.rev += 1;
    return { rev: d.rev };
  }
}

export const mockStore = new MockStore();
