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
4. **Desktop app (`app/`) local install**: Whenever you make changes to the planner app (`app/`), always build the Tauri release installer (`npm run desktop:build`), install it locally (`Tickets planner_<version>_x64-setup.exe /S`), and reopen `C:\Users\raulpo\AppData\Local\Tickets planner\tickets-planner.exe` (via `Invoke-CimMethod -ClassName Win32_Process -MethodName Create` so it outlives the tool shell) so Raul can immediately test the changes.

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
| **Task** | Sprint Taskboard — `https://msasg.visualstudio.com/SAN%20SA/_sprints/taskboard/Bing%20Mobile%20Apps%20Team/SAN%20SA/Sprint/<current sprint>` | Tasks/Bugs in the current 2-week sprint iteration | The **real, concrete work** done in the sprint (daily stand-ups) |
| Backlog | [Stories backlog](https://msasg.visualstudio.com/SAN%20SA/_backlogs/backlog/Bing%20Mobile%20Apps%20Team/Stories) | All items under `SAN SA\Sprint` | Sprint planning |

Rules:

1. **Feature = big, ongoing initiative.** It must sit on the Features kanban (area under `SAN SA`, iteration under `SAN SA\Sprint`) in the column that matches reality (e.g. `Work in Progress` → In Development while its Tasks are active) and in a swimlane (Core Experience & Quality / Growth / Others). Never use cycle buckets (C2/C3/C4/C5 Work, IcM, OKR Epics) as the parent of real work.
2. **Task = real work.** Every piece of concrete work (PR, investigation, rollout, fix) is a **Task** (or Bug) that rolls up to a board Feature. A User Story in between is optional — use one only when it already exists or groups several Tasks meaningfully.
3. **Sprint visibility (2-week sprints since 2026-11-02).** Iterations live under `SAN SA\Sprint` (`Sprint\2026.01`, `Sprint\2026.02`, …); `SAN SA\Month` is retired. Never hardcode the sprint — resolve it live via `GET {org}/SAN%20SA/4271a5b2-919a-44ce-a87d-ef4c4d823a21/_apis/work/teamsettings/iterations?$timeframe=current&api-version=7.1`.
   - New backlog work → iteration `SAN SA\Sprint`.
   - Work being done this sprint (Active, or closed now) → current sprint iteration so it shows on the Taskboard. At sprint planning, move items to the upcoming sprint.
   - **Every Task needs both links:** a parent chain to a board Feature **and** a sprint iteration. Tasks created as Closed (work done this sprint) still go in the current sprint, not the `\Sprint` backlog. After creating Tasks, verify parent + iteration live.
   - **Only Tasks and Bugs go into sprints.** User Stories and Features always stay at iteration `SAN SA\Sprint` (never `Sprint\YYYY.NN`), whatever their state. They do not appear on the Taskboard — if a Story represents real work, create a child Task for it and sprint the Task.
4. **Tags on every new Story/Task.**
   - **Cycle & Platform (Mandatory)**: Tag with the current cycle (**`FY26 C5`** now; Microsoft fiscal year starts in July and cycles run by quarters) **and** the relevant **platform tag** (`iOS`, `Android`, `Backend`, `MiniApps`, …), plus topic tags. Keep the weekly tag (Monday date, `YYYYMMDD`) on Tasks worked that week as Raul's personal filter.
   - **Unplanned sprint work (`Sprint-Unplanned`)**: Add the **`Sprint-Unplanned`** tag to any ticket brought into an active sprint that *was not part of the original sprint plan* (bugs, priority changes, or extra work arising mid-sprint). In the planner app, this tag is controlled via the `Sprint-Unplanned` checkbox in the ticket detail panel and illuminates the card on the sprint board.
5. **No orphans.** Any open Task/Story/Bug whose parent chain does not reach a board Feature must be re-parented under the right Feature (or a new Feature proposed to the user).
6. **Keep Features honest.** When creating/activating Tasks, check the parent Feature's column; flag Features that are in New with active Tasks, or in progress with no open children.
7. **Default task owner.** Always assign Tasks created at Raul's request to `raulpo@microsoft.com`, unless he explicitly specifies a different owner. Do not leave them unassigned for team planning. Verify the saved assignment after creation.

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
