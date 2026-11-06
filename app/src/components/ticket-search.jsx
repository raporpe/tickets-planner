import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { StatePill, TypeLabel } from '@/components/work-item';
import { Keys } from '@/components/shortcuts-help';
import { useDetail } from '@/lib/detail';
import { NAV_ACTIONS, TICKET_ACTIONS, VIEW_ACTIONS } from '@/lib/shortcuts';
import pkg from '../../package.json';

const LIMIT = 40;

/** An id typed as "123", "#123" or pasted as an Azure DevOps work item URL. */
function parseId(q) {
  const url = q.match(/_workitems\/edit\/(\d+)/i) || q.match(/[?&]workitem=(\d+)/i);
  if (url) return Number(url[1]);
  const plain = q.match(/^#?(\d{3,})$/);
  return plain ? Number(plain[1]) : null;
}

function search(all, q) {
  const id = parseId(q);
  if (!q) return { id, hits: [...all].sort((a, b) => (b.changedDate || '').localeCompare(a.changedDate || '')).slice(0, LIMIT) };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = all
    .map((t) => {
      const hay = `${t.id} ${t.title}`.toLowerCase();
      if (id ? t.id !== id && !String(t.id).startsWith(String(id)) : !words.every((w) => hay.includes(w))) return null;
      const title = t.title.toLowerCase();
      const score = t.id === id ? 0 : title.startsWith(words[0]) ? 1 : 2;
      return { t, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || (b.t.changedDate || '').localeCompare(a.t.changedDate || ''))
    .slice(0, LIMIT)
    .map((h) => h.t);
  return { id, hits };
}

/** Ctrl/Cmd+K: find a ticket by title, id or ADO link, or run an action on the current ticket. */
export function TicketSearch({ data, getTarget, onAction, onNavigate, onShowShortcuts, onShowVersion, onView, showClosed }) {
  const { openItem } = useDetail();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const q = useDeferredValue(query.trim());

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        setOpen((o) => {
          if (!o) setTarget(getTarget?.() || null);
          return !o;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [getTarget]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const featureTitle = useMemo(() => new Map(data.features.map((f) => [f.id, f.title])), [data.features]);
  const all = useMemo(() => {
    const seen = new Set();
    return [...data.items, ...data.features].filter((t) => !seen.has(t.id) && seen.add(t.id));
  }, [data.items, data.features]);
  const { id, hits } = useMemo(() => search(all, q), [all, q]);
  const unknownId = id && !hits.some((t) => t.id === id);

  const pick = (ticketId) => {
    setOpen(false);
    openItem(ticketId);
  };
  // Run after the dialog has closed so pickers can take focus.
  const later = (fn) => {
    setOpen(false);
    setTimeout(fn, 80);
  };

  const words = id ? null : q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (label) => words && words.every((w) => label.toLowerCase().includes(w));
  const targetItem = target && all.find((t) => t.id === target.id);
  const actions = target ? TICKET_ACTIONS.filter((a) => match(a.label)) : [];
  const navs = words ? NAV_ACTIONS.filter((a) => match(a.label)) : [];
  const viewLabel = (a) => (showClosed && a.onLabel) || a.label;
  // View toggles are listed even before typing, so "show closed" is one Ctrl+K away.
  const views = id ? [] : VIEW_ACTIONS.filter((a) => !words.length || match(viewLabel(a)));
  const showHelp = words && match('Keyboard shortcuts help');
  const showVersion = !id && (!words.length || match(`Show version about update v${pkg.version}`));

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen} title="Find a ticket" description="Search by title, id or Azure DevOps link, or run an action" className="sm:max-w-2xl">
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={target ? `Search tickets, or an action for #${target.id}…` : 'Search by title, id or paste an Azure DevOps link…'} />
        <CommandList className="max-h-[min(28rem,60vh)]">
          <CommandEmpty>No ticket or action matches “{q}”.</CommandEmpty>
          {actions.length > 0 && (
            <CommandGroup heading={`Actions on #${target.id}${targetItem ? ` · ${targetItem.title}` : ''}`} className="[&_[cmdk-group-heading]]:truncate">
              {actions.map((a) => (
                <CommandItem key={a.id} value={`action-${a.id}`} onSelect={() => later(() => onAction(a.id, target))}>
                  {a.label}
                  <span data-slot="command-shortcut" className="ml-auto">
                    <Keys keys={a.keys} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {unknownId && (
            <CommandGroup heading="Azure DevOps">
              <CommandItem value={`open-${id}`} onSelect={() => pick(id)}>
                <ExternalLink className="text-muted-foreground" />
                Open #{id}
                <span className="ml-auto text-xs text-muted-foreground">Not in your planner; loads it from ADO</span>
              </CommandItem>
            </CommandGroup>
          )}
          {hits.length > 0 && (
            <CommandGroup heading={q ? 'Tickets' : 'Recently changed'}>
              {hits.map((t) => (
                <CommandItem key={t.id} value={String(t.id)} onSelect={() => pick(t.id)} className="gap-2.5">
                  <span className="w-14 shrink-0">
                    <TypeLabel type={t.type || 'Feature'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{t.title}</span>
                    {t.featureId && featureTitle.get(t.featureId) && (
                      <span className="block truncate text-xs text-muted-foreground">{featureTitle.get(t.featureId)}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.id}</span>
                  <StatePill state={t.state} className="shrink-0" />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {navs.length > 0 && (
            <CommandGroup heading="Navigate">
              {navs.map((a) => (
                <CommandItem key={a.id} value={`nav-${a.id}`} onSelect={() => later(() => onNavigate(a.id))}>
                  {a.label}
                  <span data-slot="command-shortcut" className="ml-auto">
                    <Keys keys={a.keys} sequence />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {views.length > 0 && (
            <CommandGroup heading="View">
              {views.map((a) => (
                <CommandItem key={a.id} value={`view-${a.id}`} onSelect={() => later(() => onView(a.id))}>
                  {viewLabel(a)}
                  <span data-slot="command-shortcut" className="ml-auto">
                    <Keys keys={a.keys} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(showHelp || showVersion) && (
            <CommandGroup heading="Help">
              {showHelp && (
                <CommandItem value="help-shortcuts" onSelect={() => later(onShowShortcuts)}>
                  Keyboard shortcuts
                  <span data-slot="command-shortcut" className="ml-auto">
                    <Keys keys={['?']} />
                  </span>
                </CommandItem>
              )}
              {showVersion && (
                <CommandItem value="help-version" onSelect={() => later(onShowVersion)}>
                  Show version
                  <span data-slot="command-shortcut" className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                    v{pkg.version}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
    </>
  );
}
