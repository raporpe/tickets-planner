# Tickets planner

Desktop and web UI for planning sprints over my Azure DevOps work items (`msasg` / `SAN SA`, Bing Mobile Apps Team).
React + Vite + shadcn/ui + Tailwind on the front. The Tauri 2 desktop app uses a native Rust backend via IPC: no Node runtime, Express process, or localhost server ships with it. The browser version retains its Express backend.

## Desktop (Windows and macOS)

Download Windows installers from [GitHub Releases](https://github.com/raulpo_microsoft/tickets/releases). Choose the Windows x64 `.exe` asset, not the source-code ZIP. Installers are currently unsigned; obtain them only from this repository's releases. End users do not need Node.js, Rust, build tools, or Azure CLI: WebView2 is installed automatically if necessary, and device-code sign-in works without Azure CLI.

Build guides: [Windows 10/11](#windows-1011-x64-and-arm64) · [macOS 11 and later](#macos-11-intel-apple-silicon-and-universal) · [Manual publishing](#publish-binaries-manually).

### OS versions and build targets

| Operating system | Architecture | Build target | Status |
| --- | --- | --- | --- |
| Windows 10 or 11 | Intel/AMD 64-bit | `x86_64-pc-windows-msvc` | Installer built and run on Windows 11; not separately tested on Windows 10 |
| Windows 10 or 11 on ARM | ARM64 | `aarch64-pc-windows-msvc` | Build recipe below; not built or verified |
| macOS 11 Big Sur or later | Intel | `x86_64-apple-darwin` | Configured; not built or verified |
| macOS 11 Big Sur or later | Apple Silicon | `aarch64-apple-darwin` | Configured; not built or verified |
| macOS 11 Big Sur or later | Intel + Apple Silicon | `universal-apple-darwin` | Optional combined build; not built or verified |

You do not need a different installer for every Windows or macOS release. Choose the CPU architecture; Windows 10 and 11 use the same target, and the macOS deployment minimum is `11.0` in `src-tauri/tauri.conf.json`. Keep OS and browser-engine updates current; the macOS UI needs a modern system WebKit (Safari 16.4 or newer for Tailwind CSS 4). The configured minimum is not a claim that every macOS version has been tested.

Windows 7/8/8.1, macOS older than 11, Windows 32-bit, and Linux are not supported release targets for this app.

### Build prerequisites

Install Node.js 22.12+ (or 24+) and the current stable Rust toolchain using [rustup](https://rustup.rs/).

On **Windows**, install Visual Studio 2022 Build Tools and select **Desktop development with C++**, including the MSVC x64/x86 compiler and a Windows SDK. WebView2 Runtime must also be installed to run the app during development.

On **macOS**, install Xcode command-line tools:

```sh
xcode-select --install
```

Open a new terminal after installing Rust so `cargo` is on your PATH. Check that `node --version`, `npm --version`, `rustc --version`, and `cargo --version` work before building.

### Build and run locally

Clone this repository, then run these commands from its root on either OS:

```powershell
cd app
npm ci
npm run desktop:test    # Rust tests
npm run desktop:build   # native release build + installer
```

The first native build downloads Rust dependencies and can take several minutes. The optimized release build embeds the frontend into the executable; it does not require a running Vite or Express server.

For live development, run `npm run desktop:dev` from `app`. It starts Vite and the native window together, without Express. Exit the command to stop development. Use `npm run dev` only for the browser version.

### Windows 10/11: x64 and ARM64

Run these commands in PowerShell from `app`, after installing the prerequisites above. The x64 recipe is the normal build for Intel/AMD PCs on either Windows 10 or Windows 11:

```powershell
rustup target add x86_64-pc-windows-msvc
npm ci
npm run desktop:test
npm run desktop:build -- --target x86_64-pc-windows-msvc
```

Explicit-target output is in `src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis`. If you instead run `npm run desktop:build` on an x64 PC, the default output is:

```text
src-tauri\target\release\tickets-planner.exe
src-tauri\target\release\bundle\nsis\Tickets planner_<version>_x64-setup.exe
```

Run the setup executable to install the app. The first executable can also run directly without installation.

For Windows on ARM, also install the **MSVC ARM64 build tools** in Visual Studio Build Tools. You can build this target on a Windows x64 or ARM64 build machine:

```powershell
rustup target add aarch64-pc-windows-msvc
npm ci
npm run desktop:build -- --target aarch64-pc-windows-msvc
```

Find the ARM64 installer in `src-tauri\target\aarch64-pc-windows-msvc\release\bundle\nsis`. Check it on an actual Windows ARM64 device before distributing it; an x64 test run does not verify ARM64 behavior.

### macOS 11+: Intel, Apple Silicon, and universal

Run these commands in Terminal on a Mac, from `app`, after installing Node.js, stable Rust, and Xcode command-line tools:

```sh
npm ci
npm run desktop:test
```

The default `npm run desktop:build` uses the Mac's own architecture. To choose an architecture explicitly, run one of these pairs:

```sh
# Apple Silicon
rustup target add aarch64-apple-darwin
npm run desktop:build -- --target aarch64-apple-darwin

# Intel
rustup target add x86_64-apple-darwin
npm run desktop:build -- --target x86_64-apple-darwin
```

For one app containing both Intel and Apple Silicon executables, install both Rust targets and let Tauri combine them:

```sh
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npm run desktop:build -- --target universal-apple-darwin
```

`universal-apple-darwin` is a Tauri build target, not a Rust toolchain target: do not pass it to `rustup target add`.

Without `--target`, macOS output is:

```text
src-tauri/target/release/bundle/macos/Tickets planner.app
src-tauri/target/release/bundle/dmg/*.dmg
```

With an explicit target, output moves to `src-tauri/target/<target>/release/bundle/`, including `universal-apple-darwin` for the combined build. The `.dmg` contains the app to copy into Applications. Build macOS packages on macOS; the Windows build cannot produce a macOS installer. Check each architecture on a matching Mac before distributing it. Mac installers have not yet been built or verified for this release.

These development installers are unsigned. Public distribution requires a Windows code-signing certificate and an Apple Developer ID plus notarization credentials; configure those through Tauri's signing environment variables, never in the repository. Automatic updates are not enabled.

The native backend honors the same `ADO_ORG`, `ADO_PROJECT`, `ADO_TEAM_ID`, `ADO_SPRINT_ROOT`, and `AZURE_TENANT_ID` environment variables as the web backend. All Azure DevOps reads and writes go through Rust. External links open in the default browser; ticket references copy both HTML and plain text through the native clipboard. Authenticated attachment images are loaded through IPC, with original URLs restored before saving edited content.

### Publish binaries manually

GitHub-hosted runners are disabled for this repository, so releases are currently built locally and uploaded manually. The **Desktop build** workflow is available for Windows and both Mac architectures if an administrator enables hosted runners later; it uploads build artifacts but does not publish a release.

1. For a new version, keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` aligned. `npm version <version> --no-git-tag-version` updates the npm manifests; update the Rust package and Tauri versions, then run `cargo check --manifest-path src-tauri/Cargo.toml` to refresh the Rust lockfile. Commit and push the source changes.
2. From that clean source revision, run `npm ci`, `npm run desktop:test`, and `npm run desktop:build` on the target OS. Open the built app and confirm that sign-in, the sprint board, and ticket details load without modifying real work items.
3. In [GitHub Releases](https://github.com/raulpo_microsoft/tickets/releases), create a draft release with tag `v<version>` targeting the exact source commit used for the build. Upload the Windows setup `.exe` from the `nsis` directory; upload Mac `.dmg` files only after building and checking them on macOS. Do not commit binaries or `target` directories to Git.
4. Include the source commit, supported architecture, signing status, and installer SHA-256 in the release notes. Check that each uploaded file matches the local build before publishing the draft. Publish it as the latest release when it is ready; no workflow or automatic updater is required.

Compute the Windows checksum in PowerShell from `app`:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = ".\src-tauri\target\release\bundle\nsis\Tickets planner_${version}_x64-setup.exe"
Get-FileHash -Algorithm SHA256 -LiteralPath $installer
```

On macOS, use `shasum -a 256` with the path to the built `.dmg`.

Alternatively, upload the Windows installer with the GitHub CLI after signing in to **github.com** with access to this repository. From `app`, with the PowerShell variables above:

```powershell
$tag = "v$version"
$commit = git rev-parse HEAD
gh release create $tag "$installer#Windows x64 installer" --repo https://github.com/raulpo_microsoft/tickets --target $commit --title "Tickets planner $version" --draft --notes "Windows x64. Unsigned local build. Source: $commit"
# Add the checksum to the draft notes and verify the uploaded asset before publishing.
gh release edit $tag --repo https://github.com/raulpo_microsoft/tickets --draft=false --latest
```

If the release already exists, use `gh release upload $tag "$installer" --repo https://github.com/raulpo_microsoft/tickets` instead of creating it again. Do not overwrite an existing published asset with a different build under the same version.

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
