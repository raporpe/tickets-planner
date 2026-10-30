async function request(method, url, body) {
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
  status: () => request('GET', '/auth/status'),
  signInCli: () => request('POST', '/auth/cli'),
  startDevice: () => request('POST', '/auth/device'),
  pollDevice: () => request('GET', '/auth/device'),
  overview: () => request('GET', '/overview'),
  update: (id, patch) => request('PATCH', `/workitems/${id}`, patch),
  ancestors: (id) => request('GET', `/workitems/${id}/ancestors`),
  moveFeature: (id, column) => request('PATCH', `/features/${id}/column`, { column }),
  detail: (id) => request('GET', `/workitems/${id}`),
  addComment: (id, text) => request('POST', `/workitems/${id}/comments`, { text }),
  editComment: (id, commentId, text, format) => request('PATCH', `/workitems/${id}/comments/${commentId}`, { text, format }),
  agentStart: (itemId) => request('POST', '/agent/sessions', { itemId }),
  agentSend: (id, text) => request('POST', `/agent/sessions/${id}/messages`, { text }),
  agentAbort: (id) => request('POST', `/agent/sessions/${id}/abort`),
  agentClose: (id) => request('DELETE', `/agent/sessions/${id}`),
  agentEvents: (id) => new EventSource(`/api/agent/sessions/${id}/events`),
  applyProposal: (id, changes) => request('POST', `/agent/proposals/${id}/apply`, { changes }),
  discardProposal: (id) => request('POST', `/agent/proposals/${id}/discard`),
};
