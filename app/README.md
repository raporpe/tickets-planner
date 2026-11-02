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

- **Sprint planning** – Two areas: the Backlog as a one-card-wide list, and the next sprint (the earliest `SAN SA\Sprint` iteration that hasn't started) as a dotted whiteboard. On the whiteboard you drop a card anywhere, overlap or cluster cards to group them, and they stay where you left them (saved in this browser only, never in ADO); the grid icon ("Tidy up") forgets those positions. Double-click an empty spot on the whiteboard to write a floating note there (drag to move, double-click to edit, Esc or Ctrl+Enter to finish, empty it or press × to delete); notes belong to that sprint's board and are also stored only in this browser. The sprint in progress lives in a drawer at the bottom: click its handle to slide it up, drag tickets out to the Backlog or next sprint, Esc or click again to tuck it away. The sprint after that one sits in a drawer on the right: click its handle to slide it in, or drop a card straight onto the handle to push that ticket one sprint further. Other sprints or legacy iterations that still hold tickets also appear in the drawer. Dragging a card to another area changes its iteration; state and parent Feature change inline. Only Tasks and Bugs are shown and can go into a sprint; Stories (and Features) stay in `SAN SA\Sprint` and are managed from By Feature, and any found in a sprint are flagged under Needs attention.
- **By Feature** – my items grouped under their board Feature, with off-board Features flagged. The column badge on each Feature is a dropdown that moves it on the team's Features board; the Feature's state follows the column's mapping, and moving it to Shipped/Closed asks for confirmation.
- **Needs attention** – Stories or Features (that your work rolls up to) placed inside a sprint instead of `SAN SA\Sprint`, items without a board Feature, in legacy/past iterations, Stories whose children are all closed, or gone quiet (Tasks/Bugs with no change in ADO for 7+ days while started or in the sprint in progress). Items carried 4+ weeks are listed for context only and don't count toward the badge.

Click any ticket to open its detail panel. It shows the full hierarchy, from the top-most ancestor (Strategic Priority, Epic, …) down to the ticket and its direct children (open ones first); click any level to open it. From there you can change the state, Feature and sprint; edit the title, description, repro steps and acceptance criteria; and add comments or edit your own. Fields stored as Markdown in Azure DevOps are edited as Markdown, and HTML fields use a rich-text editor. If someone else changed the item since you opened it, the save is rejected and their version is shown. With the panel open, **E** edits the first text field and **J** / **K** step to the next / previous ticket on the page; closing or moving away with unsaved edits asks you to keep editing or discard first.

Hover a card or row while holding **Shift** to preview its parents, or **Ctrl** to preview its direct children, without opening the panel (hold both for the whole tree). Release the key to hide it.

Hover a card or row and press **C** to copy it as `#id Title [State]`, with the id linked to Azure DevOps (a real link when pasted into Teams or Outlook, a Markdown link in plain-text places such as AI chats). Long titles are shortened to about 80 characters.

The sun/moon button in the header switches between light and dark themes. The choice is remembered in the browser; until you pick one, the app follows the OS setting.

The app never creates iterations or changes team settings; it only edits work items you own.
