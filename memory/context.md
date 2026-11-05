# Session Context

> **No ticket data here.** Work items, their state, hierarchy, iteration, tags, board column and owners are **never** cached locally — they go stale immediately. Always query the Azure DevOps API (`az boards`, `az rest`, WIQL) as the single source of truth. This file only holds stable configuration and conventions.

## Environment

| Item | Value |
|---|---|
| Organization | `https://msasg.visualstudio.com` (also `https://dev.azure.com/msasg`) |
| Project | `SAN SA` — id `2579b442-0817-40f1-8ec8-19e6fb5794c6` |
| Team | Bing Mobile Apps Team — id `4271a5b2-919a-44ce-a87d-ef4c4d823a21`; area `SAN SA` incl. children; backlog iteration `SAN SA\Sprint` (2-week sprints since 2026-11-02; `SAN SA\Month` retired) |
| Features kanban | https://aka.ms/sa-kanban — board id `01c36bdd-9c27-4a78-92c2-3e4e28bc2967`; column field `WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Column`, lane field `WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Lane` |
| Sprint Taskboard | `https://msasg.visualstudio.com/SAN%20SA/_sprints/taskboard/Bing%20Mobile%20Apps%20Team/SAN%20SA/Sprint/<current sprint>` (Tasks/Bugs in current sprint only) |
| Stories backlog | https://msasg.visualstudio.com/SAN%20SA/_backlogs/backlog/Bing%20Mobile%20Apps%20Team/Stories |
| Bing_UX project (snrcode PRs) | id `24a0501b-d131-45af-ae52-27db9291efd4`; snrcode repo id `5fbd578a-41e8-4701-bf6e-9c14f61d77a6` |
| Azure DevOps AAD resource | `499b84ac-1321-427f-aa17-267ca6975798` |
| Me | `raulpo@microsoft.com` |

## Conventions

- **Board methodology**: see `instructions.md` → Board Methodology. Feature (Features kanban) = big ongoing initiative; Task/Bug (weekly Taskboard) = real work; every Task rolls up to a board Feature.
- **Iterations**: new work → `SAN SA\Sprint`; work done this sprint → current sprint (`SAN SA\Sprint\YYYY.NN`). Resolve the current sprint live: `GET .../4271a5b2-919a-44ce-a87d-ef4c4d823a21/_apis/work/teamsettings/iterations?$timeframe=current&api-version=7.1`. Never hardcode it.
- **Required tags**:
  1. Current cycle (`FY26 C5` now; Microsoft FY starts in July, cycles are quarterly) + platform (`iOS` / `Android` / `Backend` / `MiniApps` …) + topic tags.
  2. **`Sprint-Unplanned`**: Add to any ticket brought into an active sprint that was not part of the original sprint plan (bugs, priority changes, surprise mid-sprint work). Controlled via a dedicated checkbox in the planner's ticket detail panel and highlighted on the sprint board.
- **Weekly tag** (Raul's personal filter): Monday date of the current week as `YYYYMMDD`. Add it to Tasks worked on that week; keep previous weeks' tags.
- **Features board columns → state**: New→New; Backlog of ideas / Product & Design / Ready for development→Active; In Development→Work in Progress; QA/Testing→Testing; Ready to flight→Resolved; Flighting→Flighting; Shipped/Closed→Closed. Lanes: Core Experience & Quality, Growth, Others.
- **Area for Raul's work**: `SAN SA\Scaffolding\Fundamental`.

## Key Learnings

- **Identity resolution**: Use `raulpo@microsoft.com` in AssignedTo fields. Display name search fails.
- **Task creation**: SAN SA Tasks must be created as `New`, then updated to `Active` in a second call. Setting `Closed` auto-sets reason `Completed`.
- **Azure Repos PRs**: Use a native PR association (`az repos pr work-item add --id <pr> --work-items <id> --org https://dev.azure.com/msasg`), not a hyperlink, so the PR's Work Items section shows the ticket. Cross-project works from SAN SA to Bing_UX.
- **Duplicate search**: Broad WIQL `CONTAINS` queries over the whole project time out (VS402335); scope by `[System.AssignedTo]` and `[System.ChangedDate] >= @Today-90`.
- **REST tag updates**: When updating `System.Tags` via `az rest` PATCH, use `op="replace"` — `op="add"` (and `az boards work-item update --fields "System.Tags=..."`) silently no-ops when tags already exist. Build the URI as a variable (`$org + "/_apis/wit/workitems/" + $id + "?api-version=7.1"`). **`az rest` needs `--resource 499b84ac-1321-427f-aa17-267ca6975798`** or it fails with TF400813. Pass JSON-patch bodies via a temp file (`--body @path`).
- **Azure DevOps MCP** may fail with OAuth 401; fall back to the `az` CLI / REST.
- **Python** is not installed on this machine (Store stub only); use Node.js for scripts.
- **Desktop app (`app/`) updates — local beta-test before production release**:
  1. After any code change to `app/`, always build and install locally **first** (`npm run desktop:build`, silent NSIS `/S` install to `C:\Users\raulpo\AppData\Local\Tickets planner\tickets-planner.exe`, and relaunch via `Win32_Process.Create`) so Raul can beta-test the change locally.
  2. **Do not** push or trigger a production release on `raporpe/tickets-planner` until Raul has verified the local build and asks to release it.
