import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './lib/desktop.js';
import { mockStore } from './lib/mock-data.js';

async function request(method, url, body) {
  try {
    return await invoke('planner_request', { method, url, body: body ?? null });
  } catch (error) {
    const err = new Error(error?.error || String(error));
    err.status = error?.status || 500;
    throw err;
  }
}

export const api = {
  attachment: (url) => invoke('planner_attachment', { url }),
  checkUpdate: () => (isDesktop ? invoke('planner_check_update') : Promise.resolve({ available: false })),
  installUpdate: () => invoke('planner_install_update'),
  progress: () =>
    mockStore.isEnabled()
      ? Promise.resolve({ active: false, title: 'Mock sandbox ready', detail: 'Loaded in-memory mock dataset', steps: [] })
      : request('GET', '/progress'),
  status: () =>
    mockStore.isEnabled()
      ? Promise.resolve({ signedIn: true, user: 'raulpo@microsoft.com (Mock)', method: 'cli' })
      : request('GET', '/auth/status'),
  signInCli: () => request('POST', '/auth/cli'),
  startDevice: () => request('POST', '/auth/device'),
  pollDevice: () => request('GET', '/auth/device'),
  overview: () => (mockStore.isEnabled() ? Promise.resolve(mockStore.overview()) : request('GET', '/overview')),
  standup: (sprintPath) =>
    mockStore.isEnabled()
      ? Promise.resolve(mockStore.standup(null, sprintPath))
      : request('GET', `/standup?sprint=${encodeURIComponent(sprintPath || '')}`),
  search: (q) =>
    mockStore.isEnabled()
      ? Promise.resolve(mockStore.search(q))
      : request('GET', `/search?q=${encodeURIComponent(q || '')}`),
  settings: () => (mockStore.isEnabled() ? Promise.resolve({}) : request('GET', '/settings')),
  saveSettings: (patch) => (mockStore.isEnabled() ? Promise.resolve(patch) : request('PATCH', '/settings', patch)),
  update: (id, patch) => (mockStore.isEnabled() ? Promise.resolve(mockStore.update(id, patch)) : request('PATCH', `/workitems/${id}`, patch)),
  ancestors: (id) => (mockStore.isEnabled() ? Promise.resolve(mockStore.ancestors(id)) : request('GET', `/workitems/${id}/ancestors`)),
  children: (id) => (mockStore.isEnabled() ? Promise.resolve(mockStore.children(id)) : request('GET', `/workitems/${id}/children`)),
  moveFeature: (id, column) =>
    mockStore.isEnabled() ? Promise.resolve(mockStore.moveFeature(id, column)) : request('PATCH', `/features/${id}/column`, { column }),
  detail: (id) => (mockStore.isEnabled() ? Promise.resolve(mockStore.detail(id)) : request('GET', `/workitems/${id}`)),
  addComment: (id, text) =>
    mockStore.isEnabled() ? Promise.resolve(mockStore.addComment(id, text)) : request('POST', `/workitems/${id}/comments`, { text }),
  editComment: (id, commentId, text, format) =>
    mockStore.isEnabled()
      ? Promise.resolve(mockStore.editComment(id, commentId, text, format))
      : request('PATCH', `/workitems/${id}/comments/${commentId}`, { text, format }),
  linkPullRequest: (id, ref) =>
    mockStore.isEnabled() ? Promise.resolve(mockStore.linkPullRequest(id, ref)) : request('POST', `/workitems/${id}/pull-requests`, { ref }),
  unlinkPullRequest: (id, artifact) =>
    mockStore.isEnabled()
      ? Promise.resolve(mockStore.unlinkPullRequest(id, artifact))
      : request('DELETE', `/workitems/${id}/pull-requests`, { artifact }),
};
