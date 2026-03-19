# Skillshare App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the PackageFlow/SpecForge Tauri app into Skillshare App — a native desktop GUI that wraps the Skillshare CLI and its web UI.

**Architecture:** Tauri 2 desktop shell (Rust backend) manages a `skillshare` CLI binary (auto-downloaded Go binary) and its HTTP server. The React frontend is forked from `skillshare/ui` (22 pages, clean mode). Desktop-only features (onboarding, multi-project, tray, notifications) are added on top via Tauri IPC.

**Tech Stack:** Tauri 2, React 19, TypeScript 5.9, Tailwind CSS 4, TanStack Query 5, React Router 7, Rust (tokio, reqwest, serde)

**Spec:** `docs/superpowers/specs/2026-03-20-skillshare-app-design.md`

---

## File Map

### Rust Backend (src-tauri/src/)

| File | Responsibility |
|------|---------------|
| `main.rs` | Entry point (keep, minimal changes) |
| `lib.rs` | Tauri app init, plugin registration, managed state — **REWRITE** |
| `commands/mod.rs` | Command module exports |
| `commands/cli.rs` | `download_cli`, `get_cli_version`, `upgrade_cli`, `exec_cli`, `detect_cli` |
| `commands/project.rs` | `list_projects`, `add_project`, `remove_project`, `switch_project`, `get_active_project` |
| `commands/server.rs` | `start_server`, `stop_server`, `restart_server`, `health_check` |
| `commands/app.rs` | `get_app_state`, `get_onboarding_status`, `complete_onboarding` |
| `services/mod.rs` | Service module exports |
| `services/cli_manager.rs` | CLI binary lifecycle: detect, download, verify, execute, upgrade |
| `services/server_manager.rs` | Go HTTP server lifecycle: start, stop, restart, health poll |
| `services/project_store.rs` | `projects.json` CRUD |
| `models/mod.rs` | Model module exports |
| `models/project.rs` | `Project`, `ProjectType`, `ProjectStore` structs |
| `models/app_state.rs` | `AppState`, `CliMeta`, `OnboardingStatus` structs |

### React Frontend (src/)

Copied from `skillshare/ui/src/` — all existing files are unchanged unless noted.

| File | Responsibility |
|------|---------------|
| `main.tsx` | **MODIFY** — add `@tauri-apps/api` init |
| `App.tsx` | **MODIFY** — add onboarding route + TauriProvider context |
| `desktop/api/tauri-bridge.ts` | Tauri `invoke()` wrapper for all IPC calls |
| `desktop/context/TauriContext.tsx` | Provides CLI status, active project, server status to React tree |
| `desktop/pages/OnboardingPage.tsx` | 3-step onboarding wizard |
| `desktop/components/OnboardingSteps/WelcomeStep.tsx` | Step 1: welcome + CLI download |
| `desktop/components/OnboardingSteps/ProjectSetupStep.tsx` | Step 2: global/project mode init |
| `desktop/components/OnboardingSteps/FirstSyncStep.tsx` | Step 3: first sync + done |
| `desktop/components/ProjectSwitcher.tsx` | Sidebar dropdown for switching projects |
| `desktop/components/ProjectCard.tsx` | Card showing project stats in dashboard |
| `desktop/components/SwitchOverlay.tsx` | Full-screen spinner during project switch |
| `desktop/hooks/useCliManager.ts` | Hook for CLI status/download/upgrade |
| `desktop/hooks/useProjects.ts` | Hook for project CRUD + switching |
| `desktop/hooks/useServerStatus.ts` | Hook for Go server health |
| `components/Layout.tsx` | **MODIFY** — add ProjectSwitcher + ALL PROJECTS section |
| `pages/DashboardPage.tsx` | **MODIFY** — add cross-project overview section |

### Config Files

| File | Action |
|------|--------|
| `src-tauri/tauri.conf.json` | **REWRITE** — Skillshare App identity |
| `src-tauri/Cargo.toml` | **REWRITE** — strip SpecForge deps |
| `src-tauri/capabilities/default.json` | **REWRITE** — Skillshare permissions |
| `package.json` | **REWRITE** — Skillshare UI deps |
| `vite.config.ts` | **REWRITE** — merge Tauri + Skillshare configs |
| `tsconfig.json` | **REPLACE** — from Skillshare UI |
| `tailwind.config.js` | **DELETE** — Tailwind 4 uses CSS config |

### Delete

```
crates/                           # entire directory
src-tauri/src/commands/*          # all SpecForge commands
src-tauri/src/services/*          # all SpecForge services
src-tauri/src/repositories/       # entire directory
src-tauri/src/models/*            # all SpecForge models
src/                              # entire current frontend
ai_docs/                          # SpecForge AI docs
.specforge/                       # SpecForge's own specs
scripts/                          # SpecForge build scripts (evaluate before deleting)
```

### Notes

- **Cargo.lock**: Root `Cargo.lock` will be stale after workspace removal. Delete it; `cargo check` in `src-tauri/` regenerates it.
- **build.rs**: `src-tauri/build.rs` must contain `tauri_build::build()` — verify it has no SpecForge-specific logic.
- **index.html**: Root `index.html` needs title/meta update from SpecForge to Skillshare App.
- **App icons**: `src-tauri/icons/` still has SpecForge icons — replace with Skillshare icons (deferred, can use placeholders).
- **Task 2 build**: The imported Skillshare UI source does NOT import `@tauri-apps/api` — desktop-specific code is added in Task 9+. The build should succeed without Tauri types.
- **tauri-plugin-updater**: Added to Cargo.toml but NOT registered as plugin in lib.rs until Task 16 (cleanup). Defer to avoid config complexity during MVP development.

---

## Task 1: Strip SpecForge — Delete All Business Logic

**Files:**
- Delete: `crates/` (entire directory)
- Delete: `src-tauri/src/commands/` (all files)
- Delete: `src-tauri/src/services/` (all files)
- Delete: `src-tauri/src/repositories/` (entire directory)
- Delete: `src-tauri/src/models/` (all files)
- Delete: `src/` (entire current frontend)
- Delete: `ai_docs/`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Delete SpecForge crates, frontend, and artifacts**

```bash
rm -rf crates/
rm -rf src/
rm -rf ai_docs/
rm -rf .specforge/
rm -rf src-tauri/src/commands/
rm -rf src-tauri/src/services/
rm -rf src-tauri/src/repositories/
rm -rf src-tauri/src/models/
rm -f Cargo.lock
```

Also evaluate `scripts/` directory — delete SpecForge-specific scripts (e.g., `ensure-mcp-alias.mjs`, `bump-version.sh`).

- [ ] **Step 2: Write minimal Cargo.toml**

Replace `src-tauri/Cargo.toml` — remove all SpecForge deps, keep only what Skillshare App needs:

```toml
[package]
name = "skillshare-app"
version = "0.1.0"
description = "Skillshare App — desktop GUI for Skillshare CLI"
authors = ["runkids"]
edition = "2021"
default-run = "skillshare-app"

[lints.clippy]
unwrap_used = "warn"
expect_used = "warn"

[lib]
name = "skillshare_app"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["macos-private-api", "tray-icon", "image-png"] }
tauri-plugin-opener = "2"
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tokio = { version = "1", features = ["sync", "rt", "rt-multi-thread", "process", "time", "macros"] }
reqwest = { version = "0.12", features = ["json"] }
dirs = "5"
log = "0.4"
thiserror = "2.0"
sha2 = "0.10"

[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-updater = "2"
```

- [ ] **Step 3: Write minimal lib.rs stub**

Replace `src-tauri/src/lib.rs`:

```rust
mod commands;
mod models;
mod services;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Write minimal main.rs**

Replace `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    skillshare_app::run();
}
```

- [ ] **Step 5: Create empty module files**

Create stub `mod.rs` for each module:
- `src-tauri/src/commands/mod.rs` — empty
- `src-tauri/src/services/mod.rs` — empty
- `src-tauri/src/models/mod.rs` — empty

- [ ] **Step 6: Delete workspace Cargo.toml and verify build.rs**

- Remove root `Cargo.toml` if it's a workspace manifest.
- Check `src-tauri/build.rs` — ensure it only contains `tauri_build::build()`. Remove any SpecForge-specific build logic.

- [ ] **Step 7: Update index.html**

Update root `index.html`: change `<title>` to "Skillshare App", update any meta tags referencing SpecForge.

- [ ] **Step 8: Verify Rust compiles**

```bash
cd src-tauri && cargo check
```

Expected: compiles with no errors.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/ && git commit -m "chore: strip all SpecForge business logic

Remove crates/, commands, services, repositories, models, frontend.
Minimal Tauri shell with plugin setup only."
```

---

## Task 2: Import Skillshare UI Frontend

**Files:**
- Create: `src/` (copy from `skillshare/ui/src/`)
- Modify: `package.json`
- Replace: `vite.config.ts`
- Replace: `tsconfig.json`
- Delete: `tailwind.config.js`
- Copy: `tsconfig.app.json`, `tsconfig.node.json` from Skillshare UI

- [ ] **Step 1: Copy Skillshare UI source**

```bash
cp -r /Users/williehung/Developer/Apps/github/skillshare/ui/src/ src/
```

- [ ] **Step 2: Replace package.json**

Merge Skillshare UI deps with Tauri deps. New `package.json`:

```json
{
  "name": "skillshare-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:tauri": "tauri dev",
    "build": "tsc -b && vite build",
    "build:tauri": "tauri build --bundles dmg",
    "preview": "vite preview",
    "tauri": "tauri",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx}\""
  },
  "dependencies": {
    "@codemirror/lang-javascript": "^6.2.4",
    "@codemirror/lang-json": "^6.0.2",
    "@codemirror/lang-python": "^6.2.1",
    "@codemirror/lang-yaml": "^6.1.2",
    "@codemirror/language": "^6.12.2",
    "@codemirror/lint": "^6.9.5",
    "@codemirror/view": "^6.39.12",
    "@lezer/highlight": "^1.2.3",
    "@tailwindcss/vite": "^4.2.0",
    "@tanstack/react-query": "^5.90.21",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "~2",
    "@tauri-apps/plugin-notification": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "@tauri-apps/plugin-process": "~2",
    "@tauri-apps/plugin-shell": "^2",
    "@uiw/react-codemirror": "^4.25.4",
    "lucide-react": "^0.563.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-markdown": "^10.1.0",
    "react-router-dom": "^7.13.0",
    "react-virtuoso": "^4.18.1",
    "remark-gfm": "^4.0.1",
    "tailwindcss": "^4.2.0",
    "yaml": "^2.8.2"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@tanstack/react-query-devtools": "^5.91.3",
    "@tauri-apps/cli": "^2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.0",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "jsdom": "^28.1.0",
    "prettier": "^3.7.4",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.46.4",
    "vite": "^8.0.0",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 3: Replace vite.config.ts**

Merge Tauri dev server config with Skillshare's Tailwind 4 + proxy:

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;
const SSE_PROXY = { target: 'http://localhost:19420', headers: { Accept: 'text/event-stream' } };

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1421 }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api/audit/stream': SSE_PROXY,
      '/api/update/stream': SSE_PROXY,
      '/api/check/stream': SSE_PROXY,
      '/api/diff/stream': SSE_PROXY,
      '/api': 'http://localhost:19420',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /\/react-dom\/|\/react\/|\/scheduler\//, priority: 20 },
            { name: 'vendor-codemirror', test: /@codemirror\/(?!lang-)|@uiw\/|codemirror/, priority: 15 },
            { name: 'vendor-codemirror-lang', test: /@codemirror\/lang-|@lezer\//, priority: 16 },
            { name: 'vendor-markdown', test: /react-markdown|remark-|micromark|mdast-|unified|unist-|hast-|vfile|devlop/, priority: 15 },
            { name: 'vendor-tanstack-query', test: /@tanstack\/react-query/, priority: 10 },
          ],
        },
      },
    },
  },
});
```

- [ ] **Step 4: Replace tsconfig files**

```bash
cp /Users/williehung/Developer/Apps/github/skillshare/ui/tsconfig.json tsconfig.json
cp /Users/williehung/Developer/Apps/github/skillshare/ui/tsconfig.app.json tsconfig.app.json
cp /Users/williehung/Developer/Apps/github/skillshare/ui/tsconfig.node.json tsconfig.node.json
```

- [ ] **Step 5: Delete old Tailwind config**

```bash
rm -f tailwind.config.js postcss.config.js
```

Tailwind 4 uses `@tailwindcss/vite` plugin — no JS config needed.

- [ ] **Step 6: Copy eslint config from Skillshare UI**

```bash
cp /Users/williehung/Developer/Apps/github/skillshare/ui/eslint.config.js eslint.config.js
```

- [ ] **Step 7: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 8: Verify frontend builds**

```bash
pnpm build
```

Expected: TypeScript compiles + Vite builds. API calls fail at runtime (no Go server) but build succeeds.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: import Skillshare UI frontend

Copy skillshare/ui/src/ as new frontend. Replace package.json,
vite.config.ts, tsconfig with Skillshare UI versions + Tauri additions.
Upgrade from Tailwind 3 to 4."
```

---

## Task 3: Update Tauri Config — Skillshare App Identity

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Rewrite tauri.conf.json**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Skillshare App",
  "version": "0.1.0",
  "identifier": "com.skillshare.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "hiddenTitle": true,
        "title": "Skillshare App",
        "minWidth": 1100,
        "minHeight": 700,
        "resizable": true,
        "fullscreen": false,
        "transparent": false,
        "titleBarStyle": "Overlay",
        "center": true
      }
    ],
    "security": {
      "csp": null
    },
    "trayIcon": {
      "iconPath": "icons/32x32.png",
      "tooltip": "Skillshare App"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "shortDescription": "Skillshare App — Desktop GUI for Skillshare",
    "macOS": {
      "minimumSystemVersion": "10.15",
      "dmg": {
        "windowSize": { "width": 540, "height": 380 },
        "appPosition": { "x": 140, "y": 180 },
        "applicationFolderPosition": { "x": 400, "y": 180 }
      }
    }
  }
}
```

- [ ] **Step 2: Simplify capabilities/default.json**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Skillshare App default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "opener:default",
    "shell:allow-spawn",
    "shell:allow-kill",
    "shell:allow-open",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "name": "skillshare", "cmd": "skillshare", "args": true },
        { "name": "which", "cmd": "which", "args": true },
        { "name": "chmod", "cmd": "chmod", "args": true },
        { "name": "tar", "cmd": "tar", "args": true }
      ]
    },
    "dialog:default",
    "notification:default"
  ]
}
```

- [ ] **Step 3: Update or remove desktop.json capability**

Check if `src-tauri/capabilities/desktop.json` exists. If so, either merge its permissions (updater, process restart) into `default.json` and delete it, or update it to match new Skillshare App config.

- [ ] **Step 4: Verify Tauri compiles**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/ && git commit -m "chore: update Tauri config for Skillshare App

Rename from SpecForge. Update identifier, bundle, capabilities."
```

---

## Task 4: Rust Models

**Files:**
- Create: `src-tauri/src/models/mod.rs`
- Create: `src-tauri/src/models/project.rs`
- Create: `src-tauri/src/models/app_state.rs`

- [ ] **Step 1: Write project model** (`src-tauri/src/models/project.rs`)

Structs: `ProjectType` (Global/Project enum), `Project` (id, name, path, type, addedAt), `ProjectStore` (projects vec + activeProjectId). Derive Serialize/Deserialize with camelCase.

- [ ] **Step 2: Write app state model** (`src-tauri/src/models/app_state.rs`)

Structs: `CliMeta` (version, path, source, installedAt, lastUpdateCheck), `OnboardingStatus` (completed, cliReady, firstProjectCreated, firstSyncDone), `AppInfo` (cliVersion, cliSource, serverRunning, serverPort, onboarding).

- [ ] **Step 3: Write models/mod.rs** — export both modules.

- [ ] **Step 4: Verify compiles** — `cd src-tauri && cargo check`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Skillshare App data models

Project, ProjectStore, CliMeta, OnboardingStatus, AppInfo."
```

---

## Task 5: Rust Service — Project Store

**Files:**
- Create: `src-tauri/src/services/project_store.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write project store service**

Functions: `store_path()` (returns `~/Library/Application Support/com.skillshare.app/projects.json`), `load()`, `save()`, `add_project()`, `remove_project()`, `set_active()`. Auto-create directory. Auto-activate first project.

- [ ] **Step 2: Update services/mod.rs**
- [ ] **Step 3: Verify compiles** — `cd src-tauri && cargo check`
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add project store service

CRUD for projects.json — load, save, add, remove, set active."
```

---

## Task 6: Rust Service — CLI Manager

**Files:**
- Create: `src-tauri/src/services/cli_manager.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write CLI manager service**

Functions:
- `cli_dir()` / `meta_path()` — path helpers
- `load_meta()` / `save_meta()` — CLI metadata persistence
- `detect_cli()` — check PATH then app bin dir
- `get_version(cli_path)` — run `skillshare version`
- `exec(cli_path, args, working_dir)` — execute CLI command, return stdout
- `check_latest_release()` — GitHub API, return (version, download_url)
- `download_cli(url)` — download, verify, extract, chmod +x

Error handling: retry up to 3x with backoff for download; handle 403 rate limit; cleanup partial downloads on failure.

- [ ] **Step 2: Update services/mod.rs**
- [ ] **Step 3: Verify compiles** — `cd src-tauri && cargo check`
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add CLI manager service

Detect, download, version check, exec for skillshare CLI.
GitHub release integration with retry and error handling."
```

---

## Task 7: Rust Service — Server Manager

**Files:**
- Create: `src-tauri/src/services/server_manager.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write server manager**

`ServerManager` struct with `Arc<Mutex<Option<Child>>>` for process handle and `Arc<Mutex<u16>>` for port. Methods:
- `start(cli_path, project_dir)` — try ports 19420-19430, spawn `skillshare ui --port N --no-open [--dir path]`, poll health check
- `stop()` — kill process
- `restart(cli_path, project_dir)` — stop + start
- `is_running()` / `health_check(port)` — GET `/api/overview`
- `wait_for_ready(port)` — poll 20x at 500ms intervals (10s timeout)

- [ ] **Step 2: Update services/mod.rs**
- [ ] **Step 3: Verify compiles** — `cd src-tauri && cargo check`
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add server manager service

Go HTTP server lifecycle: start with port fallback (19420-19430),
stop, restart, health check with 10s timeout."
```

---

## Task 8: Rust Commands + lib.rs Wiring

**Files:**
- Create: `src-tauri/src/commands/cli.rs`
- Create: `src-tauri/src/commands/project.rs`
- Create: `src-tauri/src/commands/server.rs`
- Create: `src-tauri/src/commands/app.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write CLI commands** — `detect_cli`, `get_cli_version`, `download_cli`, `check_cli_update`, `upgrade_cli`, `exec_cli`. Use `#[tauri::command]` attribute.

- [ ] **Step 2: Write project commands** — `list_projects`, `get_active_project`, `add_project`, `remove_project`, `switch_project`.

- [ ] **Step 3: Write server commands** — `start_server`, `stop_server`, `restart_server`, `health_check`, `get_server_port`. Take `State<'_, ServerManager>`.

- [ ] **Step 4: Write app commands** — `get_app_state`, `get_onboarding_status`. Compose info from CLI manager + project store + server manager.

- [ ] **Step 5: Write commands/mod.rs** — export all four modules.

- [ ] **Step 6: Wire lib.rs** — `.manage(ServerManager::new())`, register all commands in `invoke_handler`.

- [ ] **Step 7: Verify compiles** — `cd src-tauri && cargo check`

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add Tauri commands and wire lib.rs

CLI, project, server, and app commands. All IPC endpoints registered.
ServerManager as managed Tauri state."
```

---

## Task 9: Frontend — Tauri Bridge & Context

**Files:**
- Create: `src/desktop/api/tauri-bridge.ts`
- Create: `src/desktop/context/TauriContext.tsx`
- Create: `src/desktop/hooks/useCliManager.ts`
- Create: `src/desktop/hooks/useProjects.ts`
- Create: `src/desktop/hooks/useServerStatus.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/desktop/api src/desktop/context src/desktop/hooks src/desktop/pages src/desktop/components/OnboardingSteps
```

- [ ] **Step 2: Write Tauri bridge** — typed `invoke()` wrappers for all Rust commands. Export `Project`, `AppInfo`, `OnboardingStatus` TypeScript interfaces.

- [ ] **Step 3: Write hooks** — `useCliManager` (detect, download, state), `useProjects` (CRUD, switching, refresh), `useServerStatus` (start, stop, health).

- [ ] **Step 4: Write TauriContext** — provides `appInfo`, `loading`, `refresh` to React tree. Fetches app state on mount.

- [ ] **Step 5: Verify TypeScript compiles** — `pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Tauri bridge, hooks, and context

Desktop-specific API layer for CLI management, project CRUD,
and server status. TauriContext provides app state to React tree."
```

---

## Task 10: Frontend — Onboarding Wizard

**Files:**
- Create: `src/desktop/pages/OnboardingPage.tsx`
- Create: `src/desktop/components/OnboardingSteps/WelcomeStep.tsx`
- Create: `src/desktop/components/OnboardingSteps/ProjectSetupStep.tsx`
- Create: `src/desktop/components/OnboardingSteps/FirstSyncStep.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write WelcomeStep** — welcome message, auto-detect CLI, download button with progress, "Use existing" option if found in PATH. Use Skillshare `Button` component.

- [ ] **Step 2: Write ProjectSetupStep** — Global vs Project radio choice. Project mode uses Tauri file picker. Runs `skillshare init [-p]` via exec. Shows condensed output.

- [ ] **Step 3: Write FirstSyncStep** — auto-runs `skillshare sync`, shows result, "Enter Skillshare App" button.

- [ ] **Step 4: Write OnboardingPage** — 3-step wizard container. Step indicator, forward/back navigation, step state management.

- [ ] **Step 5: Modify App.tsx** — add `<TauriProvider>` wrapper, add `/onboarding` route, add root redirect if `!onboarding.completed`.

- [ ] **Step 6: Modify main.tsx** — ensure Tauri API is importable (minimal change).

- [ ] **Step 7: Verify TypeScript compiles** — `pnpm typecheck`

- [ ] **Step 8: Manual test** — `pnpm dev:tauri` → onboarding wizard appears → download CLI → setup project → sync → redirect to dashboard.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add onboarding wizard

3-step: CLI download, project setup, first sync.
Auto-redirects if onboarding not completed."
```

---

## Task 11: Frontend — Project Switcher, Sidebar & Projects Page

**Files:**
- Create: `src/desktop/components/ProjectSwitcher.tsx`
- Create: `src/desktop/components/SwitchOverlay.tsx`
- Create: `src/desktop/pages/ProjectsPage.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write ProjectSwitcher** — dropdown showing active project, lists all, "Add Project" option at bottom. On select: calls `switchProject`, triggers server restart. Use existing Skillshare clean mode select/dropdown styling.

- [ ] **Step 2: Write SwitchOverlay** — full-screen overlay with spinner + "Switching to {name}...". On 5s timeout: error toast with "Retry" / "Switch back". Conditionally rendered based on `switching` state.

- [ ] **Step 3: Modify Layout.tsx** — Add `ProjectSwitcher` below logo. Add "ALL PROJECTS" section at bottom of sidebar with project list + "+ Add Project" link. Import `useProjects` hook. **Read the imported Layout.tsx first to understand its exact structure before modifying.**

- [ ] **Step 4: Write ProjectsPage** — `src/desktop/pages/ProjectsPage.tsx` — full project management page. Lists all projects as cards, add/remove projects, edit project names. This is the page linked from sidebar "ALL PROJECTS" section.

- [ ] **Step 5: Add /projects route to App.tsx** — add `<Route path="projects" element={<ProjectsPage />} />` inside the Layout route children.

- [ ] **Step 6: Manual test** — switch project → overlay → server restarts → data reloads. Add project → file picker → init → switch. Navigate to /projects page.

- [ ] **Step 7: Commit**

```bash
git add src/desktop/ src/components/Layout.tsx src/App.tsx && git commit -m "feat: add project switcher, sidebar, and projects page

Dropdown switcher, switch overlay with loading/error states,
ALL PROJECTS section in sidebar, dedicated /projects page."
```

---

## Task 12: Frontend — Cross-Project Dashboard

**Files:**
- Create: `src/desktop/components/ProjectCard.tsx`
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Write ProjectCard** — card with project name, type badge, skill count, last sync time. Use Skillshare `Card` and `Badge` components.

- [ ] **Step 2: Modify DashboardPage** — add "Projects" section. Grid of `ProjectCard`. "Sync All" button runs `skillshare sync --dir <path>` for each project via Tauri IPC. Data fetched via `tauriBridge.execCli(cliPath, ['overview', '--json', '--dir', path])`.

- [ ] **Step 3: Verify TypeScript compiles** — `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add cross-project dashboard overview

ProjectCard grid, per-project stats via CLI, Sync All button."
```

---

## Task 13: System Tray

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add tray setup to lib.rs**

In `setup` closure, use `tauri::tray::TrayIconBuilder` to create menu:
- "Quick Sync" → exec `skillshare sync` for active project, send notification on complete
- Separator
- "Open Skillshare App" → show/focus main window
- Active project name (disabled label)
- Separator
- "Quit" → exit

- [ ] **Step 2: Handle window close → minimize to tray**

Add `on_window_event` handler: on `CloseRequested`, hide window instead of closing.

- [ ] **Step 3: Verify compiles + manual test** — close window → tray → click Open → window reappears.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add system tray with Quick Sync

Menu: Quick Sync, Open, project name, Quit.
Close minimizes to tray."
```

---

## Task 14: System Notifications

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Notification after Quick Sync** — "Skillshare Sync Complete" with summary.

- [ ] **Step 2: Background CLI update check** — spawn task in `setup`, respect 24h cooldown, send "Skillshare Update Available" notification.

- [ ] **Step 3: Manual test** — tray Quick Sync → notification. Outdated CLI → update notification.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add system notifications

Sync completion and CLI update available via tauri-plugin-notification."
```

---

## Task 15: Auto-Start Server on Launch

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add server auto-start**

In `setup` closure, spawn async task: if onboarding complete, detect CLI → load active project → start server. Skip if not completed (onboarding handles it).

- [ ] **Step 2: Manual test** — launch app with completed onboarding → server starts → pages load data.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: auto-start Go server on app launch

Starts HTTP server in background if onboarding is complete."
```

---

## Task 16: Cleanup & Final Verification

- [ ] **Step 1: Remove workspace Cargo.toml if exists** — `rm -f Cargo.toml` (root level, if it's a workspace manifest).

- [ ] **Step 2: Clean up .gitignore** — remove SpecForge-specific entries.

- [ ] **Step 3: Full build verification**

```bash
pnpm install
pnpm typecheck
pnpm build
cd src-tauri && cargo clippy -- -D warnings
cd src-tauri && cargo build
```

All must pass.

- [ ] **Step 4: End-to-end smoke test** — `pnpm dev:tauri`

Verify: app launches → onboarding works → main UI loads → sidebar project switcher → pages load → tray works → close → tray → reopen.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: cleanup and final verification

Remove SpecForge remnants, verify full build chain."
```
