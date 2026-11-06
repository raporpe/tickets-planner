import { useEffect, useState } from 'react';
import { Check, Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SHORTCUT_GROUPS } from '@/lib/shortcuts';
import { api } from '@/api';
import { isDesktop, writeClipboard } from '@/lib/desktop';
import pkg from '../../package.json';

export function Keys({ keys, or, sequence }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <span key={k + i} className="flex items-center gap-1">
          {i > 0 && (or || sequence) && <span className="text-[11px] text-muted-foreground">{or ? '/' : 'then'}</span>}
          <kbd className="min-w-5 rounded border bg-muted px-1.5 text-center font-sans text-[11px] leading-5 font-medium text-foreground/80">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

/** The `?` cheat sheet. */
export function ShortcutsHelp({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Ticket keys act on the open ticket, or on the card your mouse is over.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title} className={g.items.length > 4 ? 'sm:row-span-2' : undefined}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{g.title}</h3>
              <ul className="flex flex-col">
                {g.items.map((a) => (
                  <li key={a.label} className="flex items-center justify-between gap-3 py-1 text-[13px]">
                    {a.label}
                    <Keys keys={a.keys} or={a.or} sequence={a.keys[0] === 'G'} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Version & update window opened from Ctrl+K -> "Show version". */
export function VersionDialog({ open, onOpenChange, auth, project }) {
  const [version, setVersion] = useState(pkg.version);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  const checkUpdates = async () => {
    if (!isDesktop) return;
    setChecking(true);
    try {
      const res = await api.checkUpdate();
      if (res?.currentVersion) setVersion(res.currentVersion);
      setUpdateInfo(res);
    } catch (e) {
      setUpdateInfo({ error: e?.message || String(e) });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    checkUpdates();
  }, [open]);

  const installUpdate = async () => {
    if (!updateInfo?.available || installing) return;
    setInstalling(true);
    const id = toast.loading(`Updating Tickets planner to v${updateInfo.version}…`, {
      description: 'Downloading signed release and restarting…',
    });
    try {
      await api.installUpdate();
    } catch (e) {
      setInstalling(false);
      toast.error(`Update to v${updateInfo.version} failed`, {
        id,
        description: e?.error || e?.message || String(e),
      });
    }
  };

  const copyVersion = async () => {
    const text = `Tickets planner v${version}`;
    await writeClipboard(text);
    setCopied(true);
    toast.success(`Copied "${text}"`);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="flex items-center gap-2">
              Tickets planner
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-secondary-foreground tabular-nums">
                v{version}
              </span>
            </DialogTitle>
          </div>
          <DialogDescription>Native Azure DevOps sprint &amp; hygiene planner.</DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-border/60 rounded-lg border bg-muted/30 px-3.5 py-1 text-xs">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="flex items-center gap-1.5 font-mono font-medium text-foreground tabular-nums">
              v{version}
              <button
                type="button"
                onClick={copyVersion}
                title="Copy version"
                aria-label="Copy version"
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {copied ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3" />}
              </button>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">Project</dt>
            <dd className="truncate font-medium text-foreground">{project || 'SAN SA'} · msasg</dd>
          </div>
          {auth?.user && (
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-muted-foreground">Signed in</dt>
              <dd className="truncate font-medium text-foreground">
                {auth.user} ({auth.method === 'device-code' ? 'Device code' : 'Azure CLI'})
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">Updates</dt>
            <dd className="flex items-center gap-1.5 text-right font-medium">
              {checking ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Checking…
                </span>
              ) : updateInfo?.available ? (
                <span className="text-primary">v{updateInfo.version} available</span>
              ) : updateInfo?.error ? (
                <span className="truncate text-destructive" title={updateInfo.error}>
                  Check failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <Check className="size-3" /> Up to date
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-end gap-2">
          {updateInfo?.available ? (
            <Button size="sm" onClick={installUpdate} disabled={installing}>
              {installing ? <Loader2 className="animate-spin" /> : <Download />}
              Install v{updateInfo.version}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={checkUpdates} disabled={checking || !isDesktop}>
              <RefreshCw className={checking ? 'animate-spin' : ''} />
              Check for updates
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
