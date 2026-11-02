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
const SPRINT_TYPES = ['Task', 'Bug'];
const RICH_FIELDS = ['System.Description', 'Microsoft.VSTS.TCM.ReproSteps', 'Microsoft.VSTS.Common.AcceptanceCriteria'];

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

async function getFeatureColumns() {
  const r = await ado(`/${P}/${TEAM_ID}/_apis/work/boards/Features/columns?api-version=7.1`);
  return r.value.map((c) => ({ name: c.name, state: c.stateMappings?.Feature, type: c.columnType }));
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
  const sprints = await getSprints();
  // Closed tickets normally age out after 21 days, but the current and upcoming sprints keep all of theirs.
  const live = sprints.filter((s) => s.timeFrame === 'current' || s.timeFrame === 'future').map((s) => `'${s.path.replace(/'/g, "''")}'`);
  const keepClosed = live.length ? ` OR ([System.State] <> 'Removed' AND [System.IterationPath] IN (${live.join(',')}))` : '';
  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me
      AND [System.WorkItemType] IN (${WORK_TYPES.map((t) => `'${t}'`).join(',')})
      AND ([System.State] NOT IN ('Closed','Removed','Done') OR ([System.State] = 'Closed' AND [System.ChangedDate] >= @Today - 21)${keepClosed})`,
  };
  const [q, boardIds, me, featureColumns] = await Promise.all([
    ado(`/${P}/_apis/wit/wiql?api-version=7.1`, { method: 'POST', body: wiql }),
    getBoardFeatureIds(),
    ado('/_apis/connectionData'),
    getFeatureColumns(),
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
    featureColumns,
    items,
    states,
    generatedAt: new Date().toISOString(),
  };
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

// Move a Feature to another column of the team's Features board. The column decides the state.
app.patch('/api/features/:id/column', route(async (req) => {
  const id = Number(req.params.id);
  const col = (await getFeatureColumns()).find((c) => c.name === req.body?.column);
  if (!col) throw Object.assign(new Error(`Unknown board column "${req.body?.column}"`), { status: 400 });
  const ops = [{ op: 'add', path: '/fields/System.State', value: col.state }];
  // Incoming/outgoing columns are derived from the state alone; ADO rejects writing them.
  if (col.type === 'inProgress') ops.push({ op: 'add', path: `/fields/${BOARD_FIELDS.column}`, value: col.name });
  const wi = await ado(`/_apis/wit/workitems/${id}?api-version=7.1`, { method: 'PATCH', body: ops, contentType: 'application/json-patch+json' });
  return { id: wi.id, state: wi.fields['System.State'], column: wi.fields[BOARD_FIELDS.column] || col.name };
}));

app.patch('/api/workitems/:id', route(async (req) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const ops = [];
  // Fail instead of silently overwriting someone else's edit made since the item was loaded.
  if (b.rev) ops.push({ op: 'test', path: '/rev', value: Number(b.rev) });
  if (typeof b.title === 'string' && b.title.trim()) ops.push({ op: 'add', path: '/fields/System.Title', value: b.title.trim() });
  for (const [ref, value] of Object.entries(b.fields || {})) {
    if (!RICH_FIELDS.includes(ref)) throw Object.assign(new Error(`Field ${ref} is not editable here`), { status: 400 });
    ops.push({ op: 'add', path: `/fields/${ref}`, value: String(value ?? '') });
    // Keep Markdown fields in Markdown; ADO would otherwise treat the value as HTML.
    if ((b.markdown || []).includes(ref)) ops.push({ op: 'add', path: `/multilineFieldsFormat/${ref}`, value: 'Markdown' });
  }
  if (b.iterationPath) {
    // Methodology: only Tasks and Bugs go into sprints; Stories and Features stay on the \Sprint backlog.
    if (b.iterationPath.startsWith(`${sprintPath()}\\`)) {
      const cur = await ado(`/_apis/wit/workitems/${id}?fields=System.WorkItemType&api-version=7.1`);
      const type = cur.fields['System.WorkItemType'];
      if (!SPRINT_TYPES.includes(type)) throw Object.assign(new Error(`${type === 'User Story' ? 'Stories' : `${type}s`} stay in ${sprintPath()}; only Tasks and Bugs go into sprints.`), { status: 400 });
    }
    ops.push({ op: 'add', path: '/fields/System.IterationPath', value: b.iterationPath });
  }
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
  let wi;
  try {
    wi = await ado(`/_apis/wit/workitems/${id}?api-version=7.1`, { method: 'PATCH', body: ops, contentType: 'application/json-patch+json' });
  } catch (e) {
    if (b.rev && (e.status === 412 || /rev|TF26071|test operation/i.test(e.message))) {
      throw Object.assign(new Error('Someone changed this item since you opened it. Reload it and try again.'), { status: 409 });
    }
    throw e;
  }
  return {
    id: wi.id,
    rev: wi.rev,
    title: wi.fields['System.Title'],
    state: wi.fields['System.State'],
    iterationPath: wi.fields['System.IterationPath'],
  };
}));

const COMMENTS_API = '7.1-preview.4';
const person = (p) => (p ? { id: p.id, name: p.displayName, email: p.uniqueName } : null);
const toComment = (c) => ({
  id: c.id,
  text: c.text || '',
  format: String(c.format || 'html').toLowerCase(),
  version: c.version,
  createdBy: person(c.createdBy),
  createdDate: c.createdDate,
  modifiedDate: c.modifiedDate,
});

// Walk up the full parent chain (Task → Story → Feature → Epic …), top-most first.
async function getAncestors(wi) {
  const ancestors = [];
  const seen = new Set([wi.id]);
  for (let pid = parentOf(wi); pid && !seen.has(pid) && ancestors.length < 10; ) {
    seen.add(pid);
    const [p] = await getItems([pid], { relations: true });
    if (!p) break;
    ancestors.unshift({
      id: p.id,
      title: p.fields['System.Title'],
      type: p.fields['System.WorkItemType'],
      state: p.fields['System.State'],
      iterationPath: p.fields['System.IterationPath'],
      url: editUrl(p.id),
    });
    pid = parentOf(p);
  }
  return ancestors;
}

// Direct children, open ones first.
async function getChildren(wi) {
  const childIds = childrenOf(wi);
  const isDone = (s) => ['Closed', 'Done', 'Removed', 'Resolved', 'Shipped'].includes(s);
  return (childIds.length ? await getItems(childIds) : [])
    .map((c) => ({
      id: c.id,
      title: c.fields['System.Title'],
      type: c.fields['System.WorkItemType'],
      state: c.fields['System.State'],
      url: editUrl(c.id),
    }))
    .sort((a, b) => isDone(a.state) - isDone(b.state) || a.id - b.id);
}

// ---------- pull request links ----------

const PR_ARTIFACT = /^vstfs:\/\/\/Git\/PullRequestId\/([^%/]+)(?:%2F|\/)([^%/]+)(?:%2F|\/)(\d+)$/i;
const prArtifactUrl = (projectId, repoId, prId) => `vstfs:///Git/PullRequestId/${projectId}%2F${repoId}%2F${prId}`;

function toPullRequest(pr) {
  const repo = pr.repository || {};
  return {
    id: pr.pullRequestId,
    title: pr.title,
    status: pr.isDraft && pr.status === 'active' ? 'draft' : pr.status,
    repo: repo.name,
    author: person(pr.createdBy),
    created: pr.creationDate,
    closed: pr.closedDate || null,
    source: String(pr.sourceRefName || '').replace(/^refs\/heads\//, ''),
    target: String(pr.targetRefName || '').replace(/^refs\/heads\//, ''),
    url: `${ORG}/${encodeURIComponent(repo.project?.name || PROJECT)}/_git/${encodeURIComponent(repo.name || '')}/pullrequest/${pr.pullRequestId}`,
  };
}

async function getPullRequests(wi) {
  const links = (wi.relations || [])
    .filter((r) => r.rel === 'ArtifactLink')
    .map((r) => ({ artifact: r.url, m: PR_ARTIFACT.exec(r.url) }))
    .filter((l) => l.m);
  const prs = await Promise.all(
    links.map(async ({ artifact, m }) => {
      const [, projectId, repoId, prId] = m;
      try {
        const pr = await ado(`/${projectId}/_apis/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.1`);
        return { ...toPullRequest(pr), artifact };
      } catch (e) {
        return { id: Number(prId), artifact, error: e.status === 404 ? 'Not found or no access' : e.message };
      }
    }),
  );
  const order = { active: 0, draft: 1, completed: 2, abandoned: 3 };
  return prs.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || b.id - a.id);
}

function parsePrRef(input) {
  const s = String(input || '').trim();
  const url = /\/([^/]+)\/_git\/[^/]+\/pullrequest\/(\d+)/i.exec(s);
  if (url) return { project: decodeURIComponent(url[1]), id: Number(url[2]) };
  const bare = /^!?(\d+)$/.exec(s);
  if (bare) return { project: PROJECT, id: Number(bare[1]) };
  return null;
}

app.post('/api/workitems/:id/pull-requests', route(async (req) => {
  const id = Number(req.params.id);
  const ref = parsePrRef(req.body?.ref);
  if (!ref) throw Object.assign(new Error('Paste a pull request URL (…/_git/repo/pullrequest/123) or a PR number'), { status: 400 });
  let pr;
  try {
    pr = await ado(`/${encodeURIComponent(ref.project)}/_apis/git/pullrequests/${ref.id}?api-version=7.1`);
  } catch (e) {
    if (e.status === 404) throw Object.assign(new Error(`PR ${ref.id} not found in ${ref.project}`), { status: 404 });
    throw e;
  }
  const artifact = prArtifactUrl(pr.repository.project.id, pr.repository.id, pr.pullRequestId);
  const wi = await ado(`/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`);
  const exists = (wi.relations || []).some((r) => r.rel === 'ArtifactLink' && r.url.toLowerCase() === artifact.toLowerCase());
  if (exists) throw Object.assign(new Error(`PR ${pr.pullRequestId} is already linked`), { status: 409 });
  const updated = await ado(`/_apis/wit/workitems/${id}?api-version=7.1`, {
    method: 'PATCH',
    contentType: 'application/json-patch+json',
    body: [
      { op: 'test', path: '/rev', value: wi.rev },
      { op: 'add', path: '/relations/-', value: { rel: 'ArtifactLink', url: artifact, attributes: { name: 'Pull Request' } } },
    ],
  });
  return { rev: updated.rev, pullRequest: { ...toPullRequest(pr), artifact } };
}));

app.delete('/api/workitems/:id/pull-requests', route(async (req) => {
  const id = Number(req.params.id);
  const artifact = String(req.body?.artifact || '').toLowerCase();
  const wi = await ado(`/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`);
  const idx = (wi.relations || []).findIndex((r) => r.rel === 'ArtifactLink' && r.url.toLowerCase() === artifact);
  if (idx < 0) return { rev: wi.rev, unchanged: true };
  const updated = await ado(`/_apis/wit/workitems/${id}?api-version=7.1`, {
    method: 'PATCH',
    contentType: 'application/json-patch+json',
    body: [
      { op: 'test', path: '/rev', value: wi.rev },
      { op: 'remove', path: `/relations/${idx}` },
    ],
  });
  return { rev: updated.rev };
}));

app.get('/api/workitems/:id/ancestors', route(async (req) => {
  const wi = await ado(`/_apis/wit/workitems/${Number(req.params.id)}?$expand=relations&api-version=7.1`);
  return { ancestors: await getAncestors(wi) };
}));

app.get('/api/workitems/:id/children', route(async (req) => {
  const wi = await ado(`/_apis/wit/workitems/${Number(req.params.id)}?$expand=relations&api-version=7.1`);
  return { children: await getChildren(wi) };
}));

app.get('/api/workitems/:id', route(async (req) => {
  const id = Number(req.params.id);
  const [wi, comments] = await Promise.all([
    ado(`/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`),
    ado(`/${P}/_apis/wit/workItems/${id}/comments?$top=200&order=desc&api-version=${COMMENTS_API}`),
  ]);
  const f = wi.fields;
  const ancestors = await getAncestors(wi);
  const parent = ancestors.at(-1) || null;
  const children = await getChildren(wi);
  const pullRequests = await getPullRequests(wi);
  return {
    id: wi.id,
    rev: wi.rev,
    url: editUrl(wi.id),
    type: f['System.WorkItemType'],
    title: f['System.Title'],
    state: f['System.State'],
    reason: f['System.Reason'],
    iterationPath: f['System.IterationPath'],
    areaPath: f['System.AreaPath'],
    tags: (f['System.Tags'] || '').split(';').map((t) => t.trim()).filter(Boolean),
    assignedTo: person(f['System.AssignedTo']),
    createdBy: person(f['System.CreatedBy']),
    createdDate: f['System.CreatedDate'],
    changedBy: person(f['System.ChangedBy']),
    changedDate: f['System.ChangedDate'],
    priority: f['Microsoft.VSTS.Common.Priority'],
    parent,
    ancestors,
    childCount: children.length,
    children,
    pullRequests,
    fields: Object.fromEntries(RICH_FIELDS.map((r) => [r, f[r] ?? null])),
    markdown: RICH_FIELDS.filter((r) => String(wi.multilineFieldsFormat?.[r] || '').toLowerCase() === 'markdown'),
    comments: (comments.comments || []).map(toComment),
    commentCount: comments.totalCount ?? (comments.comments || []).length,
  };
}));

app.post('/api/workitems/:id/comments', route(async (req) => {
  const text = String(req.body?.text || '').trim();
  if (!text) throw Object.assign(new Error('Comment is empty'), { status: 400 });
  const c = await ado(`/${P}/_apis/wit/workItems/${Number(req.params.id)}/comments?api-version=${COMMENTS_API}`, { method: 'POST', body: { text } });
  return toComment(c);
}));

app.patch('/api/workitems/:id/comments/:commentId', route(async (req) => {
  const text = String(req.body?.text || '').trim();
  if (!text) throw Object.assign(new Error('Comment is empty'), { status: 400 });
  const fmt = req.body?.format === 'markdown' ? '&format=markdown' : '';
  const c = await ado(
    `/${P}/_apis/wit/workItems/${Number(req.params.id)}/comments/${Number(req.params.commentId)}?api-version=${COMMENTS_API}${fmt}`,
    { method: 'PATCH', body: { text } },
  );
  return toComment(c);
}));

// Inline images in descriptions/comments are ADO attachments that need the bearer token.
app.get('/api/attachment', async (req, res) => {
  try {
    const u = new URL(String(req.query.url || ''));
    if (u.origin !== new URL(ORG).origin || !/\/_apis\/wit\/attachments\//i.test(u.pathname)) return res.status(400).end();
    const r = await fetch(u, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!r.ok) return res.status(r.status).end();
    res.set('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(400).end();
  }
});

app.get('/api/sprints', route(() => getSprints()));

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Tickets planner API on http://127.0.0.1:${PORT} (${ORG} / ${PROJECT})`);
});
