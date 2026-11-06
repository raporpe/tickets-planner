import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Bold, Code, Italic, Link2, List, ListOrdered, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { api } from '@/api';
import { isDesktop } from '@/lib/desktop';
import { toast } from 'sonner';

const PROXY = '/api/attachment?url=';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noreferrer');
  }
});

const sanitize = (html) => DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button'] });

// Native images use authenticated IPC; the browser keeps its existing proxy.
export function toDisplay(html, markdown = false) {
  const source = markdown ? marked.parse(html || '', { gfm: true, breaks: true }) : html;
  return sanitize(source).replace(
    /(<img\b[^>]*?\ssrc=")(https:\/\/[^"]+\/_apis\/wit\/attachments\/[^"]+)"/gi,
    (_, pre, url) => {
      const encoded = encodeURIComponent(url.replace(/&amp;/g, '&'));
      return isDesktop ? `${pre}" data-ado-attachment="${encoded}"` : `${pre}${PROXY}${encoded}"`;
    },
  );
}

function loadNativeImages(element) {
  let disposed = false;
  const urls = [];
  for (const image of element?.querySelectorAll('img[data-ado-attachment]') || []) {
    const url = decodeURIComponent(image.dataset.adoAttachment);
    api.attachment(url).then(({ mime, data }) => {
      if (disposed) return;
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      urls.push(objectUrl);
      image.src = objectUrl;
    }).catch((error) => {
      if (disposed) return;
      image.alt = 'Could not load this Azure DevOps image';
      toast.error(`Could not load an attachment: ${error.error || error.message || error}`);
    });
  }
  return () => {
    disposed = true;
    urls.forEach((url) => URL.revokeObjectURL(url));
  };
}

// Restore original attachment URLs, never saving transient blob URLs to ADO.
export function toStorage(html) {
  let source = html;
  if (isDesktop) {
    const element = document.createElement('div');
    element.innerHTML = sanitize(html);
    for (const image of element.querySelectorAll('img[data-ado-attachment]')) {
      image.setAttribute('src', decodeURIComponent(image.dataset.adoAttachment));
      image.removeAttribute('data-ado-attachment');
    }
    source = element.innerHTML;
  }
  return sanitize(source)
    .replace(/(<img\b[^>]*?\ssrc=")\/api\/attachment\?url=([^"]+)"/gi, (_, pre, enc) => `${pre}${decodeURIComponent(enc.replace(/&amp;/g, '&'))}"`)
    .trim();
}

export const isBlank = (html, markdown = false) => (markdown ? !html?.trim() : !html || !sanitize(html).replace(/<(?!img)[^>]+>|&nbsp;|\s/g, ''));

export function RichView({ html, markdown = false, className, empty = 'Nothing here yet.' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (isDesktop) return loadNativeImages(ref.current);
  }, [html, markdown]);
  if (isBlank(html, markdown)) return <p className={cn('text-[13px] text-muted-foreground italic', className)}>{empty}</p>;
  return <div ref={ref} className={cn('rich', className)} dangerouslySetInnerHTML={{ __html: toDisplay(html, markdown) }} />;
}

const TOOLS = [
  { cmd: 'bold', icon: Bold, label: 'Bold', keys: 'Ctrl+B' },
  { cmd: 'italic', icon: Italic, label: 'Italic', keys: 'Ctrl+I' },
  { cmd: 'insertUnorderedList', icon: List, label: 'Bulleted list' },
  { cmd: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
  { cmd: 'code', icon: Code, label: 'Inline code' },
  { cmd: 'link', icon: Link2, label: 'Link', keys: 'Ctrl+K' },
];

function run(cmd) {
  if (cmd === 'link') {
    const url = window.prompt('Link URL');
    if (url) document.execCommand('createLink', false, url);
    return;
  }
  if (cmd === 'code') {
    const sel = window.getSelection();
    const text = sel?.toString();
    if (text) document.execCommand('insertHTML', false, `<code>${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</code>&nbsp;`);
    return;
  }
  document.execCommand(cmd, false);
}

/**
 * Plain-text editor for fields and comments stored as Markdown in ADO.
 */
function MarkdownEditor({ initialHtml, placeholder, saving, saveLabel, onSave, onCancel, onDirtyChange, autoFocus, minHeight }) {
  const ref = useRef(null);
  const baseline = useRef((initialHtml || '').trim());

  const checkDirty = () => {
    if (!ref.current) return;
    const current = ref.current.value.trim();
    onDirtyChange?.(current !== baseline.current);
  };

  useEffect(() => {
    if (!ref.current) return;
    ref.current.value = initialHtml || '';
    baseline.current = (initialHtml || '').trim();
    onDirtyChange?.(false);
    if (autoFocus) {
      ref.current.focus();
      ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
    }
  }, [initialHtml, autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const save = () => !saving && onSave(ref.current.value.trim(), () => ref.current && (ref.current.value = ''));

  return (
    <div className="rounded-md border bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
      <textarea
        ref={ref}
        disabled={saving}
        aria-label={placeholder}
        placeholder={placeholder}
        spellCheck
        onInput={checkDirty}
        className={cn('block max-h-[50vh] w-full resize-y bg-transparent px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none placeholder:text-muted-foreground', minHeight)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape' && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <EditorFooter hint={`Markdown · Ctrl+Enter to ${saveLabel.toLowerCase()}`} saving={saving} saveLabel={saveLabel} onSave={save} onCancel={onCancel} />
    </div>
  );
}

function EditorFooter({ hint, saving, saveLabel, onSave, onCancel }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t px-2 py-1.5">
      <span className="mr-auto text-[11px] text-muted-foreground">{hint}</span>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      )}
      <Button type="button" size="sm" onClick={onSave} disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        {saveLabel}
      </Button>
    </div>
  );
}

/**
 * Minimal HTML editor for ADO rich-text fields. Uncontrolled: reads innerHTML on save.
 * Ctrl+Enter saves, Escape cancels. Pass `markdown` for fields stored as Markdown.
 */
export function RichEditor({ markdown = false, ...props }) {
  return markdown ? <MarkdownEditor saveLabel="Save" autoFocus minHeight="min-h-28" {...props} /> : <HtmlEditor {...props} />;
}

function HtmlEditor({ initialHtml = '', placeholder, saving, saveLabel = 'Save', onSave, onCancel, onDirtyChange, autoFocus = true, minHeight = 'min-h-28' }) {
  const ref = useRef(null);
  const baseline = useRef('');
  const initiallyBlank = useRef(true);

  const checkDirty = () => {
    if (!ref.current) return;
    const raw = ref.current.innerHTML;
    if (initiallyBlank.current && isBlank(raw, false)) {
      onDirtyChange?.(false);
      return;
    }
    onDirtyChange?.(toStorage(raw) !== baseline.current);
  };

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = toDisplay(initialHtml);
    initiallyBlank.current = isBlank(initialHtml, false);
    baseline.current = initiallyBlank.current ? '' : toStorage(ref.current.innerHTML);
    onDirtyChange?.(false);
    if (autoFocus) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
    if (isDesktop) return loadNativeImages(ref.current);
  }, [initialHtml, autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const save = () => !saving && onSave(toStorage(ref.current.innerHTML), () => ref.current && (ref.current.innerHTML = ''));

  return (
    <div className="rounded-md border bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
      <div className="flex items-center gap-0.5 border-b px-1 py-0.5" role="toolbar" aria-label="Formatting">
        {TOOLS.map(({ cmd, icon: Icon, label, keys }) => (
          <Tooltip key={cmd}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label={label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  run(cmd);
                  checkDirty();
                }}
              >
                <Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{keys ? `${label} (${keys})` : label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable={!saving}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        className={cn('rich max-h-[50vh] overflow-y-auto px-3 py-2 outline-none', minHeight)}
        onInput={checkDirty}
        onPaste={(e) => {
          const html = e.clipboardData.getData('text/html');
          if (!html) return;
          e.preventDefault();
          document.execCommand('insertHTML', false, sanitize(html));
          checkDirty();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape' && onCancel) {
            e.preventDefault();
            onCancel();
          } else if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            run('link');
            checkDirty();
          }
        }}
      />
      <EditorFooter hint={`Ctrl+Enter to ${saveLabel.toLowerCase()}`} saving={saving} saveLabel={saveLabel} onSave={save} onCancel={onCancel} />
    </div>
  );
}
