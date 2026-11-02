import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUT_GROUPS } from '@/lib/shortcuts';

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
