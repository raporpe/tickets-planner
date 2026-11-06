# Tickets planner

Lightweight desktop planner for Azure DevOps (`msasg` / `SAN SA`). Automatically self-updates on startup.

## Install

### Windows (x64)
1. Download **[Tickets-planner-setup-x64.exe](https://stticketsplanner9284.blob.core.windows.net/releases/Tickets-planner-setup-x64.exe)**
2. Run the installer (if Windows SmartScreen prompts on first install, click **More info → Run anyway**).

### macOS (Apple Silicon)
1. Download **[Tickets-planner-macos-arm64.dmg](https://stticketsplanner9284.blob.core.windows.net/releases/Tickets-planner-macos-arm64.dmg)**
2. Drag **Tickets planner.app** into **Applications**.
3. On first install only, clear the macOS quarantine attribute in Terminal:
   ```bash
   xattr -cr "/Applications/Tickets planner.app"
   ```

## Sign in
Sign in inside the app using your **Azure CLI** session (`az login`) or **Device Code** sign-in.