import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AzureCliCredential, DeviceCodeCredential } from '@azure/identity';

const ORG = process.env.ADO_ORG || 'https://msasg.visualstudio.com';
const PROJECT = process.env.ADO_PROJECT || 'SAN SA';
const TEAM_ID = process.env.ADO_TEAM_ID || '4271a5b2-919a-44ce-a87d-ef4c4d823a21';
const SPRINT_ROOT = process.env.ADO_SPRINT_ROOT || 'Sprint';
const TENANT_ID = process.env.AZURE_TENANT_ID || 'organizations';
const PORT = Number(process.env.PORT || 5174);
// Azure DevOps resource id; works with first-party public clients, so no app registration is needed.
const SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';
const BOARD_FIELDS = {
  column: 'WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Column',
  lane: 'WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Lane',
};
const P = encodeURIComponent(PROJECT);
const WORK_TYPES = ['Task', 'Bug', 'User Story'];

// ---------- auth ----------

let auth = { cred: new AzureCliCredential(), method: 'azure-cli' };
let cached = null;
let device = null;

async function token() {
  if (cached && cached.expiresOn - Date.now() > 5 * 60 * 1000) return cached.token;
  const t = await auth.cred.getToken(SCOPE);
  cached = { token: t.token, expiresOn: t.expiresOnTimestamp };
  return t.token;
}

function setCredential(cred, method) {
  auth = { cred, method };
  cached = null;
}

// ---------- Azure DevOps REST ----------

async function ado(url, { method = 'GET', body, contentType = 'application/json' } = {}) {
  const full = url.startsWith('http') ? url : `${ORG}${url}`;
  const res = await fetch(full, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': contentType, Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 203 || res.status === 401) {
    cached = null;
    const err = new Error('Azure DevOps rejected the token. Sign in again.');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch { /* not json */ }
    const err = new Error(`${method} ${url} failed (${res.status}): ${String(msg).slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function getItems(ids, { relations = false, fields } = {}) {
  const out = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 200) {
    const body = { ids: unique.slice(i, i + 200), errorPolicy: 'omit' };
    if (relations) body.$expand = 'relations';
    else if (fields) body.fields = fields;
    const r = await ado(`/${P}/_apis/wit/workitemsbatch?api-version=7.1`, { method: 'POST', body });
    out.push(...r.value.filter(Boolean));
  }
  return out;
}

const parentOf = (wi) => {
  const rel = (wi.relations || []).find((r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
  return rel ? Number(rel.url.split('/').pop()) : null;
};
const childrenOf = (wi) =>
  (wi.relations || []).filter((r) => r.rel === 'System.LinkTypes.Hierarchy-Forward').map((r) => Number(r.url.split('/').pop()));
const editUrl = (id) => `${ORG}/${P}/_workitems/edit/${id}`;
const sprintPath = (name) => `${PROJECT}\\${SPRINT_ROOT}${name ? `\\${name}` : ''}`;

function timeFrame(s, now = new Date()) {
  if (!s.start || !s.finish) return 'unscheduled';
  const start = new Date(s.start);
  const end = new Date(s.finish);
  end.setUTCDate(end.getUTCDate() + 1);
  if (now < start) return 'future';
  if (now >= end) return 'past';
  return 'current';
}

async function getSprints() {
  const [node, team] = await Promise.all([
    ado(`/${P}/_apis/wit/classificationnodes/Iterations/${encodeURIComponent(SPRINT_ROOT)}?$depth=1&api-version=7.1`),
    ado(`/${P}/${TEAM_ID}/_apis/work/teamsettings/iterations?api-version=7.1`),
  ]);
  const subscribed = new Set(team.value.map((t) => t.id));
  return (node.children || [])
    .map((c) => {
      const s = {
        identifier: c.identifier,
        name: c.name,
        path: sprintPath(c.name),
        start: c.attributes?.startDate || null,
        finish: c.attributes?.finishDate || null,
        subscribed: subscribed.has(c.identifier),
      };
      return { ...s, timeFrame: timeFrame(s) };
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

async function getBoardFeatureIds() {
  const r = await ado(`/${P}/${TEAM_ID}/_apis/work/backlogs/Microsoft.FeatureCategory/workItems?api-version=7.1`);
  return r.workItems.map((w) => w.target.id);
}

function summarizeFeature(wi, onBoard) {
  const f = wi.fields;
  return {
    id: wi.id,
    title: f['System.Title'],
    state: f['System.State'],
    column: f[BOARD_FIELDS.column] || null,
    lane: f[BOARD_FIELDS.lane] || null,
    iterationPath: f['System.IterationPath'],
    owner: f['System.AssignedTo']?.displayName || null,
    onBoard,
    url: editUrl(wi.id),
  };
}

async function buildOverview() {
  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me
      AND [System.WorkItemType] IN (${WORK_TYPES.map((t) => `'${t}'`).join(',')})
      AND ([System.State] NOT IN ('Closed','Removed','Done') OR ([System.State] = 'Closed' AND [System.ChangedDate] >= @Today - 21))`,
  };
  const [q, sprints, boardIds, me] = await Promise.all([
    ado(`/${P}/_apis/wit/wiql?api-version=7.1`, { method: 'POST', body: wiql }),
    getSprints(),
    getBoardFeatureIds(),
    ado('/_apis/connectionData'),
  ]);
  const board = new Set(boardIds);
  const all = new Map();
  (await getItems(q.workItems.map((w) => w.id), { relations: true })).forEach((wi) => all.set(wi.id, wi));
  const mine = [...all.values()];

  // Walk parents until every chain reaches a Feature (or has no parent).
  let frontier = mine.map(parentOf).filter((id) => id && !all.has(id));
  for (let depth = 0; depth < 6 && frontier.length; depth++) {
    const fetched = await getItems(frontier, { relations: true });
    fetched.forEach((wi) => all.set(wi.id, wi));
    frontier = fetched
      .filter((wi) => wi.fields['System.WorkItemType'] !== 'Feature')
      .map(parentOf)
      .filter((id) => id && !all.has(id));
  }

  const features = new Map();
  const items = mine.map((wi) => {
    const f = wi.fields;
    const chain = [];
    let feature = null;
    let cur = wi;
    for (let d = 0; d < 6; d++) {
      const pid = parentOf(cur);
      if (!pid || !all.has(pid)) break;
      cur = all.get(pid);
      chain.push({ id: cur.id, type: cur.fields['System.WorkItemType'], title: cur.fields['System.Title'], state: cur.fields['System.State'] });
      if (cur.fields['System.WorkItemType'] === 'Feature') { feature = cur; break; }
    }
    if (feature && !features.has(feature.id)) features.set(feature.id, summarizeFeature(feature, board.has(feature.id)));
    const tags = (f['System.Tags'] || '').split(';').map((t) => t.trim()).filter(Boolean);
    const childIds = childrenOf(wi);
    return {
      id: wi.id,
      type: f['System.WorkItemType'],
      title: f['System.Title'],
      state: f['System.State'],
      iterationPath: f['System.IterationPath'],
      tags,
      weeksCarried: tags.filter((t) => /^\d{8}$/.test(t)).length,
      changedDate: f['System.ChangedDate'],
      parentId: parentOf(wi),
      chain,
      featureId: feature?.id || null,
      onBoard: Boolean(feature && board.has(feature.id)),
      childCount: childIds.length,
      openChildCount: childIds.filter((c) => all.has(c) && !['Closed', 'Removed', 'Done'].includes(all.get(c).fields['System.State'])).length,
      childrenKnown: childIds.every((c) => all.has(c)),
      url: editUrl(wi.id),
    };
  });

  const missingBoard = boardIds.filter((id) => !features.has(id));
  const boardFeatures = await getItems(missingBoard, {
    fields: ['System.Id', 'System.Title', 'System.State', 'System.IterationPath', 'System.AssignedTo', BOARD_FIELDS.column, BOARD_FIELDS.lane],
  });
  boardFeatures.forEach((wi) => features.set(wi.id, summarizeFeature(wi, true)));

  const states = {};
  await Promise.all(
    WORK_TYPES.map(async (t) => {
      const r = await ado(`/${P}/_apis/wit/workitemtypes/${encodeURIComponent(t)}/states?api-version=7.1`);
      states[t] = r.value.map((s) => s.name);
    }),
  );

  return {
    me: { name: me.authenticatedUser.providerDisplayName, id: me.authenticatedUser.id },
    org: ORG,
    project: PROJECT,
    backlogPath: sprintPath(),
    sprints,
    features: [...features.values()],
    items,
    states,
    generatedAt: new Date().toISOString(),
  };
}

function nextSprintName(name) {
  const m = /^(.*?)(\d+)$/.exec(name);
  if (!m) return `${name}.next`;
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0');
}

function isoDate(d) {
  return `${d.toISOString().slice(0, 10)}T00:00:00Z`;
}

// ---------- HTTP ----------

const app = express();
app.use(express.json());

const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message });
  }
};

app.get('/api/auth/status', async (_req, res) => {
  try {
    await token();
    const me = await ado('/_apis/connectionData');
    res.json({ signedIn: true, method: auth.method, user: me.authenticatedUser.providerDisplayName, org: ORG });
  } catch (e) {
    res.json({ signedIn: false, method: auth.method, error: e.message, org: ORG });
  }
});

app.post('/api/auth/cli', route(async () => {
  setCredential(new AzureCliCredential(), 'azure-cli');
  device = null;
  await token();
  return { ok: true };
}));

app.post('/api/auth/device', route(async () => {
  // Same public client the Azure CLI uses (the @azure/identity default), so no app registration is required.
  const state = { status: 'pending', userCode: null, verificationUri: null, message: null, error: null };
  device = state;
  const cred = new DeviceCodeCredential({
    tenantId: TENANT_ID,
    userPromptCallback: (info) => {
      state.userCode = info.userCode;
      state.verificationUri = info.verificationUri;
      state.message = info.message;
    },
  });
  cred.getToken(SCOPE)
    .then(() => {
      if (device !== state) return;
      setCredential(cred, 'device-code');
      state.status = 'done';
    })
    .catch((e) => {
      state.status = 'error';
      state.error = e.message;
    });
  for (let i = 0; i < 50 && !state.userCode && state.status === 'pending'; i++) await new Promise((r) => setTimeout(r, 200));
  return state;
}));

app.get('/api/auth/device', route(async () => device || { status: 'idle' }));

app.get('/api/overview', route(() => buildOverview()));

app.patch('/api/workitems/:id', route(async (req) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const ops = [];
  if (b.iterationPath) ops.push({ op: 'add', path: '/fields/System.IterationPath', value: b.iterationPath });
  if (b.state) ops.push({ op: 'add', path: '/fields/System.State', value: b.state });
  if (b.unassign) ops.push({ op: 'add', path: '/fields/System.AssignedTo', value: '' });
  if ('parentId' in b) {
    const wi = await ado(`/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`);
    const idx = (wi.relations || []).findIndex((r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
    if (idx >= 0) ops.push({ op: 'remove', path: `/relations/${idx}` });
    if (b.parentId) {
      ops.push({ op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${ORG}/_apis/wit/workItems/${Number(b.parentId)}` } });
    }
  }
  if (!ops.length) return { ok: true, unchanged: true };
  const wi = await ado(`/_apis/wit/workitems/${id}?api-version=7.1`, { method: 'PATCH', body: ops, contentType: 'application/json-patch+json' });
  return { id: wi.id, state: wi.fields['System.State'], iterationPath: wi.fields['System.IterationPath'] };
}));

app.get('/api/sprints', route(() => getSprints()));

// Ensure the sprint after the current one exists and is on the team's Taskboard.
app.post('/api/sprints/next', route(async () => {
  let sprints = await getSprints();
  const current = sprints.find((s) => s.timeFrame === 'current') || [...sprints].reverse().find((s) => s.timeFrame === 'past');
  const after = current?.finish ? new Date(current.finish) : new Date();
  let next = sprints.find((s) => s.start && new Date(s.start) > after);
  let created = false;
  if (!next) {
    const last = sprints[sprints.length - 1];
    const start = new Date(last?.finish || Date.now());
    start.setUTCHours(0, 0, 0, 0);
    do start.setUTCDate(start.getUTCDate() + 1); while (start.getUTCDay() !== 1);
    const finish = new Date(start);
    finish.setUTCDate(finish.getUTCDate() + 11);
    const name = last ? nextSprintName(last.name) : `${start.getUTCFullYear()}.01`;
    await ado(`/${P}/_apis/wit/classificationnodes/Iterations/${encodeURIComponent(SPRINT_ROOT)}?api-version=7.1`, {
      method: 'POST',
      body: { name, attributes: { startDate: isoDate(start), finishDate: isoDate(finish) } },
    });
    created = true;
    sprints = await getSprints();
    next = sprints.find((s) => s.name === name);
  }
  let subscribed = false;
  if (!next.subscribed) {
    await ado(`/${P}/${TEAM_ID}/_apis/work/teamsettings/iterations?api-version=7.1`, { method: 'POST', body: { id: next.identifier } });
    subscribed = true;
  }
  return { sprint: { ...next, subscribed: true }, created, subscribed };
}));

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Tickets planner API on http://127.0.0.1:${PORT} (${ORG} / ${PROJECT})`);
});
