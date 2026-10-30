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
- **By Feature** – my items grouped under their board Feature, with off-board Features flagged.
- **Needs attention** – items without a board Feature, in legacy/past iterations, active but unplanned, Stories whose children are all closed, or carried 4+ weeks.
- **Prepare next sprint** – creates the next 2-week `SAN SA\Sprint\YYYY.NN` iteration and subscribes the team to it.
