import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '@/lib/desktop';

async function request(method, url, body) {
  if (isDesktop) {
    try {
      return await invoke('planner_request', { method, url, body: body ?? null });
    } catch (error) {
      const err = new Error(error?.error || String(error));
      err.status = error?.status || 500;
      throw err;
    }
  }
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `${method} ${url} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  attachment: (url) => invoke('planner_attachment', { url }),
  checkUpdate: () => (isDesktop ? invoke('planner_check_update') : Promise.resolve({ available: false })),
  installUpdate: () => invoke('planner_install_update'),
  progress: () => request('GET', '/progress'),
  status: () => request('GET', '/auth/status'),
  signInCli: () => request('POST', '/auth/cli'),
  startDevice: () => request('POST', '/auth/device'),
  pollDevice: () => request('GET', '/auth/device'),
  overview: () => request('GET', '/overview'),
  settings: () => request('GET', '/settings'),
  saveSettings: (patch) => request('PATCH', '/settings', patch),
  update: (id, patch) => request('PATCH', `/workitems/${id}`, patch),
  ancestors: (id) => request('GET', `/workitems/${id}/ancestors`),
  children: (id) => request('GET', `/workitems/${id}/children`),
  moveFeature: (id, column) => request('PATCH', `/features/${id}/column`, { column }),
  detail: (id) => request('GET', `/workitems/${id}`),
  addComment: (id, text) => request('POST', `/workitems/${id}/comments`, { text }),
  editComment: (id, commentId, text, format) => request('PATCH', `/workitems/${id}/comments/${commentId}`, { text, format }),
  linkPullRequest: (id, ref) => request('POST', `/workitems/${id}/pull-requests`, { ref }),
  unlinkPullRequest: (id, artifact) => request('DELETE', `/workitems/${id}/pull-requests`, { artifact }),
};
