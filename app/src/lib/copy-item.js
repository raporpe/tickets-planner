const MAX_TITLE = 80;

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Keep the title short enough to drop into chat; cut on a word boundary.
export function shortTitle(title) {
  const t = title.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_TITLE) return t;
  const cut = t.slice(0, MAX_TITLE);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : MAX_TITLE).replace(/[\s,.;:-]+$/, '')}…`;
}

// Rich text (Teams, Outlook, Word) gets a real link on the id; plain text (AI chats, Markdown) gets a Markdown link.
export async function copyItem(item) {
  const title = shortTitle(item.title);
  const html = `<a href="${escape(item.url)}">#${item.id}</a> ${escape(title)} [${escape(item.state)}]`;
  const text = `[#${item.id}](${item.url}) ${title} [${item.state}]`;
  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }
}
