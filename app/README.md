# Tickets planner

Desktop and web UI for planning sprints over my Azure DevOps work items (`msasg` / `SAN SA`, Bing Mobile Apps Team).
React + Vite + shadcn/ui + Tailwind on the front. The Tauri 2 desktop app uses a native Rust backend via IPC: no Node runtime, Express process, or localhost server ships with it. The browser version retains its Express backend.

## Desktop (Windows and macOS)

Development prerequisites: Node.js 22.12+ (or 24+), Rust via [rustup](https://rustup.rs/), and native build tools. On Windows, install Visual Studio Build Tools with **Desktop development with C++**, including an MSVC compiler and Windows SDK. On macOS, run `xcode-select --install`. Open a new terminal after installing Rust so `cargo` is on your PATH. End users need none of these tools: the Windows installer installs WebView2 if necessary, and macOS uses the built-in WKWebView.

```powershell
cd app
npm ci
npm run desktop:dev     # Vite + the native app; no Express server
npm run desktop:test    # Rust tests
npm run desktop:build   # native release build + installer
```

Windows installers are in `src-tauri\target\release\bundle\nsis`; macOS produces an `.app` and `.dmg` in the corresponding `bundle` directories. Build each platform on its own OS. For Intel macOS cross-builds on Apple Silicon, install the target with `rustup target add x86_64-apple-darwin` and run `npm run desktop:build -- --target x86_64-apple-darwin`. The manual **Desktop build** GitHub Actions workflow builds Windows, Apple Silicon macOS, and Intel macOS installers, and uploads them as artifacts without publishing a release.

These development installers are unsigned. Public distribution requires a Windows code-signing certificate and an Apple Developer ID plus notarization credentials; configure those through Tauri's signing environment variables, never in the repository. Automatic updates are not enabled.

The native backend honors the same `ADO_ORG`, `ADO_PROJECT`, `ADO_TEAM_ID`, `ADO_SPRINT_ROOT`, and `AZURE_TENANT_ID` environment variables as the web backend. All Azure DevOps reads and writes go through Rust. External links open in the default browser; ticket references copy both HTML and plain text through the native clipboard. Authenticated attachment images are loaded through IPC, with original URLs restored before saving edited content.

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

Tokens, including device-code refresh tokens in the desktop app, stay in process memory only and disappear when the app exits. No ticket data is stored locally; Azure DevOps is the only source of truth. Device-code sign-in works without Azure CLI installed.

## Views

- **Sprint planning** – The Backlog is a rail on the left edge that slides out over the board while you hover it (or click it; Esc tucks it back), and dragging a card onto the rail opens it to drop there. The rest of the screen is the sprint in progress as a dotted whiteboard (the ‹ › arrows in its header step to earlier or later sprints, and "Back to current" returns). On the whiteboard you drop a card anywhere, overlap or cluster cards to group them, and they stay where you left them (saved in this browser only, never in ADO); the grid icon ("Tidy up") forgets those positions. The whiteboard keeps its size whatever the window width: when it doesn't fit, scroll sideways (Shift+wheel or trackpad) or drag any empty spot to pan around, and drop a card past the right edge to grow it. Double-click an empty spot on the whiteboard to write a floating note there (drag to move, double-click to edit, Esc or Ctrl+Enter to finish, empty it or press × to delete); notes belong to that sprint's board and are also stored only in this browser. The bottom drawer holds every other sprint or legacy iteration that still has tickets: click its handle to slide it up, drag tickets out to the Backlog or the whiteboard, Esc or click again to tuck it away. The sprint after the whiteboard's sits in a drawer on the right: click its handle to slide it in, or drop a card straight onto the handle to push that ticket one sprint further. Dragging a card to another area changes its iteration; state and parent Feature change inline. Closed tickets in the current and upcoming sprints are always shown (whatever their closing date and the show-closed toggle), so each sprint shows everything done in it. Only Tasks and Bugs are shown and can go into a sprint; Stories (and Features) stay in `SAN SA\Sprint` and are managed from By Feature, and any found in a sprint are flagged under Needs attention.
- **By Feature** – my items grouped under their board Feature, with off-board Features flagged. The column badge on each Feature is a dropdown that moves it on the team's Features board; the Feature's state follows the column's mapping, and moving it to Shipped/Closed asks for confirmation.
- **Needs attention** – Stories or Features (that your work rolls up to) placed inside a sprint instead of `SAN SA\Sprint`, items without a board Feature, in legacy/past iterations, Stories whose children are all closed, or gone quiet (Tasks/Bugs with no change in ADO for 7+ days while started or in the sprint in progress). Items carried 4+ weeks are listed for context only and don't count toward the badge.

Click any ticket to open its detail panel. It shows the full hierarchy, from the top-most ancestor (Strategic Priority, Epic, …) down to the ticket and its direct children (open ones first); click any level to open it. From there you can change the state, Feature and sprint; edit the title, description, repro steps and acceptance criteria; and add comments or edit your own. The **Pull requests** section lists linked Azure Repos PRs with their status (active, draft, merged, abandoned), repo and target branch; paste a PR URL or number into the field under the heading and press Enter to link it in Azure DevOps (errors such as an already-linked PR show under the field; Esc clears it), and hovering a PR shows an unlink button (with Undo). Fields stored as Markdown in Azure DevOps are edited as Markdown, and HTML fields use a rich-text editor. If someone else changed the item since you opened it, the save is rejected and their version is shown. With the panel open, **E** edits the first text field and **J** / **K** step to the next / previous ticket on the page; closing or moving away with unsaved edits asks you to keep editing or discard first.

Hover a card or row while holding **Shift** to preview its parents, or **Ctrl** to preview its direct children, without opening the panel (hold both for the whole tree). Release the key to hide it.

Hover a card or row and press **C** to copy it as `#id Title [State]`, with the id linked to Azure DevOps (a real link when pasted into Teams or Outlook, a Markdown link in plain-text places such as AI chats). Long titles are shortened to about 80 characters.

Press **Ctrl+K** (**⌘K** on Mac) to search your tickets and Features by title words, by id, or by pasting an Azure DevOps link; Enter opens the detail panel. An id or link for a ticket that isn't in the planner can still be opened straight from ADO. Opened while a ticket is open or hovered, the palette also lists every action for that ticket, plus navigation, view toggles (filter, show or hide closed tickets) and the shortcut list.

The filter field sits in the header next to the tabs; while a filter or closed tickets are on, it shows how many tickets match. Closed tickets are hidden by default; when shown, an **Incl. closed** chip appears beside the filter (click it to hide them again). The last sync time is on the Refresh button's tooltip.

## Keyboard shortcuts

Linear-style: single keys act on the open ticket, or on the card or row under the mouse. Keys that need the detail panel (P, M, E, or Shift+C on a card) open the ticket first and then run. Press **?** for the full list.

| Key | Action |
| --- | --- |
| S | Change state |
| Shift+C | Change sprint |
| F | Change Feature |
| P | Link a pull request (focuses the paste field) |
| M | Add a comment |
| E | Edit the description |
| O | Open in Azure DevOps |
| C | Copy link, title and state |
| J / K | Next / previous ticket (detail panel open) |
| G then S / F / A | Go to Sprint planning / By Feature / Needs attention |
| / | Filter tickets (Esc clears, then leaves the field) |
| Shift+D | Show or hide tickets closed in the last 21 days |
| Ctrl+K | Find a ticket or run an action |
| ? | Keyboard shortcuts |

The sun/moon button in the header switches between light and dark themes. The choice is remembered in the browser; until you pick one, the app follows the OS setting.

The app never creates iterations or changes team settings; it only edits work items you own.
