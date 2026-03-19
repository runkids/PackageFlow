# Tauri Thin Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Tauri app into a thin shell that loads the CLI's web UI via iframe, keeping only onboarding, project management, and title bar project switcher.

**Architecture:** Thin React shell with 3 routes (onboarding, projects, CLI webview). Title bar with project dropdown in macOS overlay. Server restarts on project switch with loading overlay. All ~20 duplicated pages deleted.

**Tech Stack:** Tauri v2, React, TypeScript, Rust (backend services)

**Spec:** `docs/superpowers/specs/2026-03-20-tauri-thin-shell-design.md`

---

## File Structure

### New/Modified Files

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/services/server_manager.rs` | Modify | Use `current_dir()` + `-p` flag instead of `--dir` |
| `src-tauri/src/commands/project.rs` | Modify | Enforce max-one-global constraint in `add_project` |
| `src-tauri/src/commands/server.rs` | Modify | Accept project type to determine CLI args |
| `src-tauri/src/lib.rs` | Modify | Update `auto_start_server` for new server start API |
| `src/desktop/components/TitleBar.tsx` | Create | Draggable macOS title bar with project dropdown |
| `src/desktop/components/ProjectDropdown.tsx` | Create | Dropdown: global + projects + manage link |
| `src/desktop/components/CliWebView.tsx` | Create | iframe wrapper + loading overlay + health watcher |
| `src/desktop/pages/ProjectsPage.tsx` | Modify | Add init flow, global section, back nav |
| `src/desktop/hooks/useProjects.ts` | Modify | Add `switchWithRestart` for server stop/start/reload |
| `src/App.tsx` | Modify | Simplify to 3 routes + TitleBar |

### Files to Delete (Phase 7)

All `src/pages/*.tsx`, `src/api/`, `src/components/Layout.tsx`, `src/components/tour/`, `src/context/AppContext.tsx`, `src/lib/basePath.ts`, and orphaned hooks.

---

## Task 1: Refactor server_manager — use `current_dir` instead of `--dir`

**Files:**
- Modify: `src-tauri/src/services/server_manager.rs`

- [ ] **Step 1: Update `start()` to accept project type and use `current_dir()`**

Change signature from `(cli_path, project_dir: Option<&str>)` to `(cli_path, project_dir: Option<&str>, is_project_mode: bool)`.

```rust
pub async fn start(
    &self,
    cli_path: &str,
    project_dir: Option<&str>,
    is_project_mode: bool,
) -> Result<u16, String> {
    self.stop().await?;

    let mut chosen_port = DEFAULT_PORT;
    for port in DEFAULT_PORT..=MAX_PORT {
        if !is_port_in_use(port).await {
            chosen_port = port;
            break;
        }
        if port == MAX_PORT {
            return Err(format!("All ports {DEFAULT_PORT}-{MAX_PORT} are in use"));
        }
    }

    let mut cmd = Command::new(cli_path);

    // Set working directory
    if let Some(dir) = project_dir {
        if dir == "~" {
            cmd.current_dir(dirs::home_dir().unwrap_or_default());
        } else {
            cmd.current_dir(dir);
        }
    }

    // Build args: "ui -p --port N --no-open" for project, "ui --port N --no-open" for global
    if is_project_mode {
        cmd.args(["ui", "-p", "--port", &chosen_port.to_string(), "--no-open"]);
    } else {
        cmd.args(["ui", "--port", &chosen_port.to_string(), "--no-open"]);
    }

    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn server: {e}"))?;

    {
        let mut proc = self.process.lock().await;
        *proc = Some(child);
    }
    {
        let mut p = self.port.lock().await;
        *p = chosen_port;
    }

    self.wait_for_ready(chosen_port).await?;
    Ok(chosen_port)
}
```

- [ ] **Step 2: Update `restart()` to match new signature**

```rust
pub async fn restart(
    &self,
    cli_path: &str,
    project_dir: Option<&str>,
    is_project_mode: bool,
) -> Result<u16, String> {
    self.stop().await?;
    self.start(cli_path, project_dir, is_project_mode).await
}
```

- [ ] **Step 3: Run `cargo check`**

Run: `cd src-tauri && cargo check`
Expected: compilation errors in callers (server commands, lib.rs) — fix in next tasks

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/server_manager.rs
git commit -m "refactor: server_manager uses current_dir and project mode flag"
```

---

## Task 2: Update server commands and auto_start for new API

**Files:**
- Modify: `src-tauri/src/commands/server.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update server commands to pass `is_project_mode`**

`src-tauri/src/commands/server.rs`:

```rust
use crate::services::{server_manager::ServerManager, project_store};
use crate::models::project::ProjectType;
use tauri::State;

#[tauri::command]
pub async fn start_server(
    server: State<'_, ServerManager>,
    cli_path: String,
    project_dir: Option<String>,
) -> Result<u16, String> {
    // Determine project mode from active project
    let store = project_store::load();
    let is_project_mode = store
        .active_project()
        .map(|p| p.project_type == ProjectType::Project)
        .unwrap_or(false);

    server
        .start(&cli_path, project_dir.as_deref(), is_project_mode)
        .await
}

#[tauri::command]
pub async fn stop_server(server: State<'_, ServerManager>) -> Result<(), String> {
    server.stop().await
}

#[tauri::command]
pub async fn restart_server(
    server: State<'_, ServerManager>,
    cli_path: String,
    project_dir: Option<String>,
) -> Result<u16, String> {
    let store = project_store::load();
    let is_project_mode = store
        .active_project()
        .map(|p| p.project_type == ProjectType::Project)
        .unwrap_or(false);

    server
        .restart(&cli_path, project_dir.as_deref(), is_project_mode)
        .await
}

#[tauri::command]
pub async fn server_health_check(server: State<'_, ServerManager>) -> Result<bool, String> {
    Ok(server.is_running().await)
}

#[tauri::command]
pub async fn get_server_port(server: State<'_, ServerManager>) -> Result<u16, String> {
    Ok(server.get_port().await)
}
```

- [ ] **Step 2: Update `auto_start_server` in `lib.rs`**

In `lib.rs`, update the `auto_start_server` function:

```rust
async fn auto_start_server(server: ServerManager) {
    let meta = services::cli_manager::load_meta();
    let store = services::project_store::load();

    let cli_installed = meta.version.is_some();
    let has_project = !store.projects.is_empty();

    if !cli_installed || !has_project {
        log::info!("Auto-start skipped: onboarding not complete");
        return;
    }

    let cli_path = match services::cli_manager::detect_cli().await {
        Some(p) => p,
        None => {
            log::warn!("Auto-start: CLI not found despite meta indicating installation");
            return;
        }
    };

    let active = store.active_project();
    let project_dir = active.map(|p| p.path.clone());
    let is_project_mode = active
        .map(|p| p.project_type == models::project::ProjectType::Project)
        .unwrap_or(false);

    match server.start(&cli_path, project_dir.as_deref(), is_project_mode).await {
        Ok(port) => log::info!("Auto-started server on port {port}"),
        Err(e) => log::warn!("Auto-start server failed: {e}"),
    }
}
```

- [ ] **Step 3: Ensure `ProjectType` derives `PartialEq`**

Check `src-tauri/src/models/project.rs` — add `PartialEq` to derive if missing.

- [ ] **Step 4: Run `cargo check`**

Run: `cd src-tauri && cargo check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/server.rs src-tauri/src/lib.rs src-tauri/src/models/project.rs
git commit -m "refactor: server commands use active project type for -p flag"
```

---

## Task 3: Enforce max-one-global in `add_project`

**Files:**
- Modify: `src-tauri/src/commands/project.rs`

- [ ] **Step 1: Add validation to reject duplicate global projects**

```rust
#[tauri::command]
pub fn add_project(
    name: String,
    path: String,
    project_type: ProjectType,
) -> Result<Project, String> {
    let mut store = project_store::load();

    // Enforce at most one global project
    if project_type == ProjectType::Global {
        let has_global = store.projects.iter().any(|p| p.project_type == ProjectType::Global);
        if has_global {
            return Err("A global project already exists. Remove it first to add a new one.".to_string());
        }
    }

    let project = project_store::add_project(&mut store, name, path, project_type);
    project_store::save(&store)?;
    Ok(project)
}
```

- [ ] **Step 2: Run `cargo check`**

Run: `cd src-tauri && cargo check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/project.rs
git commit -m "fix: enforce max one global project constraint"
```

---

## Task 4: Create TitleBar component

**Files:**
- Create: `src/desktop/components/TitleBar.tsx`
- Create: `src/desktop/components/ProjectDropdown.tsx`

- [ ] **Step 1: Create ProjectDropdown**

`src/desktop/components/ProjectDropdown.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Globe, Folder, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';

export default function ProjectDropdown() {
  const { projects, activeProject, switchWithRestart } = useProjects();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const globalProjects = projects.filter((p) => p.projectType === 'global');
  const localProjects = projects.filter((p) => p.projectType === 'project');

  const handleSwitch = async (id: string) => {
    setOpen(false);
    if (id === activeProject?.id) return;
    await switchWithRestart(id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] hover:bg-muted/50 transition-colors text-sm font-medium text-pencil"
      >
        {activeProject?.projectType === 'global' ? (
          <Globe size={14} strokeWidth={2.5} />
        ) : (
          <Folder size={14} strokeWidth={2.5} />
        )}
        <span className="max-w-[160px] truncate">
          {activeProject?.name || 'No Project'}
        </span>
        <ChevronDown size={12} strokeWidth={2.5} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-paper border border-muted rounded-[var(--radius-md)] shadow-lg z-50 py-1">
          {globalProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSwitch(p.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors ${
                p.id === activeProject?.id ? 'text-pencil font-medium' : 'text-pencil-light'
              }`}
            >
              <Globe size={14} strokeWidth={2.5} className="shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}

          {globalProjects.length > 0 && localProjects.length > 0 && (
            <div className="border-t border-muted my-1" />
          )}

          {localProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSwitch(p.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors ${
                p.id === activeProject?.id ? 'text-pencil font-medium' : 'text-pencil-light'
              }`}
            >
              <Folder size={14} strokeWidth={2.5} className="shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}

          <div className="border-t border-muted my-1" />

          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/projects'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-pencil-light hover:bg-muted/30 transition-colors"
          >
            <Settings size={14} strokeWidth={2.5} className="shrink-0" />
            <span>Manage Projects</span>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create TitleBar**

`src/desktop/components/TitleBar.tsx`:

```tsx
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProjectDropdown from './ProjectDropdown';

export default function TitleBar() {
  const navigate = useNavigate();

  return (
    <div
      data-tauri-drag-region
      className="h-12 flex items-center justify-between px-4 bg-paper border-b border-muted select-none shrink-0"
      style={{ paddingLeft: '80px' }} // macOS traffic lights offset
    >
      <ProjectDropdown />
      <button
        type="button"
        onClick={() => navigate('/projects')}
        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-muted/50 transition-colors text-pencil-light hover:text-pencil"
        title="Manage Projects"
      >
        <Settings size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: errors for `switchWithRestart` not yet existing on useProjects — fix in Task 5

- [ ] **Step 4: Commit**

```bash
git add src/desktop/components/TitleBar.tsx src/desktop/components/ProjectDropdown.tsx
git commit -m "feat: add TitleBar with project dropdown switcher"
```

---

## Task 5: Add `switchWithRestart` to useProjects hook

**Files:**
- Modify: `src/desktop/hooks/useProjects.ts`

- [ ] **Step 1: Add switchWithRestart that orchestrates server stop/start**

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { tauriBridge, type Project } from '../api/tauri-bridge';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [switching, setSwitching] = useState(false);
  const switchLock = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [list, active] = await Promise.all([
        tauriBridge.listProjects(),
        tauriBridge.getActiveProject(),
      ]);
      setProjects(list);
      setActiveProject(active);
    } catch {
      // Silently ignore — projects may not exist yet
    }
  }, []);

  const addProject = useCallback(
    async (name: string, path: string, projectType: 'global' | 'project') => {
      const project = await tauriBridge.addProject(name, path, projectType);
      await refresh();
      return project;
    },
    [refresh],
  );

  const switchProject = useCallback(
    async (id: string) => {
      setSwitching(true);
      try {
        await tauriBridge.switchProject(id);
        await refresh();
      } finally {
        setSwitching(false);
      }
    },
    [refresh],
  );

  /** Switch project + restart server. Debounced via lock. */
  const switchWithRestart = useCallback(
    async (id: string) => {
      if (switchLock.current) return;
      switchLock.current = true;
      setSwitching(true);
      try {
        // 1. Stop current server
        await tauriBridge.stopServer();
        // 2. Switch active project in store
        await tauriBridge.switchProject(id);
        await refresh();
        // 3. Detect CLI and get new project info
        const cliPath = await tauriBridge.detectCli();
        if (!cliPath) throw new Error('CLI not found');
        const newActive = await tauriBridge.getActiveProject();
        const projectDir = newActive?.path;
        // 4. Start server with new project
        const port = await tauriBridge.startServer(cliPath, projectDir);
        return port;
      } finally {
        setSwitching(false);
        switchLock.current = false;
      }
    },
    [refresh],
  );

  const removeProject = useCallback(
    async (id: string) => {
      await tauriBridge.removeProject(id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    projects,
    activeProject,
    switching,
    refresh,
    addProject,
    switchProject,
    switchWithRestart,
    removeProject,
  };
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: PASS (or errors only in not-yet-created CliWebView)

- [ ] **Step 3: Commit**

```bash
git add src/desktop/hooks/useProjects.ts
git commit -m "feat: add switchWithRestart to useProjects hook"
```

---

## Task 6: Create CliWebView component

**Files:**
- Create: `src/desktop/components/CliWebView.tsx`

- [ ] **Step 1: Create iframe wrapper with loading overlay and health watcher**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import Spinner from '../../components/Spinner';
import Button from '../../components/Button';
import { useProjects } from '../hooks/useProjects';
import { tauriBridge } from '../api/tauri-bridge';
import { useTauri } from '../context/TauriContext';

const HEALTH_POLL_INTERVAL = 30_000; // 30 seconds
const HEALTH_FAIL_THRESHOLD = 3;

export default function CliWebView() {
  const { appInfo, refresh: refreshAppInfo } = useTauri();
  const { switching, activeProject } = useProjects();
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const failCount = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Set iframe URL when server port is known
  useEffect(() => {
    if (appInfo?.serverPort) {
      setIframeUrl(`http://localhost:${appInfo.serverPort}`);
      setServerDown(false);
      failCount.current = 0;
    }
  }, [appInfo?.serverPort]);

  // Health check polling
  useEffect(() => {
    if (!iframeUrl) return;

    pollRef.current = setInterval(async () => {
      try {
        const healthy = await tauriBridge.healthCheck();
        if (healthy) {
          failCount.current = 0;
          setServerDown(false);
        } else {
          failCount.current++;
          if (failCount.current >= HEALTH_FAIL_THRESHOLD) {
            setServerDown(true);
          }
        }
      } catch {
        failCount.current++;
        if (failCount.current >= HEALTH_FAIL_THRESHOLD) {
          setServerDown(true);
        }
      }
    }, HEALTH_POLL_INTERVAL);

    return () => clearInterval(pollRef.current);
  }, [iframeUrl]);

  // Reload iframe when switching completes — re-fetch appInfo to get new port
  useEffect(() => {
    if (!switching) {
      refreshAppInfo().then(() => {
        // appInfo.serverPort will update, triggering the first useEffect
      });
    }
  }, [switching, refreshAppInfo]);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      const cliPath = await tauriBridge.detectCli();
      if (!cliPath) throw new Error('CLI not found');
      const projectDir = activeProject?.path;
      const port = await tauriBridge.startServer(cliPath, projectDir);
      setIframeUrl(`http://localhost:${port}`);
      setServerDown(false);
      failCount.current = 0;
    } catch {
      // Stay in server-down state
    } finally {
      setRestarting(false);
    }
  }, [activeProject]);

  // Loading state: no URL yet or switching
  if (!iframeUrl || switching) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-paper">
        <Spinner size="lg" />
        <span className="text-pencil-light text-sm">
          {switching
            ? `Switching to ${activeProject?.name || 'project'}...`
            : 'Starting server...'}
        </span>
      </div>
    );
  }

  // Server down state
  if (serverDown) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-paper">
        <p className="text-pencil font-medium">Server disconnected</p>
        <p className="text-pencil-light text-sm">
          The CLI server is no longer responding.
        </p>
        <Button onClick={handleRestart} loading={restarting}>
          Restart Server
        </Button>
      </div>
    );
  }

  return (
    <iframe
      key={iframeUrl}
      src={iframeUrl}
      className="flex-1 w-full border-0"
      allow="clipboard-write"
      title="Skillshare UI"
    />
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/desktop/components/CliWebView.tsx
git commit -m "feat: add CliWebView iframe wrapper with health monitoring"
```

---

## Task 7: Enhance ProjectsPage with init flow and back navigation

**Files:**
- Modify: `src/desktop/pages/ProjectsPage.tsx`

- [ ] **Step 1: Add init flow, global constraint UI, and back navigation**

Replace `src/desktop/pages/ProjectsPage.tsx`:

```tsx
import { useState } from 'react';
import { Folder, Globe, Trash2, Plus, ArrowLeft } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import { useProjects } from '../hooks/useProjects';
import { tauriBridge } from '../api/tauri-bridge';
import { useTauri } from '../context/TauriContext';

export default function ProjectsPage() {
  const { projects, activeProject, switching, addProject, removeProject, switchWithRestart } =
    useProjects();
  const { appInfo } = useTauri();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const globalProjects = projects.filter((p) => p.projectType === 'global');
  const localProjects = projects.filter((p) => p.projectType === 'project');

  const handleAddGlobal = async () => {
    setAdding(true);
    setError(null);
    try {
      const detectedCli = await tauriBridge.detectCli();
      if (!detectedCli) throw new Error('CLI not found');
      const home = await homeDir();
      // Run init in home directory
      try {
        await tauriBridge.runCli(detectedCli, ['init'], home);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already initialized')) throw err;
      }
      await addProject('Global', home, 'global');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleAddProject = async () => {
    const dir = await open({ directory: true, title: 'Select project directory' });
    if (typeof dir !== 'string') return;

    setAdding(true);
    setError(null);
    try {
      const detectedCli = await tauriBridge.detectCli();
      if (!detectedCli) throw new Error('CLI not found');
      // Run init -p first
      try {
        await tauriBridge.runCli(detectedCli, ['init', '-p'], dir);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already initialized')) throw err;
      }
      const name = dir.split('/').pop() || 'Project';
      await addProject(name, dir, 'project');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeProject(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSwitch = async (id: string) => {
    try {
      await switchWithRestart(id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const renderProjectCard = (project: typeof projects[0]) => {
    const isActive = project.id === activeProject?.id;
    return (
      <Card key={project.id} className={isActive ? 'border-pencil' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {project.projectType === 'global' ? (
              <Globe size={18} strokeWidth={2.5} className="shrink-0 mt-0.5 text-pencil-light" />
            ) : (
              <Folder size={18} strokeWidth={2.5} className="shrink-0 mt-0.5 text-pencil-light" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-pencil truncate">{project.name}</h3>
                {isActive && <Badge variant="success" size="sm">Active</Badge>}
              </div>
              <p className="text-sm text-pencil-light truncate mt-0.5" title={project.path}>
                {project.path}
              </p>
              <p className="text-xs text-muted-dark mt-1">
                Added {formatDate(project.addedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSwitch(project.id)}
                loading={switching}
              >
                Switch
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(project.id)}
              className="text-danger hover:text-danger"
            >
              <Trash2 size={14} strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-paper">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </Button>
          <h1
            className="text-2xl font-bold text-pencil"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Projects
          </h1>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        {/* Global Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-pencil-light uppercase tracking-wider">
            Global
          </h2>
          {globalProjects.length > 0 ? (
            globalProjects.map(renderProjectCard)
          ) : (
            <Card className="text-center py-8">
              <p className="text-pencil-light text-sm mb-3">
                No global configuration yet.
              </p>
              <Button size="sm" onClick={handleAddGlobal} loading={adding}>
                <Globe size={14} strokeWidth={2.5} />
                Set up Global
              </Button>
            </Card>
          )}
        </section>

        {/* Projects Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-pencil-light uppercase tracking-wider">
              Projects
            </h2>
            <Button size="sm" onClick={handleAddProject} loading={adding}>
              <Plus size={14} strokeWidth={2.5} />
              Add Project
            </Button>
          </div>
          {localProjects.length > 0 ? (
            <div className="space-y-3">
              {localProjects.map(renderProjectCard)}
            </div>
          ) : (
            <Card className="text-center py-8">
              <p className="text-pencil-light text-sm">
                No project configurations yet.
              </p>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/desktop/pages/ProjectsPage.tsx
git commit -m "feat: enhance ProjectsPage with init flow, global section, and back nav"
```

---

## Task 8: Simplify App.tsx to 3 routes

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx with only 3 routes + TitleBar**

```tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './context/ThemeContext';
import { TauriProvider, useTauri } from './desktop/context/TauriContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import TitleBar from './desktop/components/TitleBar';
import CliWebView from './desktop/components/CliWebView';
import OnboardingPage from './desktop/pages/OnboardingPage';
import ProjectsPage from './desktop/pages/ProjectsPage';

/** Redirects to /onboarding if Tauri reports onboarding is not completed. */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { appInfo, loading } = useTauri();
  const location = useLocation();

  if (loading) return null;
  if (!appInfo) return <>{children}</>;
  if (!appInfo.onboarding.completed && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

/** Hide TitleBar on onboarding page */
function ConditionalTitleBar() {
  const location = useLocation();
  if (location.pathname === '/onboarding') return null;
  return <TitleBar />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <TauriProvider>
            <BrowserRouter>
              <ErrorBoundary>
                <div className="h-screen flex flex-col">
                  <ConditionalTitleBar />
                  <OnboardingGuard>
                    <Routes>
                      <Route path="/onboarding" element={<OnboardingPage />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/*" element={<CliWebView />} />
                    </Routes>
                  </OnboardingGuard>
                </div>
              </ErrorBoundary>
            </BrowserRouter>
          </TauriProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: errors for now-unused imports in old files — these get cleaned in Task 9

- [ ] **Step 3: Verify app launches**

Run: `cd src-tauri && cargo tauri dev`
Expected: app opens with title bar, loads CLI web UI in iframe (or shows onboarding if first run)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: simplify App.tsx to 3 routes (onboarding, projects, CLI webview)"
```

---

## Task 9: Delete unused files (inverted approach)

Strategy: Keep ONLY the files needed by the thin shell. Delete everything else in `src/` except the kept list.

**Files to KEEP** (everything else gets deleted):

```
src/App.tsx
src/main.tsx
src/index.css (or global styles)
src/vite-env.d.ts

src/desktop/                         ← entire directory (all kept)

src/components/Button.tsx
src/components/Card.tsx
src/components/Badge.tsx
src/components/Spinner.tsx
src/components/Toast.tsx
src/components/ErrorBoundary.tsx
src/components/Skeleton.tsx
src/components/ConfirmDialog.tsx      ← used by ProjectsPage remove flow
src/components/DialogShell.tsx        ← used by ConfirmDialog

src/context/ThemeContext.tsx
src/context/__tests__/               ← keep if exists

src/lib/queryClient.ts
```

- [ ] **Step 1: Delete entire directories that are fully unused**

```bash
rm -rf src/pages/
rm -rf src/api/
rm -rf src/hooks/
```

- [ ] **Step 2: Delete unused components**

```bash
# Delete component subdirs
rm -rf src/components/tour/
rm -rf src/components/config/
rm -rf src/components/audit/

# Delete individual orphaned components
rm -f src/components/Layout.tsx
rm -f src/components/SyncPreviewModal.tsx
rm -f src/components/SyncResultList.tsx
rm -f src/components/FileViewerModal.tsx
rm -f src/components/SkillPickerModal.tsx
rm -f src/components/InstallForm.tsx
rm -f src/components/FilterTagInput.tsx
rm -f src/components/PageHeader.tsx
rm -f src/components/StatusBadge.tsx
rm -f src/components/HubManagerModal.tsx
rm -f src/components/StreamProgressBar.tsx
rm -f src/components/KeyboardShortcutsModal.tsx
rm -f src/components/ShortcutHUD.tsx
rm -f src/components/ScrollToTop.tsx
rm -f src/components/ThemePopover.tsx
rm -f src/components/Pagination.tsx
rm -f src/components/CopyButton.tsx
rm -f src/components/Checkbox.tsx
rm -f src/components/EmptyState.tsx
rm -f src/components/IconButton.tsx
rm -f src/components/Input.tsx
rm -f src/components/Select.tsx
rm -f src/components/SegmentedControl.tsx
rm -f src/components/Tooltip.tsx
```

- [ ] **Step 3: Delete unused context and lib files**

```bash
rm -f src/context/AppContext.tsx
rm -f src/lib/basePath.ts
rm -f src/lib/format.ts
rm -f src/lib/severity.ts
rm -f src/lib/codemirror-theme.ts
rm -f src/lib/paths.ts
rm -f src/lib/fieldDocs.ts
rm -f src/lib/auditFieldDocs.ts
rm -f src/lib/sync.ts
rm -f src/lib/parseRemoteURL.ts
rm -f src/lib/queryKeys.ts
```

- [ ] **Step 4: Verify with TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -60`
Expected: Fix any remaining import errors. If a kept file imports a deleted file, either remove the import or add the file back to the keep list.

- [ ] **Step 5: Verify Rust build**

Run: `cd src-tauri && cargo check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove ~50 unused files (pages, components, hooks, libs)"
```

---

## Task 10: Final integration verification

- [ ] **Step 1: Build check**

```bash
npm run build 2>&1 | tail -20
cd src-tauri && cargo check
```

Expected: both pass

- [ ] **Step 2: Manual testing checklist**

Run `cargo tauri dev` and verify:

1. Onboarding flow: CLI detect → project init → sync → enters CLI UI
2. Title bar: project name shown, dropdown opens
3. CLI web UI: loads in iframe, interactive (click sidebar nav, etc.)
4. Project switch: dropdown → select different project → loading → CLI UI reloads
5. Projects page: navigate via gear icon, add/remove projects, back button
6. Global constraint: cannot add second global
7. Tray icon: Open App, Quick Sync still work
8. Window behavior: close hides to tray, reopen via tray

- [ ] **Step 3: Commit any remaining fixes and tag**

```bash
git add -A
git commit -m "fix: final integration fixes for thin shell refactor"
```
