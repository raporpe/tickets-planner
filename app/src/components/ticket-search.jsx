import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { StatePill, TypeLabel } from '@/components/work-item';
import { useDetail } from '@/lib/detail';

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

/** Ctrl/Cmd+K: find a ticket by title, id or ADO link and open its detail panel. */
export function TicketSearch({ data }) {
  const { openItem } = useDetail();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  return (
    <>
    <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => setOpen(true)} aria-label="Find a ticket (Ctrl+K)">
      <Search />
      Find ticket
      <kbd className="ml-1 rounded border bg-muted px-1 font-sans text-[10px] font-medium">{/Mac|iPhone/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
    </Button>
    <CommandDialog open={open} onOpenChange={setOpen} title="Find a ticket" description="Search by title, id or Azure DevOps link" className="sm:max-w-2xl">
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search by title, id or paste an Azure DevOps link…" />
        <CommandList className="max-h-[min(28rem,60vh)]">
          <CommandEmpty>No ticket matches “{q}”.</CommandEmpty>
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
        </CommandList>
      </Command>
    </CommandDialog>
    </>
  );
}
