export const PRIORITIES = [
  {
    value: 0,
    label: 'P0',
    hint: 'Blocker',
    rule: 'App unusable or core journey down at broad scale with no workaround; or safety, privacy, or store-removal risk.',
    sla: 'Immediate hotfix / rollback',
  },
  {
    value: 1,
    label: 'P1',
    hint: 'Major',
    rule: 'Important feature broken for a meaningful subset (market, OS, device family), or core journey impaired with a workaround.',
    sla: 'Hotfix or next release',
  },
  {
    value: 2,
    label: 'P2',
    hint: 'Moderate',
    rule: 'Default for everyday bugs: non-critical feature degraded or inconvenient, task still completable via retry or workaround.',
    sla: 'Next scheduled release',
  },
  {
    value: 3,
    label: 'P3',
    hint: 'Minor',
    rule: 'Small, localized, or low-frequency annoyance with negligible functional impact; most users will not notice.',
    sla: 'Scheduled release',
  },
  {
    value: 4,
    label: 'P4',
    hint: 'Trivial',
    rule: 'Cosmetic or editorial only (spacing, alignment, wording) with no functional, privacy, accessibility, or data impact.',
    sla: 'Routine / may defer',
  },
];

const PRIORITY_TONE = {
  0: 'bg-rose-100 text-rose-900 ring-rose-300 dark:bg-rose-400/20 dark:text-rose-200 dark:ring-rose-400/35',
  1: 'bg-orange-50 text-orange-800 ring-orange-200/80 dark:bg-orange-300/10 dark:text-orange-200 dark:ring-orange-300/25',
  2: 'bg-amber-50 text-amber-800 ring-amber-200/80 dark:bg-amber-300/10 dark:text-amber-200 dark:ring-amber-300/25',
  3: 'bg-muted text-muted-foreground ring-border',
  4: 'bg-muted/70 text-muted-foreground/80 ring-border/80',
};

export const priorityTone = (p) => PRIORITY_TONE[p] || PRIORITY_TONE[3];
