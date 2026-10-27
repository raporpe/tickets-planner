# Ticket Manager Instructions

**READ THIS FIRST ON EVERY SESSION.**

## Quick Context

- **Azure DevOps Org**: `https://msasg.visualstudio.com`
- **CLI Guide**: `memory/azure-devops-cli-guide.md`
- **Session Context**: `memory/context.md` (stable config + conventions only)

## Source of Truth (MANDATORY)

**The Azure DevOps API is the only source of truth for tickets.** Never cache or store ticket data locally — no work item IDs/titles lists, hierarchies, parents, states, iterations, tags, board columns, owners, or action logs of ticket changes. It always goes stale. Before any decision (duplicates, parent, state, board placement), query the API live (WIQL, `az boards`, `az rest`).

Memory may only contain stable, non-ticket knowledge: org/project/team/board identifiers, conventions, methodology, and tooling learnings.

## Data Sync (MANDATORY)

**Your knowledge base is backed by the git repo `raulpo_microsoft/tickets`. Keep it synced on every session:**

1. **ALWAYS pull first**: At the start of every session—and before reading or editing any memory file—run `git pull` to get the latest data. Never work from stale local state.
2. **ALWAYS commit and push after any change**: Whenever you add, update, or remove data (memory files, instructions, guides, etc.), immediately `git add`, `git commit`, and `git push`. Data must never be left uncommitted.
3. **Keep it atomic**: Commit and push as soon as a unit of work is done so the remote is always the source of truth.

```bash
git pull                          # before doing anything
# ... make changes ...
git add -A && git commit -m "..." && git push
```

## Board Methodology (MANDATORY)

Two boards, two purposes. Every ticket must be visible on both levels.

| Level | Board | Shows | Purpose |
|---|---|---|---|
| **Feature** | Features kanban — https://aka.ms/sa-kanban (Bing Mobile Apps Team → Features) | Feature cards only | Visibility of the **big ongoing initiatives** the team is working on |
| **Task** | Weekly Taskboard — [2026.03 Taskboard](https://msasg.visualstudio.com/SAN%20SA/_sprints/taskboard/Bing%20Mobile%20Apps%20Team/SAN%20SA/Month/2026.03) | Tasks/Bugs in the current iteration, filtered by weekly tag | The **real, concrete work** done each week |

Rules:

1. **Feature = big, ongoing initiative.** It must sit on the Features kanban (area under `SAN SA`, iteration under `SAN SA\Month`) in the column that matches reality (e.g. `Work in Progress` → In Development while its Tasks are active) and in a swimlane (Core Experience & Quality / Growth / Others). Never use cycle buckets (C2/C3/C4/C5 Work, IcM, OKR Epics) as the parent of real work.
2. **Task = real work.** Every piece of concrete work (PR, investigation, rollout, fix) is a **Task** (or Bug) that rolls up to a board Feature. A User Story in between is optional — use one only when it already exists or groups several Tasks meaningfully.
3. **Weekly visibility.** Active Tasks go in the current iteration (`SAN SA\Month\2026.03`) with the current weekly tag (Monday date, `YYYYMMDD`) so they appear on the weekly Taskboard. User Stories and Features do **not** appear on the Taskboard — if a Story represents real work, create a child Task for it.
4. **No orphans.** Any open Task/Story/Bug whose parent chain does not reach a board Feature must be re-parented under the right Feature (or a new Feature proposed to the user).
5. **Keep Features honest.** When creating/activating Tasks, check the parent Feature's column; flag Features that are in New with active Tasks, or in progress with no open children.

## Core Directive

**You are a living system.** The `memory/` folder is your persistent knowledge base. You MUST:

### Before Creating Any Ticket

**ALWAYS analyze the tree structure first:**

1. **Query the parent epic/feature** to get all children (use `relation` query)
2. **Fetch details of all child work items** to understand existing structure
3. **Look for similar or related tickets** that the new work item should link to
4. **Identify the correct parent** by understanding the hierarchy and purpose of each branch
5. **Add Related links** to sibling tasks that share context (use `--relation-type Related`)

This prevents duplicate work, ensures proper categorization, and maintains a connected knowledge graph of work items.

1. **On session start**: Use the Quick Context above. Only read memory files when needed for a specific task.

2. **Learn only stable knowledge**: Record new conventions, team/board configuration, methodology changes, and tooling learnings in `memory/context.md`. **Do not** record work items or ticket changes (see Source of Truth).

3. **Keep knowledge files clean**: Remove outdated info, consolidate duplicates, and **commit and push** all changes (see Data Sync above).

4. **Use memory for configuration, the API for tickets**: Use memory for org/project/team/board IDs and conventions; find existing and related work items by querying the API.

## Purpose

Use this space to store:
- Ticket templates
- Workflow instructions
- Project-specific guidelines
- Any other documentation for ticket management

## Usage

Run the `opencode` command from anywhere to launch Copilot in this folder with all markdown files as context.

## Memory

The `memory/` folder contains knowledge files for ticket management. Store relevant documentation, guides, and context there.

- [Azure DevOps CLI Guide](memory/azure-devops-cli-guide.md)
