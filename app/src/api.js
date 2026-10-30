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
  detail: (id) => request('GET', `/workitems/${id}`),
  addComment: (id, text) => request('POST', `/workitems/${id}/comments`, { text }),
  editComment: (id, commentId, text, format) => request('PATCH', `/workitems/${id}/comments/${commentId}`, { text, format }),
};
