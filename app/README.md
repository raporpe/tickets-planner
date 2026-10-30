# Tickets planner

Local web UI for planning sprints over my Azure DevOps work items (`msasg` / `SAN SA`, Bing Mobile Apps Team).
React + Vite + shadcn/ui + Tailwind on the front, a small Express proxy on the back.

## Run

```powershell
cd app
npm install
npm start          # build + serve on http://127.0.0.1:5174
# or, while developing:
npm run dev        # Vite on http://127.0.0.1:5173 (proxies /api to the server)
```

## Sign-in (no app registration)

- **Azure CLI** – if `az login` is done, the app signs in automatically with that account.
- **Device code** – otherwise, click *Sign in with device code*, open the URL and enter the code.
  Uses the Azure CLI public client, so no Entra app registration is needed.
  Set `AZURE_TENANT_ID` to force a tenant (defaults to `organizations`).

Tokens stay in the server process memory. No ticket data is stored locally; Azure DevOps is the only source of truth.

## Views

- **Sprint planning** – Backlog and one column per `SAN SA\Sprint` iteration. Drag cards between columns to change the iteration; change state and parent Feature inline.
- **By Feature** – my items grouped under their board Feature, with off-board Features flagged. The column badge on each Feature is a dropdown that moves it on the team's Features board; the Feature's state follows the column's mapping, and moving it to Shipped/Closed asks for confirmation.
- **Needs attention** – items without a board Feature, in legacy/past iterations, active but unplanned, Stories whose children are all closed, or carried 4+ weeks.

Click any ticket to open its detail panel. It shows the full hierarchy, from the top-most ancestor (Strategic Priority, Epic, …) down to the ticket; click any level to open it. From there you can change the state, Feature and sprint; edit the title, description, repro steps and acceptance criteria; and add comments or edit your own. Fields stored as Markdown in Azure DevOps are edited as Markdown, and HTML fields use a rich-text editor. If someone else changed the item since you opened it, the save is rejected and their version is shown.

Hold **Ctrl** while hovering a card or row to preview its hierarchy without opening the panel. Release Ctrl to hide it.

## Assistant

The **Assistant** button (or **Ask assistant** in a ticket's detail) opens a chat side panel backed by the [GitHub Copilot SDK](https://github.com/github/copilot-sdk), using your Copilot subscription. The agent loop runs on the Express server (`server/agent.js`). You need to be signed in to Copilot CLI, or have `gh auth login` done with an account that has Copilot. Set `AGENT_MODEL` to choose the model (default `claude-sonnet-4.5`).

The agent reads Azure DevOps live and follows the methodology in `../instructions.md`. Its tools:

- `get_item`, `get_tree`, `search_items`, `list_my_items`, `list_features`, `list_sprints` – read-only.
- `propose_changes` – returns a proposal: create Tasks, Bugs, Stories or Features; update title, description, acceptance criteria, repro steps, priority, state, sprint, parent or tags; add a comment; or move a Feature's board column.

Nothing is written when the agent proposes. The proposal appears as a card where you can untick changes and rename new items. **Apply** re-validates it on the server and only then writes to Azure DevOps; **Discard** drops it. The agent is told what was applied or discarded.

It cannot delete items, create sprints, iterations or areas, change team settings, assign work to others, or edit or delete existing comments. Sprints must already exist.

The app never creates iterations or changes team settings; it only edits work items you own.
