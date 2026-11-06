import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarClock,
  CircleDot,
  Copy,
  ExternalLink,
  Flame,
  FolderGit2,
  GitPullRequest,
  Layers,
  MessageSquare,
  Pencil,
  SignalHigh,
} from 'lucide-react';
import { Keys } from '@/components/shortcuts-help';
import { TypeLabel } from '@/components/work-item';
import { isSprintUnplanned, isSprintUnplannedTag, SPRINT_UNPLANNED_TAG } from '@/lib/planning';
import { TICKET_ACTIONS } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

const ACTION_ICONS = {
  state: CircleDot,
  priority: SignalHigh,
  sprint: CalendarClock,
  feature: Layers,
  'link-pr': GitPullRequest,
  comment: MessageSquare,
  edit: Pencil,
  'open-ado': ExternalLink,
  copy: Copy,
  'copy-ab': FolderGit2,
};

export function TicketContextMenu({ data, onAction, onUpdate, onOpenDetail }) {
  const [menu, setMenu] = useState(null); // { x, y, id, scope }
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [activeIndex, setActiveIndex] = useState(-1);
  const menuRef = useRef(null);

  useEffect(() => {
    const onContextMenu = (e) => {
      const targetEl = e.target;
      if (
        targetEl instanceof HTMLElement &&
        (targetEl.isContentEditable || /^(INPUT|TEXTAREA)$/.test(targetEl.tagName) || window.getSelection()?.toString())
      ) {
        return;
      }
      const cardEl = targetEl instanceof Element ? targetEl.closest('[data-item-id]') : null;
      if (!cardEl) {
        e.preventDefault();
        setMenu(null);
        return;
      }
      const id = Number(cardEl.dataset.itemId);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex(-1);
      setPos({ left: e.clientX, top: e.clientY });
      setMenu({ x: e.clientX, y: e.clientY, id, scope: cardEl });
    };

    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, []);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const left = Math.max(pad, Math.min(menu.x, window.innerWidth - rect.width - pad));
    const top = Math.max(pad, Math.min(menu.y, window.innerHeight - rect.height - pad));
    setPos({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenu(null);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu]);

  if (!menu || !data) return null;

  const item = data.items?.find((i) => i.id === menu.id) || data.features?.find((f) => f.id === menu.id);
  if (!item) return null;

  const isFeatureOnly = !data.items?.some((i) => i.id === menu.id);
  const unplanned = !isFeatureOnly && isSprintUnplanned(item);

  const triggerAction = (actionId) => {
    const target = { id: menu.id, scope: menu.scope };
    setMenu(null);
    setTimeout(() => onAction(actionId, target), 40);
  };

  const toggleUnplanned = () => {
    setMenu(null);
    const current = (item.tags || []).filter((t) => !isSprintUnplannedTag(t));
    const nextTags = unplanned ? current : [...current, SPRINT_UNPLANNED_TAG];
    onUpdate?.(item, { tags: nextTags });
  };

  const quickGroup = isFeatureOnly ? [] : TICKET_ACTIONS.filter((a) => ['state', 'priority', 'sprint', 'feature'].includes(a.id));
  const detailGroup = isFeatureOnly ? [] : TICKET_ACTIONS.filter((a) => ['link-pr', 'comment', 'edit'].includes(a.id));
  const shareGroup = TICKET_ACTIONS.filter((a) => ['copy', 'copy-ab', 'open-ado'].includes(a.id));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for #${item.id}`}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 w-64 origin-top-left animate-in rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 fade-in-0 zoom-in-95 select-none"
    >
      {/* Ticket summary header */}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const id = item.id;
          setMenu(null);
          onOpenDetail?.(id);
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
      >
        <TypeLabel type={item.type || 'Feature'} />
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">#{item.id}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">{item.title}</span>
      </button>

      <div className="my-1 h-px bg-border/70" role="separator" />

      {quickGroup.length > 0 && (
        <>
          {quickGroup.map((a, idx) => {
            const Icon = ACTION_ICONS[a.id] || FolderGit2;
            return (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                onPointerEnter={() => setActiveIndex(idx)}
                onClick={() => triggerAction(a.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none',
                  activeIndex === idx && 'bg-accent text-accent-foreground',
                )}
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{a.label}</span>
                <Keys keys={a.keys} />
              </button>
            );
          })}

          <button
            type="button"
            role="menuitem"
            onClick={toggleUnplanned}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
          >
            <Flame className={cn('size-3.5 shrink-0', unplanned ? 'fill-current text-amber-500' : 'text-muted-foreground')} />
            <span className="flex-1">{unplanned ? 'Unmark Sprint-Unplanned' : 'Mark Sprint-Unplanned'}</span>
          </button>

          <div className="my-1 h-px bg-border/70" role="separator" />
        </>
      )}

      {detailGroup.length > 0 && (
        <>
          {detailGroup.map((a) => {
            const Icon = ACTION_ICONS[a.id] || FolderGit2;
            return (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                onClick={() => triggerAction(a.id)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{a.label}</span>
                <Keys keys={a.keys} />
              </button>
            );
          })}
          <div className="my-1 h-px bg-border/70" role="separator" />
        </>
      )}

      {shareGroup.map((a) => {
        const Icon = ACTION_ICONS[a.id] || FolderGit2;
        return (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            onClick={() => triggerAction(a.id)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">{a.label}</span>
            <Keys keys={a.keys} />
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
