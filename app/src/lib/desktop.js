import { isTauri } from '@tauri-apps/api/core';

// Embedded browser previews can belong to another Tauri host; only our window uses native commands.
export const isDesktop = typeof window !== 'undefined' && isTauri() && window.__TICKETS_DESKTOP__ === true;

export async function openExternal(url) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only web links can be opened');
  if (isDesktop) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noreferrer');
  }
}

export async function writeClipboard(text, html) {
  if (isDesktop) {
    const { writeText, writeHtml } = await import('@tauri-apps/plugin-clipboard-manager');
    if (html) await writeHtml(html, text);
    else await writeText(text);
  } else if (html && window.ClipboardItem && navigator.clipboard?.write) {
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

export function installDesktopLinks(onError) {
  if (!isDesktop) return;
  const follow = (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    const url = new URL(link.href);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    openExternal(url.href).catch(onError);
  };
  document.addEventListener('click', follow);
  document.addEventListener('auxclick', follow);
}
