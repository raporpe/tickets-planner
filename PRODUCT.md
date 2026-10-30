# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One engineer (Raul, Sapphire engineering, Bing Mobile Apps Team) who owns and grooms his own Azure DevOps work items. He uses the planner at his desk, many times a day, to triage, re-parent, tag and schedule tickets into sprints, and to check that closed work is correctly classified on the team kanban.

## Product Purpose
A local planner over Azure DevOps (org msasg, project SAN SA) that makes sprint planning and ticket hygiene fast: drag tickets into sprints, see each ticket's place in the Epic › Feature › Story › Task hierarchy, spot items needing attention, and edit details without the ADO web UI's friction. Success: planning and classification take minutes and nothing drifts off the kanban unclassified.

## Positioning
A personal, hierarchy-first lens on ADO. Every ticket is shown in relation to its parents and children, which the stock ADO boards hide.

## Operating Context
Runs locally (Express + Vite build on 127.0.0.1:5174) with Azure CLI sign-in, viewed in Edge on a desktop monitor. Used alongside the ADO web UI, Teams and the team's ticket methodology in instructions.md (weekly tags, platform/domain tags, Feature parenting, monthly iterations).

## Capabilities and Constraints
- ADO is the only source of truth; no local ticket data.
- Never create sprints, iterations or areas, and never change team settings.
- Views: Sprint planning (Backlog + sprint columns), By Feature, Needs attention; a detail panel with hierarchy, metadata, rich-text description and comments; Shift-hover previews parents, Ctrl-hover previews children.
- Terminology follows ADO: Epic, Feature, Story, Task, Bug, iteration, area, tags, states (New, Active, Closed, …).
- React + Vite + shadcn/ui + Tailwind v4.

## Evidence on Hand
Live ADO data only. No screenshots, testimonials or brand assets exist; do not fabricate any.

## Product Principles
1. ADO stays authoritative: show what is true, and make every write explicit.
2. Hierarchy is context: a ticket is always understood through its parents and children.
3. Dense but calm: many tickets at a glance without visual noise.
4. Low maintenance over cleverness: features must be cheap to keep.

## Accessibility & Inclusion
No product-specific requirement established; follow WCAG AA contrast and keyboard reachability as a baseline.
