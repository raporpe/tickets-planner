import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, Loader2, User, Users, X } from 'lucide-react';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { StatePill, TypeLabel } from '@/components/work-item';
import { CommentAvatar } from '@/components/item-detail';
import { Keys } from '@/components/shortcuts-help';
import { api } from '@/api';
import { STANDUP_TEAM, resolveTeamMember } from '@/domain/standup-team';
import { useDetail } from '@/lib/detail';
import { NAV_ACTIONS, TICKET_ACTIONS, VIEW_ACTIONS } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import pkg from '../../package.json';

const LIMIT = 50;

/** An id typed as "123", "#123", "AB#123", or pasted as an Azure DevOps work item URL. */
function parseId(q) {
  const url = q.match(/_workitems\/edit\/(\d+)/i) || q.match(/[?&]workitem=(\d+)/i);
  if (url) return Number(url[1]);
  const plain = q.match(/^(?:ab)?#?(\d{3,})$/i);
  return plain ? Number(plain[1]) : null;
}

function isTeamTicket(t) {
  return Boolean(t?.isTeamMember || resolveTeamMember(t?.assignedTo));
}

function recencyDate(t) {
  const changed = t?.changedDate || '';
  const created = t?.createdDate || '';
  return changed >= created ? changed : created;
}

function sortByTeamThenRecency(items, exactId = null) {
  return [...items].sort((a, b) => {
    const aExact = exactId && a.id === exactId ? 1 : 0;
    const bExact = exactId && b.id === exactId ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aTeam = isTeamTicket(a) ? 1 : 0;
    const bTeam = isTeamTicket(b) ? 1 : 0;
    if (aTeam !== bTeam) return bTeam - aTeam;
    return recencyDate(b).localeCompare(recencyDate(a));
  });
}

function search(all, q) {
  const id = parseId(q);
  if (!q) {
    return {
      id,
      hits: sortByTeamThenRecency(all, null).slice(0, LIMIT),
    };
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = all.filter((t) => {
    const member = resolveTeamMember(t.assignedTo);
    const hay = `${t.id} ${t.title || ''} ${(t.tags || []).join(' ')} ${t.assignedTo?.name || ''} ${t.assignedTo?.email || ''} ${member?.name || ''} ${member?.fullName || ''}`.toLowerCase();
    if (id) {
      return t.id === id || String(t.id).startsWith(String(id)) || words.every((w) => hay.includes(w));
    }
    return words.every((w) => hay.includes(w));
  });
  return {
    id,
    hits: sortByTeamThenRecency(matched, id).slice(0, LIMIT),
  };
}

/** Ctrl/Cmd+K: find a ticket by title, id or ADO link, or run an action on the current ticket. */
export function TicketSearch({ data, getTarget, onAction, onNavigate, onShowShortcuts, onShowVersion, onMockMode, mockEnabled, onView, showClosed }) {
  const { openItem } = useDetail();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('mine'); // 'mine' | 'all'
  const [query, setQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [target, setTarget] = useState(null);
  const [teamPool, setTeamPool] = useState([]);
  const [remoteHits, setRemoteHits] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const q = useDeferredValue(query.trim());

  const selectedMember = useMemo(
    () => (selectedMemberId ? STANDUP_TEAM.find((m) => m.id === selectedMemberId) || null : null),
    [selectedMemberId],
  );

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
    if (!open) {
      setQuery('');
      setScope('mine');
      setSelectedMemberId(null);
      setRemoteHits([]);
      setRemoteLoading(false);
      return;
    }
    // Warm up the Stand Up team ticket pool as soon as Ctrl+K opens
    let cancelled = false;
    api
      .search('')
      .then((res) => {
        if (!cancelled && res?.items?.length) {
          setTeamPool(res.items);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const featureTitle = useMemo(() => new Map(data.features.map((f) => [f.id, f.title])), [data.features]);
  const all = useMemo(() => {
    const seen = new Set();
    return [...data.items, ...data.features].filter((t) => !seen.has(t.id) && seen.add(t.id));
  }, [data.items, data.features]);
  const { id, hits: localHits } = useMemo(() => search(all, q), [all, q]);

  // Project-wide search in SAN SA when scope === 'all'
  useEffect(() => {
    if (!open || scope !== 'all') return undefined;
    const effectiveQuery = selectedMember ? `${selectedMember.name} ${q}`.trim() : q;
    let cancelled = false;
    setRemoteLoading(true);
    const delay = !effectiveQuery || id ? 0 : 120;
    const t = setTimeout(() => {
      api
        .search(effectiveQuery)
        .then((res) => {
          if (!cancelled) {
            const items = res?.items || [];
            setRemoteHits(items);
            if (!effectiveQuery && items.length) setTeamPool(items);
            setRemoteLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setRemoteLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, scope, q, id, selectedMember]);

  // Stand Up teammates matching the query (shown first by priority when searching)
  const matchingMembers = useMemo(() => {
    if (scope !== 'all' || id || selectedMember) return [];
    if (!q) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return STANDUP_TEAM.filter((m) => {
      const hay = `${m.id} ${m.name} ${m.fullName} ${m.email} ${(m.aliases || []).join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [scope, q, id, selectedMember]);

  const hits = useMemo(() => {
    if (scope !== 'all') return localHits;
    const basePool = [];
    const seenBase = new Set();
    for (const item of [...localHits, ...teamPool, ...remoteHits]) {
      if (item && !seenBase.has(item.id)) {
        seenBase.add(item.id);
        basePool.push(item);
      }
    }
    const memberFiltered = selectedMember
      ? basePool.filter((t) => resolveTeamMember(t.assignedTo)?.id === selectedMember.id)
      : basePool;
    if (!q) {
      return sortByTeamThenRecency(memberFiltered, null).slice(0, LIMIT);
    }
    const clientFiltered = search(memberFiltered, q).hits;
    const serverFiltered = selectedMember
      ? remoteHits.filter((t) => resolveTeamMember(t.assignedTo)?.id === selectedMember.id)
      : remoteHits;
    const combined = remoteLoading ? clientFiltered : [...clientFiltered, ...serverFiltered];
    const seen = new Set();
    const deduped = [];
    for (const item of combined) {
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        deduped.push(item);
      }
    }
    return sortByTeamThenRecency(deduped, id).slice(0, LIMIT);
  }, [scope, q, id, localHits, teamPool, remoteHits, remoteLoading, selectedMember]);

  const { teamHits, otherHits } = useMemo(() => {
    if (scope !== 'all') return { teamHits: hits, otherHits: [] };
    const team = [];
    const other = [];
    for (const t of hits) {
      if (isTeamTicket(t)) team.push(t);
      else other.push(t);
    }
    return { teamHits: team, otherHits: other };
  }, [scope, hits]);

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
  const actions = scope === 'mine' && target ? TICKET_ACTIONS.filter((a) => match(a.label)) : [];
  const navs = scope === 'mine' && words ? NAV_ACTIONS.filter((a) => match(a.label)) : [];
  const viewLabel = (a) => (showClosed && a.onLabel) || a.label;
  // View toggles are listed even before typing, so "show closed" is one Ctrl+K away.
  const views = scope !== 'mine' || id ? [] : VIEW_ACTIONS.filter((a) => !words.length || match(viewLabel(a)));
  const showHelp = scope === 'mine' && words && match('Keyboard shortcuts help');
  const showVersion = scope === 'mine' && !id && (!words.length || match(`Show version about update v${pkg.version}`));
  const showMock = scope === 'mine' && (mockEnabled || /^(\/mock|dev:mock)\b/i.test(q));

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen} title="Find a ticket" description="Search by title, id or Azure DevOps link, or run an action" className="sm:max-w-2xl">
        <Command
        shouldFilter={false}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setScope((s) => (s === 'mine' ? 'all' : 'mine'));
          } else if (e.key === 'Backspace' && !query && selectedMember) {
            e.preventDefault();
            setSelectedMemberId(null);
          }
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-md bg-muted p-0.5">
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setScope('mine');
                  setSelectedMemberId(null);
                }}
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
                  scope === 'mine' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <User className="size-3" />
                My tickets
              </button>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setScope('all')}
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
                  scope === 'all' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Globe className="size-3" />
                All SAN SA
              </button>
            </div>
            {scope === 'all' && selectedMember && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSelectedMemberId(null)}
                className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-background px-2 text-xs font-medium text-foreground shadow-2xs hover:bg-muted"
              >
                <CommentAvatar user={{ name: selectedMember.name, imageUrl: selectedMember.avatarUrl }} size="size-3.5" />
                <span>{selectedMember.name}</span>
                <X className="size-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {remoteLoading && scope === 'all' && <Loader2 className="size-3 animate-spin text-primary" />}
            <span>Press</span>
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-foreground/85">
              Tab ⇥
            </kbd>
            <span>to switch scope</span>
          </span>
        </div>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={
            scope === 'all'
              ? selectedMember
                ? `Filter ${selectedMember.name}’s tickets by title or #id…`
                : 'Search Stand Up team or any SAN SA ticket by name, title, or #id…'
              : target
                ? `Search my tickets, or an action for #${target.id}…`
                : 'Search my tickets by title, #id or paste an Azure DevOps link…'
          }
        />
        <CommandList className="max-h-[min(28rem,60vh)]">
          <CommandEmpty>
            {remoteLoading ? 'Searching SAN SA…' : `No ticket matches “${q}”.`}
          </CommandEmpty>
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
                <span className="ml-auto text-xs text-muted-foreground">Loads directly from Azure DevOps</span>
              </CommandItem>
            </CommandGroup>
          )}
          {matchingMembers.length > 0 && (
            <CommandGroup heading="Stand Up team · People">
              {matchingMembers.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`member-${m.id}`}
                  onSelect={() => {
                    setSelectedMemberId(m.id);
                    setQuery('');
                  }}
                  className="gap-2.5"
                >
                  <CommentAvatar user={{ name: m.name, imageUrl: m.avatarUrl }} size="size-5" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.fullName || m.name}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    View recent tickets
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {teamHits.length > 0 && (
            <CommandGroup
              heading={
                scope === 'all'
                  ? selectedMember
                    ? `${selectedMember.name} · by recency`
                    : 'Stand Up team · by recency'
                  : q
                    ? 'My tickets'
                    : 'Recently changed'
              }
            >
              {teamHits.map((t) => (
                <CommandItem key={t.id} value={String(t.id)} onSelect={() => pick(t.id)} className="gap-2.5">
                  <span className="w-14 shrink-0">
                    <TypeLabel type={t.type || 'Feature'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{t.title}</span>
                    {scope === 'all' && t.assignedTo?.name ? (
                      <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CommentAvatar user={t.assignedTo} size="size-3.5" />
                        <span className="truncate">{t.assignedTo.name}</span>
                      </span>
                    ) : (
                      t.featureId &&
                      featureTitle.get(t.featureId) && (
                        <span className="block truncate text-xs text-muted-foreground">{featureTitle.get(t.featureId)}</span>
                      )
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.id}</span>
                  <StatePill state={t.state} className="shrink-0" />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {scope === 'all' && otherHits.length > 0 && (
            <CommandGroup heading="Other SAN SA tickets">
              {otherHits.map((t) => (
                <CommandItem key={t.id} value={String(t.id)} onSelect={() => pick(t.id)} className="gap-2.5">
                  <span className="w-14 shrink-0">
                    <TypeLabel type={t.type || 'Feature'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{t.title}</span>
                    {t.assignedTo?.name && (
                      <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CommentAvatar user={t.assignedTo} size="size-3.5" />
                        <span className="truncate">{t.assignedTo.name}</span>
                      </span>
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
          {(showHelp || showVersion || showMock) && (
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
              {showMock && !mockEnabled && (
                <CommandItem value="dev-mock-cases" onSelect={() => later(() => onMockMode?.('all-cases'))}>
                  Load mock data (all compliance &amp; UI cases)
                  <span data-slot="command-shortcut" className="ml-auto text-xs text-muted-foreground">
                    Sandbox
                  </span>
                </CommandItem>
              )}
              {showMock && !mockEnabled && (
                <CommandItem value="dev-mock-clean" onSelect={() => later(() => onMockMode?.('all-clear'))}>
                  Load mock data (all hygiene passing · Sapphiry)
                  <span data-slot="command-shortcut" className="ml-auto text-xs text-muted-foreground">
                    Sandbox
                  </span>
                </CommandItem>
              )}
              {showMock && mockEnabled && (
                <CommandItem value="dev-mock-exit" onSelect={() => later(() => onMockMode?.(null))}>
                  Exit mock mode (return to live Azure DevOps)
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
