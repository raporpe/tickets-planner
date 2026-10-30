// AI planning assistant powered by the GitHub Copilot SDK (uses the signed-in Copilot subscription).
// The model can read Azure DevOps through the tools below, but it can only *propose* changes.
// Proposals are validated here, reviewed in the UI and written to ADO only when the user applies them.
import { CopilotClient, defineTool, approveAll } from '@github/copilot-sdk';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const MODEL = process.env.AGENT_MODEL || 'claude-sonnet-4.5';
const METHODOLOGY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'instructions.md');
const CREATE_TYPES = ['Task', 'Bug', 'User Story', 'Feature'];
const CLOSED = ['Closed', 'Removed', 'Done'];
const F = {
  title: 'System.Title',
  type: 'System.WorkItemType',
  state: 'System.State',
  area: 'System.AreaPath',
  iteration: 'System.IterationPath',
  tags: 'System.Tags',
  assigned: 'System.AssignedTo',
  priority: 'Microsoft.VSTS.Common.Priority',
  description: 'System.Description',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  reproSteps: 'Microsoft.VSTS.TCM.ReproSteps',
};
const RICH = ['description', 'acceptanceCriteria', 'reproSteps'];
const BRIEF_FIELDS = ['System.Id', F.title, F.type, F.state, F.area, F.iteration, F.tags, F.assigned];

const splitTags = (s) => String(s || '').split(';').map((t) => t.trim()).filter(Boolean);
const httpError = (status, message) => Object.assign(new Error(message), { status });

function toText(html, max = 4000) {
  if (!html) return '';
  const t = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<img[^>]*>/gi, '[image]')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function yyyymmdd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function methodology() {
  if (!existsSync(METHODOLOGY_FILE)) return '';
  const md = readFileSync(METHODOLOGY_FILE, 'utf8').replace(/\r\n/g, '\n');
  const board = md.match(/## Board Methodology[\s\S]*?(?=\n## )/)?.[0];
  const before = md.match(/### Before Creating Any Ticket[\s\S]*?(?=\n1\. \*\*On session start)/)?.[0];
  return board ? [board, before].filter(Boolean).join('\n\n').trim() : md;
}

export function registerAgent(app, route, d) {
  const { ado, getItems, getSprints, getFeatureColumns, getAncestors, buildOverview, moveFeatureToColumn, parentOf, childrenOf, editUrl, sprintPath } = d;
  const { P, ORG, TEAM_ID, BOARD_FIELDS, COMMENTS_API } = d;

  // ---------- small caches (ADO stays the source of truth; these only last seconds/minutes) ----------
  const memo = new Map();
  function cached(key, ttlMs, fn) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
    const promise = Promise.resolve().then(fn);
    memo.set(key, { at: Date.now(), promise });
    promise.catch(() => memo.delete(key));
    return promise;
  }
  const sprints = () => cached('sprints', 60_000, getSprints);
  const columns = () => cached('columns', 300_000, getFeatureColumns);
  const overview = () => cached('overview', 60_000, buildOverview);
  const states = (type) =>
    cached(`states:${type}`, 3_600_000, async () => {
      const r = await ado(`/${P}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=7.1`);
      return r.value.map((s) => s.name);
    });
  const me = () =>
    cached('me', 3_600_000, async () => {
      const r = await ado('/_apis/connectionData');
      const u = r.authenticatedUser;
      return { name: u.providerDisplayName, account: u.properties?.Account?.$value || u.providerDisplayName };
    });
  const teamArea = () =>
    cached('teamArea', 3_600_000, async () => {
      const r = await ado(`/${P}/${TEAM_ID}/_apis/work/teamsettings/teamfieldvalues?api-version=7.1`);
      return r.defaultValue;
    });

  const sprintName = (iterationPath, list) => {
    if (!iterationPath || iterationPath === sprintPath()) return 'Backlog';
    return list.find((s) => s.path === iterationPath)?.name || iterationPath;
  };
  const brief = (wi, list = []) => {
    const f = wi.fields;
    return {
      id: wi.id,
      type: f[F.type],
      title: f[F.title],
      state: f[F.state],
      assignedTo: f[F.assigned]?.displayName || null,
      sprint: sprintName(f[F.iteration], list),
      tags: splitTags(f[F.tags]),
    };
  };

  async function resolveSprint(input) {
    const list = await sprints();
    const v = String(input ?? '').trim();
    if (!v || /^backlog$/i.test(v) || v === sprintPath()) return { path: sprintPath(), name: 'Backlog' };
    const s = /^current$/i.test(v)
      ? list.find((x) => x.timeFrame === 'current')
      : list.find((x) => x.name.toLowerCase() === v.toLowerCase() || x.path.toLowerCase() === v.toLowerCase());
    if (!s) {
      const options = list.filter((x) => x.timeFrame !== 'past').map((x) => x.name);
      throw new Error(`Sprint "${v}" does not exist. Use "Backlog" or one of: ${options.join(', ')}. New sprints are never created.`);
    }
    return { path: s.path, name: s.name };
  }

  // ---------- read tools ----------

  async function getItemTool({ id }) {
    const wi = await ado(`/_apis/wit/workitems/${Number(id)}?$expand=relations&api-version=7.1`);
    const [list, ancestors, comments] = await Promise.all([
      sprints(),
      getAncestors(wi),
      ado(`/${P}/_apis/wit/workItems/${wi.id}/comments?$top=10&order=desc&api-version=${COMMENTS_API}`).catch(() => ({ comments: [] })),
    ]);
    const kids = await getItems(childrenOf(wi), { fields: BRIEF_FIELDS });
    const f = wi.fields;
    return {
      ...brief(wi, list),
      url: editUrl(wi.id),
      areaPath: f[F.area],
      iterationPath: f[F.iteration],
      priority: f[F.priority] ?? null,
      boardColumn: f[F.type] === 'Feature' ? f[BOARD_FIELDS.column] || null : undefined,
      createdDate: f['System.CreatedDate'],
      changedDate: f['System.ChangedDate'],
      description: toText(f[F.description]),
      acceptanceCriteria: toText(f[F.acceptanceCriteria], 2000) || undefined,
      reproSteps: toText(f[F.reproSteps], 2000) || undefined,
      ancestors: ancestors.map((a) => ({ id: a.id, type: a.type, title: a.title, state: a.state })),
      children: kids.map((k) => brief(k, list)),
      recentComments: (comments.comments || []).map((c) => ({
        by: c.createdBy?.displayName,
        date: c.createdDate,
        text: toText(c.text, 800),
      })),
    };
  }

  async function getTreeTool({ id, depth = 2, includeClosed = false }) {
    const list = await sprints();
    const maxDepth = Math.min(Math.max(Number(depth) || 2, 1), 4);
    const [root] = await getItems([Number(id)], { relations: true });
    if (!root) throw new Error(`Work item ${id} not found`);
    let count = 0;
    async function expand(wi, level) {
      const node = brief(wi, list);
      const kidIds = childrenOf(wi);
      if (!kidIds.length) return node;
      if (level >= maxDepth || count > 300) return { ...node, childCount: kidIds.length };
      const kids = (await getItems(kidIds, { relations: true })).filter((k) => includeClosed || !CLOSED.includes(k.fields[F.state]));
      count += kids.length;
      node.children = await Promise.all(kids.map((k) => expand(k, level + 1)));
      const hidden = kidIds.length - kids.length;
      if (hidden) node.closedChildrenHidden = hidden;
      return node;
    }
    return expand(root, 0);
  }

  // Compact one-line format keeps list results well under the SDK's large-output limit.
  const line = (b) =>
    `#${b.id} [${b.type}] ${b.title} | ${b.state} | ${b.sprint}${b.assignedTo !== undefined ? ` | ${b.assignedTo || 'unassigned'}` : ''}${b.tags?.length ? ` | tags: ${b.tags.join(', ')}` : ''}`;

  async function searchTool({ text = '', types = [], includeClosed = false, assignedToMe = false, top = 30 }) {
    const esc = (s) => String(s).replace(/'/g, "''");
    const where = ['[System.TeamProject] = @project'];
    const words = String(text).trim();
    if (/^\d+$/.test(words)) where.push(`[System.Id] = ${Number(words)}`);
    else if (words) where.push(`([System.Title] CONTAINS '${esc(words)}' OR [System.Tags] CONTAINS '${esc(words)}')`);
    const validTypes = (types || []).filter((t) => [...CREATE_TYPES, 'Epic'].includes(t));
    if (validTypes.length) where.push(`[System.WorkItemType] IN (${validTypes.map((t) => `'${t}'`).join(',')})`);
    if (!includeClosed) where.push(`[System.State] NOT IN ('Closed','Removed','Done')`);
    if (assignedToMe) where.push('[System.AssignedTo] = @Me');
    const query = `SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;
    const n = Math.min(Math.max(Number(top) || 30, 1), 100);
    const r = await ado(`/${P}/_apis/wit/wiql?$top=${n}&api-version=7.1`, { method: 'POST', body: { query } });
    const [list, items] = await Promise.all([sprints(), getItems(r.workItems.map((w) => w.id), { fields: BRIEF_FIELDS })]);
    return `${items.length} result(s)\n${items.map((wi) => line(brief(wi, list))).join('\n')}`;
  }

  async function myItemsTool({ includeClosed = false }) {
    const o = await overview();
    const features = new Map(o.features.map((f) => [f.id, f]));
    const items = o.items.filter((i) => includeClosed || !CLOSED.includes(i.state));
    const rows = items.map((i) => {
      const f = features.get(i.featureId);
      const feature = f ? `Feature #${f.id}${f.onBoard ? '' : ' (not on board)'}` : 'NO FEATURE';
      const parent = i.parentId && i.parentId !== i.featureId ? `parent #${i.parentId}, ` : '';
      return `#${i.id} [${i.type}] ${i.title} | ${i.state} | ${sprintName(i.iterationPath, o.sprints)} | ${parent}${feature}${i.tags.length ? ` | tags: ${i.tags.join(', ')}` : ''}`;
    });
    return `${items.length} item(s) assigned to me${includeClosed ? ' (incl. closed in the last 21 days)' : ' (open)'}\n${rows.join('\n')}`;
  }

  async function featuresTool() {
    const o = await overview();
    const rows = o.features.map((f) => `#${f.id} ${f.title} | ${f.state} | column: ${f.column || '-'} | lane: ${f.lane || '-'} | ${f.onBoard ? 'on board' : 'NOT on board'} | owner: ${f.owner || '-'}`);
    return `Board columns (column → state): ${o.featureColumns.map((c) => `${c.name} → ${c.state}`).join('; ')}\n${rows.join('\n')}`;
  }

  async function sprintsTool() {
    const list = await sprints();
    const past = list.filter((s) => s.timeFrame === 'past').slice(-2);
    return {
      backlog: `"Backlog" = iteration ${sprintPath()}`,
      sprints: [...past, ...list.filter((s) => s.timeFrame !== 'past')].map((s) => ({ name: s.name, start: s.start?.slice(0, 10), finish: s.finish?.slice(0, 10), timeFrame: s.timeFrame })),
    };
  }

  // ---------- proposals ----------

  const proposals = new Map();

  // Accepts both raw model output and the normalised form the UI sends back (objects with id/ref, sprint objects).
  const unwrap = (v) => (v && typeof v === 'object' ? (v.id ?? v.ref) : v);
  function rawChange(c) {
    if (!c || typeof c !== 'object') return {};
    return {
      ...c,
      id: unwrap(c.id ?? c.target),
      parent: unwrap(c.parent),
      related: Array.isArray(c.related) ? c.related.map(unwrap) : c.related,
      sprint: c.sprint && typeof c.sprint === 'object' ? c.sprint.name : c.sprint,
    };
  }

  // Validates the raw change list. Returns normalised changes with display info for the UI.
  async function validateChanges(input) {
    if (!Array.isArray(input) || !input.length) throw httpError(400, 'A proposal needs at least one change.');
    if (input.length > 60) throw httpError(400, 'Too many changes in one proposal (max 60).');
    const raw = input.map(rawChange);
    const errors = [];
    const refs = new Map();
    const isRef = (v) => typeof v === 'string' && !/^\d+$/.test(v.trim());
    const asId = (v) => (typeof v === 'number' || /^\d+$/.test(String(v ?? '').trim()) ? Number(v) : null);

    const ids = new Set();
    for (const c of raw) for (const v of [c?.id, c?.parent, ...(c?.related || [])]) if (asId(v)) ids.add(asId(v));
    const existing = new Map((await getItems([...ids], { fields: BRIEF_FIELDS })).map((wi) => [wi.id, wi]));
    const cols = await columns();
    const out = [];

    for (let i = 0; i < raw.length; i++) {
      const c = raw[i] || {};
      const err = (m) => errors.push(`Change ${i + 1} (${c.kind || '?'}): ${m}`);
      const n = { kind: c.kind, reason: c.reason ? String(c.reason).slice(0, 300) : undefined };
      const target = async (v, label = 'id') => {
        if (isRef(v)) {
          if (!refs.has(v.trim())) return err(`${label} "${v}" is not a ref of an earlier create in this proposal`), null;
          const r = refs.get(v.trim());
          return { ref: v.trim(), type: r.type, title: r.title, area: r.area };
        }
        const id = asId(v);
        if (!id) return err(`${label} is required`), null;
        const wi = existing.get(id);
        if (!wi) return err(`work item ${id} does not exist`), null;
        return { id, type: wi.fields[F.type], title: wi.fields[F.title], state: wi.fields[F.state], area: wi.fields[F.area] };
      };
      const checkState = async (type, state) => {
        if (!state) return;
        const valid = await states(type).catch(() => null);
        if (valid && !valid.includes(state)) err(`state "${state}" is not valid for ${type} (valid: ${valid.join(', ')})`);
      };
      const cleanTags = (list, label) => {
        if (list == null) return [];
        if (!Array.isArray(list)) return err(`${label} must be a list`), [];
        return [...new Set(list.map((t) => String(t).replace(/;/g, '').trim()).filter(Boolean))];
      };
      const sprint = async (v) => {
        if (v == null || v === '') return undefined;
        try {
          return await resolveSprint(v);
        } catch (e) {
          err(e.message);
          return undefined;
        }
      };
      const prio = (v) => {
        if (v == null || v === '') return undefined;
        const p = Number(v);
        if (![1, 2, 3, 4].includes(p)) return err('priority must be 1–4'), undefined;
        return p;
      };
      const rich = (src) => {
        for (const k of RICH) if (typeof src[k] === 'string' && src[k].trim()) n[k] = src[k].trim();
      };

      if (c.kind === 'create') {
        n.ref = String(c.ref || `new${i + 1}`).trim();
        if (asId(n.ref)) err('ref must not be a number');
        if (refs.has(n.ref)) err(`ref "${n.ref}" is used twice`);
        n.type = c.type;
        if (!CREATE_TYPES.includes(c.type)) err(`type must be one of ${CREATE_TYPES.join(', ')}`);
        n.title = String(c.title || '').trim();
        if (!n.title) err('title is required');
        if (n.title.length > 255) err('title is longer than 255 characters');
        rich(c);
        if (c.parent != null && c.parent !== '') {
          n.parent = await target(c.parent, 'parent');
          if (n.parent && n.parent.type === 'Task') err('a Task cannot be a parent');
          if (n.parent && c.type === 'Feature' && n.parent.type && n.parent.type !== 'Epic') err('a Feature can only sit under an Epic');
        } else if (c.type !== 'Feature') err('parent is required (no orphans): use an existing id or the ref of an earlier create');
        n.sprint = (await sprint(c.sprint)) || (await resolveSprint('Backlog'));
        n.tags = cleanTags(c.tags, 'tags');
        n.priority = prio(c.priority);
        if (c.state) {
          n.state = String(c.state);
          if (CREATE_TYPES.includes(c.type)) await checkState(c.type, n.state);
        }
        n.related = [];
        for (const r of c.related || []) {
          const t = await target(r, 'related');
          if (t) n.related.push(t);
        }
        n.area = c.type === 'Feature' ? await teamArea() : n.parent?.area || (await teamArea());
        refs.set(n.ref, { type: n.type, title: n.title, area: n.area });
      } else if (c.kind === 'update') {
        n.target = await target(c.id);
        if (typeof c.title === 'string' && c.title.trim()) n.title = c.title.trim().slice(0, 255);
        rich(c);
        if (c.state) {
          n.state = String(c.state);
          if (n.target?.type) await checkState(n.target.type, n.state);
        }
        n.sprint = await sprint(c.sprint);
        n.priority = prio(c.priority);
        if (c.parent != null && c.parent !== '') {
          n.parent = await target(c.parent, 'parent');
          if (n.parent && n.target && n.parent.id && n.parent.id === n.target.id) err('an item cannot be its own parent');
          if (n.parent?.type === 'Task') err('a Task cannot be a parent');
        }
        n.addTags = cleanTags(c.addTags, 'addTags');
        n.removeTags = cleanTags(c.removeTags, 'removeTags');
        const touched = ['title', ...RICH, 'state', 'sprint', 'priority', 'parent'].some((k) => n[k] !== undefined) || n.addTags.length || n.removeTags.length;
        if (!touched) err('nothing to change');
      } else if (c.kind === 'comment') {
        n.target = await target(c.id);
        n.text = String(c.text || '').trim();
        if (!n.text) err('text is required');
      } else if (c.kind === 'feature_column') {
        n.target = await target(c.id);
        if (n.target?.type && n.target.type !== 'Feature') err(`#${n.target.id} is a ${n.target.type}, not a Feature`);
        n.column = String(c.column || '').trim();
        const col = cols.find((x) => x.name.toLowerCase() === n.column.toLowerCase());
        if (!col) err(`column must be one of: ${cols.map((x) => x.name).join(', ')}`);
        else n.column = col.name;
      } else {
        err('kind must be create, update, comment or feature_column (deleting or creating sprints is not allowed)');
      }
      out.push(n);
    }
    if (errors.length) throw httpError(400, errors.join('\n'));
    return out;
  }

  const relation = (rel, id) => ({ op: 'add', path: '/relations/-', value: { rel, url: `${ORG}/_apis/wit/workItems/${id}` } });

  function createOps(n, account, parentId) {
    const ops = [
      { op: 'add', path: `/fields/${F.title}`, value: n.title },
      { op: 'add', path: `/fields/${F.area}`, value: n.area },
      { op: 'add', path: `/fields/${F.iteration}`, value: n.sprint.path },
      { op: 'add', path: `/fields/${F.assigned}`, value: account },
    ];
    if (n.tags.length) ops.push({ op: 'add', path: `/fields/${F.tags}`, value: n.tags.join('; ') });
    if (n.priority) ops.push({ op: 'add', path: `/fields/${F.priority}`, value: n.priority });
    for (const k of RICH) {
      if (!n[k]) continue;
      ops.push({ op: 'add', path: `/fields/${F[k]}`, value: n[k] });
      ops.push({ op: 'add', path: `/multilineFieldsFormat/${F[k]}`, value: 'Markdown' });
    }
    if (parentId) ops.push(relation('System.LinkTypes.Hierarchy-Reverse', parentId));
    return ops;
  }

  async function updateOps(n, id, parentId) {
    const wi = await ado(`/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`);
    const ops = [];
    if (n.title) ops.push({ op: 'add', path: `/fields/${F.title}`, value: n.title });
    for (const k of RICH) {
      if (!n[k]) continue;
      const current = wi.fields[F[k]];
      const isMarkdown = String(wi.multilineFieldsFormat?.[F[k]] || '').toLowerCase() === 'markdown';
      if (isMarkdown || !current) {
        ops.push({ op: 'add', path: `/fields/${F[k]}`, value: n[k] });
        ops.push({ op: 'add', path: `/multilineFieldsFormat/${F[k]}`, value: 'Markdown' });
      } else {
        ops.push({ op: 'add', path: `/fields/${F[k]}`, value: marked.parse(n[k]) });
      }
    }
    if (n.state) ops.push({ op: 'add', path: `/fields/${F.state}`, value: n.state });
    if (n.sprint) ops.push({ op: 'add', path: `/fields/${F.iteration}`, value: n.sprint.path });
    if (n.priority) ops.push({ op: 'add', path: `/fields/${F.priority}`, value: n.priority });
    if (n.addTags.length || n.removeTags.length) {
      const drop = new Set(n.removeTags.map((t) => t.toLowerCase()));
      const tags = splitTags(wi.fields[F.tags]).filter((t) => !drop.has(t.toLowerCase()));
      for (const t of n.addTags) if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
      ops.push({ op: 'add', path: `/fields/${F.tags}`, value: tags.join('; ') });
    }
    if (parentId && parentId !== parentOf(wi)) {
      const idx = (wi.relations || []).findIndex((r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
      if (idx >= 0) ops.push({ op: 'remove', path: `/relations/${idx}` });
      ops.push(relation('System.LinkTypes.Hierarchy-Reverse', parentId));
    }
    return ops;
  }

  const patchItem = (id, ops, validateOnly) =>
    ado(`/_apis/wit/workitems/${id}?${validateOnly ? 'validateOnly=true&' : ''}api-version=7.1`, { method: 'PATCH', body: ops, contentType: 'application/json-patch+json' });
  const postItem = (type, ops, validateOnly) =>
    ado(`/${P}/_apis/wit/workitems/$${encodeURIComponent(type)}?${validateOnly ? 'validateOnly=true&' : ''}api-version=7.1`, { method: 'POST', body: ops, contentType: 'application/json-patch+json' });

  const ORDER = { create: 0, update: 1, comment: 2, feature_column: 3 };

  // Writes the approved changes. With dryRun, ADO validates every create/update (validateOnly) and nothing is saved.
  async function applyChanges(raw, { dryRun = false } = {}) {
    const changes = await validateChanges(raw);
    const { account } = await me();
    const created = new Map();
    const failedRefs = new Set();
    const results = changes.map((n, index) => ({ index, kind: n.kind, ok: false }));
    const order = changes.map((n, i) => i).sort((a, b) => ORDER[changes[a].kind] - ORDER[changes[b].kind] || a - b);

    const idOf = (t) => {
      if (!t) return null;
      if (t.id) return t.id;
      if (failedRefs.has(t.ref)) throw new Error(`"${t.ref}" was not created`);
      return created.get(t.ref) ?? null;
    };

    for (const i of order) {
      const n = changes[i];
      const res = results[i];
      try {
        if (n.kind === 'create') {
          res.ref = n.ref;
          const parentId = idOf(n.parent);
          const ops = createOps(n, account, parentId);
          for (const r of n.related) {
            const rid = idOf(r);
            if (rid) ops.push(relation('System.LinkTypes.Related', rid));
          }
          if (dryRun) {
            await postItem(n.type, ops, true);
            res.ok = true;
            continue;
          }
          const wi = await postItem(n.type, ops, false);
          created.set(n.ref, wi.id);
          Object.assign(res, { ok: true, id: wi.id, url: editUrl(wi.id), title: n.title });
          if (n.state && wi.fields[F.state] !== n.state) {
            try {
              await patchItem(wi.id, [{ op: 'add', path: `/fields/${F.state}`, value: n.state }], false);
            } catch (e) {
              res.warning = `Created, but could not set state ${n.state}: ${e.message}`;
            }
          }
        } else {
          const id = idOf(n.target);
          if (!id && dryRun) {
            res.ok = true;
            res.note = 'Targets an item created by this proposal; checked after it exists.';
            continue;
          }
          res.id = id;
          res.url = editUrl(id);
          if (n.kind === 'update') {
            const parentId = n.parent ? idOf(n.parent) : null;
            if (n.parent && !parentId && dryRun) res.note = 'New parent is created by this proposal; link checked on apply.';
            const ops = await updateOps(n, id, parentId);
            if (ops.length) await patchItem(id, ops, dryRun);
            res.ok = true;
          } else if (n.kind === 'comment') {
            if (!dryRun) await ado(`/${P}/_apis/wit/workItems/${id}/comments?api-version=${COMMENTS_API}`, { method: 'POST', body: { text: marked.parse(n.text) } });
            res.ok = true;
          } else if (n.kind === 'feature_column') {
            if (!dryRun) Object.assign(res, await moveFeatureToColumn(id, n.column), { id });
            res.ok = true;
          }
        }
      } catch (e) {
        res.ok = false;
        res.error = e.message;
        if (n.kind === 'create') failedRefs.add(n.ref);
      }
    }
    if (!dryRun) memo.delete('overview');
    return { dryRun, results, applied: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  }

  // ---------- Copilot client and sessions ----------

  let clientPromise = null;
  function getClient() {
    if (!clientPromise) {
      const client = new CopilotClient({ mode: 'empty', baseDirectory: path.join(os.homedir(), '.tickets-planner', 'copilot'), logLevel: 'error' });
      clientPromise = client
        .start()
        .then(() => client)
        .catch((e) => {
          clientPromise = null;
          throw httpError(503, `Could not start GitHub Copilot (${e.message}). Sign in with the Copilot CLI or \`gh auth login\` and try again.`);
        });
    }
    return clientPromise;
  }

  async function systemPrompt() {
    const [list, user] = await Promise.all([sprints(), me()]);
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const current = list.find((s) => s.timeFrame === 'current');
    const upcoming = list.filter((s) => s.timeFrame === 'future').slice(0, 2).map((s) => `${s.name} (${s.start?.slice(0, 10)} → ${s.finish?.slice(0, 10)})`);
    return `You are the planning assistant inside "Tickets planner", ${user.name}'s local web app for Azure DevOps (org msasg, project SAN SA, team Bing Mobile Apps Team). You help organise, break down and create work items and plan sprints.

Today is ${now.toDateString()}. This week's weekly tag is ${yyyymmdd(monday)}. Current sprint: ${current ? `${current.name} (${current.start?.slice(0, 10)} → ${current.finish?.slice(0, 10)})` : 'none'}. Upcoming: ${upcoming.join(', ') || 'none'}. Backlog = iteration ${sprintPath()}.

How you work
- Azure DevOps is the only source of truth. Read live data with your tools before deciding anything; never guess ids, parents, states, sprints or columns.
- You cannot write to Azure DevOps. To change anything, call propose_changes once with the complete set of changes. The user reviews, edits and applies it in the UI. After a successful propose_changes call the turn ends, so put any explanation in the summary field.
- Before proposing new items, inspect the intended parent with get_item and its subtree with get_tree. Avoid duplicates and match sibling conventions (title style, tags). For a breakdown, create concrete, independently shippable Tasks (or Stories that group Tasks when that adds value), each with a short Markdown description and, when useful, acceptance criteria.
- New items are assigned to ${user.name} automatically; the area is inherited from the parent (Features use the team's area). Use refs (e.g. "s1") to parent new items under items created earlier in the same proposal.
- If the request is ambiguous (which Feature, which sprint), ask one short question instead of proposing.
- You cannot delete items, create sprints/iterations/areas, change team settings, assign items to other people, or edit or delete existing comments. Say so if asked.
- When a message starts with [Applied changes], it reports what the user applied from your last proposal; use it as fact.
- Reply in the user's language, concisely, in Markdown. Refer to items as #id.

Ticket methodology (follow it):
${methodology()}`;
  }

  const sessions = new Map();

  function emit(s, event) {
    const ev = { ...event, seq: s.seq++ };
    s.events.push(ev);
    if (s.events.length > 4000) s.events.splice(0, s.events.length - 4000);
    const line = `id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`;
    for (const res of s.clients) res.write(line);
  }

  function tools(s) {
    const read = (name, description, parameters, fn) =>
      defineTool(name, {
        description,
        parameters,
        skipPermission: true,
        handler: async (args) => {
          try {
            const r = await fn(args || {});
            return typeof r === 'string' ? r : JSON.stringify(r);
          } catch (e) {
            return { textResultForLlm: `Error: ${e.message}`, resultType: 'failure', error: e.message };
          }
        },
      });
    const idParam = { type: 'integer', description: 'Work item id' };
    const changeSchema = {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['create', 'update', 'comment', 'feature_column'] },
        reason: { type: 'string', description: 'One short sentence: why this change' },
        ref: { type: 'string', description: 'create: local reference (e.g. "t1") so later changes can use it as parent/id' },
        id: { type: ['integer', 'string'], description: 'update/comment/feature_column: existing id, or ref of an earlier create' },
        type: { type: 'string', enum: CREATE_TYPES, description: 'create: work item type' },
        title: { type: 'string' },
        description: { type: 'string', description: 'Markdown' },
        acceptanceCriteria: { type: 'string', description: 'Markdown' },
        reproSteps: { type: 'string', description: 'Markdown (Bugs)' },
        priority: { type: 'integer', minimum: 1, maximum: 4 },
        state: { type: 'string' },
        sprint: { type: 'string', description: '"Backlog", "current", or an existing sprint name from list_sprints' },
        parent: { type: ['integer', 'string'], description: 'Existing id or ref of an earlier create' },
        tags: { type: 'array', items: { type: 'string' }, description: 'create: tags' },
        addTags: { type: 'array', items: { type: 'string' } },
        removeTags: { type: 'array', items: { type: 'string' } },
        related: { type: 'array', items: { type: ['integer', 'string'] }, description: 'create: ids/refs to link as Related' },
        text: { type: 'string', description: 'comment: Markdown text' },
        column: { type: 'string', description: 'feature_column: Features board column name' },
      },
      required: ['kind'],
    };
    return [
      read('get_item', 'Get one work item: fields, description, tags, sprint, area, ancestors up to the top, direct children and recent comments.', { type: 'object', properties: { id: idParam }, required: ['id'] }, getItemTool),
      read(
        'get_tree',
        'Get the descendants of a work item (e.g. all Stories/Tasks under a Feature). Closed children are hidden unless includeClosed.',
        { type: 'object', properties: { id: idParam, depth: { type: 'integer', minimum: 1, maximum: 4 }, includeClosed: { type: 'boolean' } }, required: ['id'] },
        getTreeTool,
      ),
      read(
        'search_items',
        'Search work items in SAN SA by title/tag text (or an id). Open items only unless includeClosed.',
        {
          type: 'object',
          properties: {
            text: { type: 'string' },
            types: { type: 'array', items: { type: 'string', enum: [...CREATE_TYPES, 'Epic'] } },
            includeClosed: { type: 'boolean' },
            assignedToMe: { type: 'boolean' },
            top: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
        searchTool,
      ),
      read(
        'list_my_items',
        "List the user's own Tasks, Bugs and Stories with state, sprint, parent/Feature and tags. Open items only unless includeClosed (closed in the last 21 days).",
        { type: 'object', properties: { includeClosed: { type: 'boolean' } } },
        myItemsTool,
      ),
      read('list_features', 'List the Features on the team Features board (and Features of the user\'s items), with board columns and states.', { type: 'object', properties: {} }, featuresTool),
      read('list_sprints', 'List existing sprints (recent, current and future). New sprints are never created.', { type: 'object', properties: {} }, sprintsTool),
      defineTool('propose_changes', {
        description:
          'Propose changes to Azure DevOps for the user to review and apply. Nothing is written until the user applies it. Kinds: create (Task/Bug/User Story/Feature), update (title, description, acceptanceCriteria, reproSteps, priority, state, sprint, parent, addTags, removeTags), comment (adds a new comment), feature_column (move a Feature on the board). Call once per request with every change.',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'One or two sentences describing the proposal' },
            changes: { type: 'array', items: changeSchema, minItems: 1 },
          },
          required: ['summary', 'changes'],
        },
        skipPermission: true,
        isTerminal: true,
        handler: async (args) => {
          try {
            const changes = await validateChanges(args?.changes);
            const proposal = { id: randomUUID(), sessionId: s.id, summary: String(args?.summary || '').slice(0, 1000), changes, status: 'pending', createdAt: new Date().toISOString() };
            proposals.set(proposal.id, proposal);
            emit(s, { type: 'proposal', proposal });
            return `Proposal with ${changes.length} change(s) is now shown to the user for review. Stop here.`;
          } catch (e) {
            return { textResultForLlm: `The proposal is invalid; fix it and call propose_changes again.\n${e.message}`, resultType: 'failure', error: e.message };
          }
        },
      }),
    ];
  }

  async function createSession(itemId) {
    const client = await getClient();
    const s = { id: randomUUID(), events: [], seq: 0, clients: new Set(), notes: [], itemId: itemId ? Number(itemId) : null, busy: false, sdk: null };
    const list = tools(s);
    s.sdk = await client.createSession({
      model: MODEL,
      onPermissionRequest: approveAll,
      systemMessage: { mode: 'replace', content: await systemPrompt() },
      tools: list,
      availableTools: list.map((t) => `custom:${t.name}`),
      streaming: true,
      infiniteSessions: { enabled: false },
    });
    s.sdk.on((ev) => {
      const e = ev.data || {};
      switch (ev.type) {
        case 'assistant.message_delta':
          if (e.deltaContent) emit(s, { type: 'delta', messageId: e.messageId, text: e.deltaContent });
          break;
        case 'assistant.message':
          if (e.content) emit(s, { type: 'message', messageId: e.messageId, text: e.content });
          break;
        case 'tool.execution_start':
          emit(s, { type: 'tool', id: e.toolCallId, name: e.toolName, args: e.arguments });
          break;
        case 'tool.execution_complete':
          emit(s, { type: 'tool_done', id: e.toolCallId, success: e.success !== false, error: typeof e.error === 'string' ? e.error : e.error?.message });
          break;
        case 'session.idle':
          s.busy = false;
          emit(s, { type: 'idle' });
          break;
        case 'session.error':
          s.busy = false;
          emit(s, { type: 'error', message: e.message || 'The assistant failed.' });
          break;
        default:
      }
    });
    sessions.set(s.id, s);
    return s;
  }

  const getSession = (id) => {
    const s = sessions.get(id);
    if (!s) throw httpError(404, 'This chat has expired. Start a new one.');
    return s;
  };

  // ---------- routes ----------

  app.post('/api/agent/sessions', route(async (req) => {
    const s = await createSession(req.body?.itemId);
    return { id: s.id, model: MODEL, itemId: s.itemId };
  }));

  app.delete('/api/agent/sessions/:id', route(async (req) => {
    const s = sessions.get(req.params.id);
    if (s) {
      sessions.delete(s.id);
      for (const res of s.clients) res.end();
      await s.sdk.disconnect().catch(() => {});
    }
    return { ok: true };
  }));

  app.get('/api/agent/sessions/:id/events', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'This chat has expired. Start a new one.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const last = Number(req.headers['last-event-id'] ?? -1);
    for (const ev of s.events) if (ev.seq > last) res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
    s.clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      s.clients.delete(res);
    });
  });

  app.post('/api/agent/sessions/:id/messages', route(async (req) => {
    const s = getSession(req.params.id);
    const text = String(req.body?.text || '').trim();
    if (!text) throw httpError(400, 'Message is empty');
    if (s.busy) throw httpError(409, 'The assistant is still working on the previous message.');
    const parts = [...s.notes];
    s.notes = [];
    if (s.itemId && !s.contextSent) {
      parts.push(`[Context] I have work item #${s.itemId} open.`);
      s.contextSent = true;
    }
    parts.push(text);
    s.busy = true;
    emit(s, { type: 'user', text });
    try {
      await s.sdk.send({ prompt: parts.join('\n\n') });
    } catch (e) {
      s.busy = false;
      emit(s, { type: 'error', message: e.message });
      throw e;
    }
    return { ok: true };
  }));

  app.post('/api/agent/sessions/:id/abort', route(async (req) => {
    const s = getSession(req.params.id);
    await s.sdk.abort().catch(() => {});
    s.busy = false;
    emit(s, { type: 'idle', aborted: true });
    return { ok: true };
  }));

  app.post('/api/agent/proposals/:id/apply', route(async (req) => {
    const p = proposals.get(req.params.id);
    if (!p) throw httpError(404, 'Proposal not found (the server may have restarted).');
    if (p.status === 'applied') throw httpError(409, 'This proposal was already applied.');
    const dryRun = Boolean(req.body?.dryRun);
    const result = await applyChanges(req.body?.changes ?? p.changes, { dryRun });
    if (!dryRun) {
      p.status = 'applied';
      p.results = result.results;
      const s = sessions.get(p.sessionId);
      if (s) {
        const lines = result.results.map((r) => {
          const what = r.kind === 'create' ? `create ${r.ref}` : `${r.kind} #${r.id}`;
          return r.ok ? `- ${what}: done${r.id && r.kind === 'create' ? ` → #${r.id}` : ''}${r.warning ? ` (${r.warning})` : ''}` : `- ${what}: FAILED ${r.error}`;
        });
        s.notes.push(`[Applied changes] The user applied ${result.applied} of the proposed changes (${result.failed} failed; excluded changes were skipped):\n${lines.join('\n')}`);
        emit(s, { type: 'applied', proposalId: p.id, results: result.results });
      }
    }
    return result;
  }));

  app.post('/api/agent/proposals/:id/discard', route(async (req) => {
    const p = proposals.get(req.params.id);
    if (p && p.status === 'pending') {
      p.status = 'discarded';
      const s = sessions.get(p.sessionId);
      if (s) s.notes.push('[Applied changes] The user discarded your last proposal; nothing was written.');
    }
    return { ok: true };
  }));
}
