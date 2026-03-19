# MCP HTTP Proxy + Actions Backend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Built-in Streamable HTTP MCP server (one URL replaces 20-30 min manual config) + complete the 13 unimplemented MCP Actions Tauri commands.

**Architecture:** axum 0.8 HTTP proxy inside Tauri app translates Streamable HTTP to stdio for existing `specforge-mcp` binary. MCP Actions backend adds Rust models, repository, and Tauri commands to match existing frontend contracts.

**Tech Stack:** Rust (axum 0.8, tokio, rustls, rcgen), Tauri 2, React/TypeScript, SQLite (rusqlite)

**Spec:** `docs/superpowers/specs/2026-03-17-mcp-http-proxy-design.md`

**Important codebase note:** `crate::models` resolves to `specforge_lib::models` (via `pub use specforge_lib::models;` in `lib.rs`). Local Tauri-specific models live under `crate::local_models`. MCP action models must go in `crates/specforge-lib/src/models/` so that existing service code (`crate::models::mcp_action::*`) compiles. Dependencies `uuid`, `chrono`, `rand`, `hex` are all already in Cargo.toml.

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `crates/specforge-lib/src/models/mcp_action.rs` | Rust types matching `src/types/mcp-action.ts` (shared lib, not Tauri-specific) |
| `src-tauri/src/repositories/mcp_action_repo.rs` | SQLite CRUD for actions, executions, permissions |
| `src-tauri/src/commands/mcp_actions.rs` | 13 Tauri command handlers |
| `src-tauri/src/services/http_proxy/mod.rs` | HTTP server start/stop/status |
| `src-tauri/src/services/http_proxy/config.rs` | ServerConfig struct + persistence |
| `src-tauri/src/services/http_proxy/proxy.rs` | StdioProxy -- manage mcp binary lifecycle |
| `src-tauri/src/services/http_proxy/tls.rs` | Self-signed cert via rcgen |
| `src-tauri/src/services/http_proxy/auth.rs` | Bearer token + localhost bypass |
| `src-tauri/src/services/http_proxy/routes.rs` | POST /mcp, GET /health |
| `src-tauri/src/commands/http_server.rs` | Tauri commands for HTTP server control |

### Modified Files
| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `rcgen`, `rustls`, `axum-server` deps |
| `crates/specforge-lib/src/utils/schema.rs` | Add MCP action tables to SCHEMA_V1, bump version to 2 |
| `crates/specforge-lib/src/models/mod.rs` | Add `pub mod mcp_action;` |
| `src-tauri/src/services/mod.rs` | Add `pub mod http_proxy;`, register `mcp_action` |
| `src-tauri/src/commands/mod.rs` | Add `pub mod mcp_actions;`, `pub mod http_server;` |
| `src-tauri/src/repositories/mod.rs` | Add `pub mod mcp_action_repo;` |
| `src-tauri/src/lib.rs` | Register 13+5 commands, managed state, setup/teardown hooks |
| `src/components/settings/panels/McpSettingsFullPanel.tsx` | URL-first MCP settings redesign |
| `src/components/settings/mcp/QuickSetupSection.tsx` | Simplify to URL-based setup |
| `src/components/onboarding/FirstRunWizard.tsx` | Add optional "Connect AI" step |

---

## Task 1: MCP Action Models

**Files:**
- Create: `crates/specforge-lib/src/models/mcp_action.rs`
- Modify: `crates/specforge-lib/src/models/mod.rs`

**Why specforge-lib?** `crate::models` resolves to `specforge_lib::models` via `pub use` in `src-tauri/src/lib.rs:17`. Existing service code at `src-tauri/src/services/mcp_action/{script,webhook,workflow}.rs` imports `crate::models::mcp_action::*`. Placing the model here makes those imports resolve correctly.

- [ ] **Step 1a: Create model file -- enums**

Create `crates/specforge-lib/src/models/mcp_action.rs` with `MCPActionType`, `PermissionLevel`, `ExecutionStatus` enums. Each with `Display` and `FromStr` impls for DB string conversion, and `serde(rename_all = "snake_case")`.

- [ ] **Step 1b: Create model file -- core entities**

Add to same file: `MCPAction`, `MCPActionPermission`, `MCPActionExecution`, `PendingActionRequest`, `ActionRequestResponse`. All with `serde(rename_all = "camelCase")` to match frontend. `PendingActionRequest` uses the `tauri-api.ts` definition (canonical): fields `execution_id`, `action_id: Option<String>`, `action_type: String`, `action_name`, `description: String`, `parameters: Option<Value>`, `source_client: Option<String>`, `started_at`. `ActionRequestResponse` uses `tauri-api.ts`: fields `execution_id`, `approved`, `status: String`.

- [ ] **Step 1c: Create model file -- config + result types**

Add: `ScriptConfig`, `MCPWebhookConfig` (NOT `WebhookConfig` -- must match frontend name and existing service imports), `WorkflowActionConfig`, `ScriptExecutionResult`, `WebhookExecutionResult`, `WorkflowExecutionResult`, `StepResult`. All matching `src/types/mcp-action.ts` lines 66-127.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptExecutionResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookExecutionResult {
    pub status_code: u16,
    pub response_body: Option<String>,
    pub response_headers: std::collections::HashMap<String, String>,
    pub duration_ms: i64,
    pub retry_attempts: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowExecutionResult {
    pub execution_id: String,
    pub status: String,
    pub steps_completed: u32,
    pub steps_total: u32,
    pub step_results: Vec<StepResult>,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub step_id: String,
    pub step_name: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub duration_ms: i64,
}
```

- [ ] **Step 2: Register module in specforge-lib models/mod.rs**

Add `pub mod mcp_action;` to `crates/specforge-lib/src/models/mod.rs`.

- [ ] **Step 3: Verify it compiles**

Run: `cd crates/specforge-lib && cargo check`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add crates/specforge-lib/src/models/mcp_action.rs crates/specforge-lib/src/models/mod.rs
git commit -m "feat(models): add MCP action types matching frontend contracts"
```

---

## Task 2: Database Schema -- Add MCP Action Tables

**Files:**
- Modify: `crates/specforge-lib/src/utils/schema.rs`

- [ ] **Step 1: Add MCP action tables to SCHEMA_V1**

In `schema.rs`, add tables before the `---- Indexes` section (before line 159). Column names use `snake_case` in DB, serde converts to `camelCase` for frontend.

```sql
    -- MCP Actions
    CREATE TABLE IF NOT EXISTS mcp_actions (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        config TEXT NOT NULL,
        project_id TEXT,
        is_enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_action_executions (
        id TEXT PRIMARY KEY,
        action_id TEXT REFERENCES mcp_actions(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL,
        action_name TEXT NOT NULL,
        source_client TEXT,
        parameters TEXT,
        status TEXT NOT NULL,
        result TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS mcp_action_permissions (
        id TEXT PRIMARY KEY,
        action_id TEXT REFERENCES mcp_actions(id) ON DELETE CASCADE,
        action_type TEXT,
        permission_level TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
```

Add indexes:

```sql
    CREATE INDEX IF NOT EXISTS idx_mcp_actions_type ON mcp_actions(action_type);
    CREATE INDEX IF NOT EXISTS idx_mcp_actions_project ON mcp_actions(project_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_executions_action ON mcp_action_executions(action_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_executions_status ON mcp_action_executions(status);
    CREATE INDEX IF NOT EXISTS idx_mcp_permissions_action ON mcp_action_permissions(action_id);
```

Note: `is_enabled INTEGER` maps to `isEnabled: boolean` in TS. Repository layer handles i32-to-bool via `row.get::<_, i32>(col) != 0`. `config TEXT` stores JSON; `action_type` column is the discriminator for deserializing into the correct config struct.

- [ ] **Step 2: Bump CURRENT_VERSION to 2**

Change line 7: `pub const CURRENT_VERSION: i32 = 2;`
This triggers drop-and-recreate for any existing dev databases (no real users yet).

- [ ] **Step 3: Update test to include new tables**

Add to `test_fresh_schema()`:
```rust
        assert!(table_exists(&conn, "mcp_actions").unwrap());
        assert!(table_exists(&conn, "mcp_action_executions").unwrap());
        assert!(table_exists(&conn, "mcp_action_permissions").unwrap());
```

- [ ] **Step 4: Run tests**

Run: `cd crates/specforge-lib && cargo test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add crates/specforge-lib/src/utils/schema.rs
git commit -m "feat(schema): add MCP action tables (actions, executions, permissions)"
```

---

## Task 3: MCP Action Repository

**Files:**
- Create: `src-tauri/src/repositories/mcp_action_repo.rs`
- Modify: `src-tauri/src/repositories/mod.rs`

Pattern: standalone functions taking `&rusqlite::Connection`. Tauri commands call `db.0.with_connection(|conn| repo_fn(conn, ...))`. Use `uuid::Uuid::new_v4().to_string()` for IDs, `chrono::Utc::now().to_rfc3339()` for timestamps.

- [ ] **Step 1a: Action CRUD (5 functions)**

`list_actions`, `get_action`, `create_action`, `update_action`, `delete_action`. Row mapping: read each column by index, parse `action_type` via `FromStr`, map `is_enabled` i32->bool, parse `config` as `serde_json::Value`.

- [ ] **Step 1b: Execution queries (3 functions)**

`list_executions` (with optional filters + limit), `get_execution`, `cleanup_executions` (delete by `keep_count` or `max_age_days`, return deleted count).

- [ ] **Step 1c: Permission CRUD (3 functions)**

`list_permissions` (global, no filter param), `update_permission` (upsert: action_id + action_type combo), `delete_permission`.

- [ ] **Step 1d: Pending requests (2 functions)**

`get_pending_requests`: `SELECT e.*, a.name as action_name FROM mcp_action_executions e LEFT JOIN mcp_actions a ON e.action_id = a.id WHERE e.status = 'pending_confirm'`.
`respond_to_request`: update execution status to `completed`/`denied` based on `approved`, return `ActionRequestResponse`.

- [ ] **Step 1e: Unit tests**

In-memory SQLite tests: create schema, insert action, list, update, delete. Test execution lifecycle: create execution with `pending_confirm`, respond, verify status change. Test permission upsert idempotency.

- [ ] **Step 2: Register in repositories/mod.rs**

Add `pub mod mcp_action_repo;`.

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test -- mcp_action`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/repositories/mcp_action_repo.rs src-tauri/src/repositories/mod.rs
git commit -m "feat(repo): add MCP action repository with full CRUD and tests"
```

---

## Task 4: MCP Action Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/mcp_actions.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Create 13 command handlers**

Each command: extract `DatabaseState`, call `db.0.with_connection(|conn| ...)`, delegate to repository. Signatures match `tauri-api.ts` lines 1437-1518 exactly. See spec for full list.

- [ ] **Step 2: Register module in commands/mod.rs**

Add `pub mod mcp_actions;`.

- [ ] **Step 3: Register 13 commands in lib.rs invoke_handler**

After line 245 (`clear_mcp_logs`), add all 13 `mcp_actions::*` commands.

- [ ] **Step 4: Wire up mcp_action services in services/mod.rs**

Add `pub mod mcp_action;` to `src-tauri/src/services/mod.rs`. This un-deadcodes the existing executor implementations.

**Note:** Both this task and Task 5 modify `services/mod.rs`. If running in parallel, merge carefully.

- [ ] **Step 5: Verify full compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles. Existing `services/mcp_action/` imports resolve via `crate::models::mcp_action` -> `specforge_lib::models::mcp_action`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/mcp_actions.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/src/services/mod.rs
git commit -m "feat(mcp-actions): implement 13 Tauri commands with full CRUD"
```

---

## Task 5: HTTP Proxy -- Dependencies + Config + Persistence

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/services/http_proxy/mod.rs`
- Create: `src-tauri/src/services/http_proxy/config.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Add dependencies to Cargo.toml**

```toml
rcgen = "0.13"
axum-server = { version = "0.7", features = ["tls-rustls"] }
rustls = "0.23"
```

Verify `axum-server 0.7` is compatible with `axum 0.8`: check crates.io for peer dep. If incompatible, use the version that matches.

- [ ] **Step 2: Create config.rs with persistence**

`ServerConfig` struct (port, lan_mode, tls_enabled, bearer_token). Includes `load(conn)` and `save(conn)` functions that read/write JSON to the `settings` key-value table (key: `"http_server_config"`). Default: port 19532, lan_mode false.

- [ ] **Step 3: Create mod.rs stub**

```rust
pub mod config;
// Remaining modules added in subsequent tasks
```

- [ ] **Step 4: Register in services/mod.rs**

Add `pub mod http_proxy;`.

**Note:** Task 4 also modifies this file. If parallel, merge the two `pub mod` additions.

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/services/http_proxy/ src-tauri/src/services/mod.rs
git commit -m "feat(http-proxy): add dependencies, ServerConfig with persistence"
```

---

## Task 6: HTTP Proxy -- StdioProxy

**Files:**
- Create: `src-tauri/src/services/http_proxy/proxy.rs`
- Modify: `src-tauri/src/services/http_proxy/mod.rs`

- [ ] **Step 1: Implement StdioProxy**

- `StdioProxy::new(binary_path)` -- stores path
- `StdioProxy::start()` -- spawns `tokio::process::Command`, captures stdin/stdout
- `StdioProxy::send(json_rpc_request) -> Result<Value>` -- acquires `tokio::sync::Mutex`, writes to stdin + `\n`, reads line from stdout, parses JSON-RPC response
- `StdioProxy::health() -> bool` -- child alive check
- `StdioProxy::stop()` -- SIGTERM, wait 2s, force kill

v1: Serialized access (one request at a time through Mutex). JSON-RPC `id` set for protocol compliance. Auto-respawn on stdout EOF: max 3 retries per crash event, 1s interval, counter resets after 60s healthy. In-flight request at crash time gets `Err("MCP server unavailable")`.

- [ ] **Step 2: Unit test for proxy**

Test JSON-RPC message framing: mock a child process that echoes responses. Test respawn counter reset logic.

- [ ] **Step 3: Add to mod.rs, verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/http_proxy/proxy.rs src-tauri/src/services/http_proxy/mod.rs
git commit -m "feat(http-proxy): implement StdioProxy with auto-respawn"
```

---

## Task 7: HTTP Proxy -- Auth + TLS

**Files:**
- Create: `src-tauri/src/services/http_proxy/auth.rs`
- Create: `src-tauri/src/services/http_proxy/tls.rs`
- Modify: `src-tauri/src/services/http_proxy/mod.rs`

- [ ] **Step 1: Implement auth.rs**

- `generate_token() -> String` -- 32 random bytes via `rand::thread_rng()`, hex-encoded via `hex::encode()` (both crates already in Cargo.toml)
- `validate_request(remote_addr, headers, config) -> Result<(), AuthError>`:
  1. `remote_addr` is `127.0.0.1` or `::1` -> Ok (bypass)
  2. `config.lan_mode == false` -> Err(Forbidden)
  3. Check `Authorization: Bearer {token}` -> match -> Ok, else Err(Unauthorized)
- `regenerate_token(conn) -> String` -- generate new token, persist to settings table

- [ ] **Step 2: Unit tests for auth**

Test: localhost bypass (both IPv4/IPv6), LAN disabled rejection, valid token, invalid token, missing header.

- [ ] **Step 3: Implement tls.rs**

- `generate_self_signed_cert(data_dir, lan_ips) -> Result<(PathBuf, PathBuf)>` -- `rcgen` CA + server cert, SAN with all `lan_ips`
- `load_tls_config(cert_path, key_path) -> Result<rustls::ServerConfig>`
- `get_lan_ips() -> Vec<IpAddr>` -- enumerate network interfaces
- Cert stored in `{data_dir}/tls/ca.pem`, `{data_dir}/tls/server.pem`, `{data_dir}/tls/server.key`
- `needs_regeneration(cert_path, current_ips) -> bool` -- check if SAN matches current IPs

- [ ] **Step 4: Add to mod.rs, verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/http_proxy/auth.rs src-tauri/src/services/http_proxy/tls.rs src-tauri/src/services/http_proxy/mod.rs
git commit -m "feat(http-proxy): add Bearer auth with tests and self-signed TLS"
```

---

## Task 8: HTTP Proxy -- Routes + Server Lifecycle

**Files:**
- Create: `src-tauri/src/services/http_proxy/routes.rs`
- Modify: `src-tauri/src/services/http_proxy/mod.rs`

- [ ] **Step 1: Implement routes.rs**

`GET /health` -- `{"status":"ok","version":"...","uptime_seconds":N}`

`POST /mcp` -- Streamable HTTP:
1. Extract `remote_addr` from connection info
2. Call `auth::validate_request()`; on failure return HTTP 401/403 with JSON-RPC error body
3. Parse JSON body
4. Call `StdioProxy::send()`:
   - On success -> HTTP 200, `Content-Type: application/json`, JSON-RPC response
   - On proxy unavailable -> HTTP 503, JSON-RPC error `{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"MCP server unavailable"}}`
   - On proxy timeout -> HTTP 504, similar error

- [ ] **Step 2: Implement server lifecycle in mod.rs**

Exports:
- `start_server(config, binary_path, data_dir) -> Result<ServerHandle>` -- build axum Router with CORS (tower-http), start on configured port. Port fallback: try `port` through `port+9` on bind failure, log actual port. If LAN mode: generate/load cert, bind with `axum_server::bind_rustls()`. Store `StdioProxy` + `ServerConfig` in `Arc<AppState>`.
- `stop_server(handle)` -- stop accepting new connections, wait up to 5s for in-flight requests, then `StdioProxy::stop()` (SIGTERM, 2s, force kill)
- `server_status(handle) -> ServerStatus` -- running/stopped/error + actual port + uptime
- `auto_start(app_handle)` -- load config from DB, resolve binary path, call `start_server()`

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/http_proxy/routes.rs src-tauri/src/services/http_proxy/mod.rs
git commit -m "feat(http-proxy): add /mcp and /health routes with 503 handling and server lifecycle"
```

---

## Task 9: HTTP Server Tauri Commands + App Integration

**Files:**
- Create: `src-tauri/src/commands/http_server.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create 5 command handlers**

```rust
start_http_server(app) -> Result<ServerStatus, String>
stop_http_server(app) -> Result<(), String>
get_http_server_status(app) -> Result<ServerStatus, String>
regenerate_http_token(app) -> Result<String, String>  // returns new token
get_tls_ca_cert_path(app) -> Result<Option<String>, String>  // for cert download
```

Uses Tauri managed state `HttpServerState(Arc<Mutex<Option<ServerHandle>>>)`.

- [ ] **Step 2: Register in commands/mod.rs and lib.rs**

Add `pub mod http_server;` to `commands/mod.rs`.
Add all 5 commands to `invoke_handler`.
Add `.manage(HttpServerState::default())`.

- [ ] **Step 3: Auto-start in setup hook**

In `lib.rs` `.setup()` after line 286:
```rust
            let app_handle = app.handle().clone();
            tokio::spawn(async move {
                if let Err(e) = services::http_proxy::auto_start(&app_handle).await {
                    log::warn!("[setup] Failed to start HTTP proxy: {}", e);
                }
            });
```

- [ ] **Step 4: Graceful shutdown on app close**

Register a Tauri `on_window_event` or `RunEvent::Exit` handler that calls `stop_server()`:
```rust
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // trigger graceful HTTP server shutdown
            }
        })
```

- [ ] **Step 5: Verify full build**

Run: `cd src-tauri && cargo build`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/http_server.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(http-proxy): add Tauri commands, auto-start, graceful shutdown"
```

---

## Task 10: Frontend -- MCP Settings Redesign

**Files:**
- Modify: `src/components/settings/panels/McpSettingsFullPanel.tsx`
- Modify: `src/components/settings/mcp/QuickSetupSection.tsx`
- Create or modify: `src/hooks/useHttpServerStatus.ts` (or inline)

- [ ] **Step 1: Create HTTP server status hook**

Hook calls `get_http_server_status` on mount and polls every 5s. Exposes `{ status, port, url, lanUrl, token, isRunning, error }`.

- [ ] **Step 2: Redesign overview tab -- status + URL**

At top of McpSettingsFullPanel overview:
- Server status dot (green/gray/red) + text
- URL display: `http://localhost:{port}/mcp` with [Copy] button
- LAN URL (if LAN mode on): `https://{ip}:{port}/mcp` with [Copy] button

- [ ] **Step 3: Redesign overview tab -- Quick Setup grid**

6 client buttons in 2x3 grid. Click expands to show one-line command:
- Claude Code: `claude mcp add specforge --url http://localhost:{port}/mcp`
- Claude Desktop: "Settings -> Integrations -> paste URL"
- VS Code: JSON snippet for `mcp.json`
- Continue / Cline / Codex / Gemini: one-liner each
Each with [Copy] button.

- [ ] **Step 4: Add Advanced section**

- Port input field (save calls `stop_http_server` + `start_http_server` with new port)
- LAN Access toggle
- Token display + [Regenerate] button (calls `regenerate_http_token`)
- [Download CA Certificate] button (calls `get_tls_ca_cert_path`, opens file location)

- [ ] **Step 5: Add Diagnostics section**

- [Test Connection] button: `curl`-equivalent to `/health`
- Last request timestamp (from server status)
- Active sessions count

- [ ] **Step 6: Verify frontend builds**

Run: `pnpm build`

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/ src/hooks/
git commit -m "feat(ui): redesign MCP settings with URL-first setup"
```

---

## Task 11: Frontend -- Onboarding + Status

**Files:**
- Modify: `src/components/onboarding/FirstRunWizard.tsx`
- Modify: `src/App.tsx` (or relevant layout component)

- [ ] **Step 1: Add optional "Connect AI" step to wizard**

After "Done" step, new optional step:
- Title: "Connect AI Tools"
- MCP URL with [Copy] button
- Top 2 clients (Claude Code + VS Code) with one-line commands
- [Skip] and [Done] buttons (both proceed)

- [ ] **Step 2: Add MCP status indicator to app**

In header/status bar:
- Small dot + "MCP: Running" / "Stopped" / "Error"
- Click opens MCP Settings panel
- Uses `useHttpServerStatus` hook from Task 10

- [ ] **Step 3: Verify frontend builds**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/FirstRunWizard.tsx src/App.tsx
git commit -m "feat(ui): add AI setup step to onboarding and MCP status indicator"
```

---

## Task 12: Integration Testing

- [ ] **Step 1: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All pass (schema, repository, auth, proxy tests).

- [ ] **Step 2: Run full Rust build**

Run: `cd src-tauri && cargo build`
Expected: Clean build.

- [ ] **Step 3: Run frontend build**

Run: `pnpm build`
Expected: No TypeScript errors.

- [ ] **Step 4: Manual smoke test**

1. Launch app -> check logs: `[setup] HTTP proxy started on port 19532`
2. `curl http://localhost:19532/health` -> 200 OK with JSON
3. `curl -X POST http://localhost:19532/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` -> valid JSON-RPC response
4. Settings -> MCP -> URL displayed, copy works
5. Settings -> MCP -> Actions tab -> create/list/delete action works
6. Onboarding wizard -> "Connect AI" step appears after init

- [ ] **Step 5: Commit any fixes**

```bash
git commit -m "fix: integration testing fixes"
```

---

## Dependency Graph

```
Task 1 (Models, specforge-lib) ──┐
                                  ├──> Task 3 (Repository) ──> Task 4 (Tauri Commands)
Task 2 (Schema) ─────────────────┘

Task 5 (Deps+Config) ──> Task 6 (StdioProxy) ──> Task 7 (Auth+TLS) ──> Task 8 (Routes) ──> Task 9 (App Integration)

Task 4 + Task 9 ──> Task 10 (UI Settings) ──> Task 11 (Onboarding) ──> Task 12 (Testing)
```

**Parallelizable:**
- Tasks 1 + 2 (no shared files)
- Tasks 3-4 chain + Tasks 5-8 chain (independent subsystems)
- **Merge point:** Tasks 4 and 5 both add `pub mod` to `services/mod.rs` -- merge carefully if parallel
