// Monorepo Tool Support Commands
// Feature: 008-monorepo-support

use crate::commands::project::parse_package_json;
use crate::commands::version::detect_volta;
use crate::models::{
    BatchCompletedPayload, BatchExecutionResult, BatchProgressPayload, ClearNxCacheResponse,
    ClearTurboCacheResponse, DependencyEdge, DependencyGraph, DependencyNode,
    DetectMonorepoToolsResponse, GetDependencyGraphResponse, GetNxCacheStatusResponse,
    GetNxTargetsResponse, GetTurboCacheStatusResponse, GetTurboPipelinesResponse, MonorepoToolInfo,
    MonorepoToolType, NxCacheStatus, NxTarget, RunBatchScriptsResponse, RunNxCommandResponse,
    RunTurboCommandResponse, TurboCacheStatus, TurboPipeline,
};
use crate::utils::path_resolver;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

// ============================================================================
// Helper: Get command with Volta wrapper if applicable
// ============================================================================

/// Create a Command with proper environment for macOS GUI apps
fn create_env_command(cmd: &str) -> std::process::Command {
    let mut command = std::process::Command::new(cmd);

    // Set essential environment variables for macOS GUI apps
    if let Some(home) = path_resolver::get_home_dir() {
        command.env("HOME", &home);
    }
    command.env("PATH", path_resolver::get_path());
    if let Some(sock) = path_resolver::get_ssh_auth_sock() {
        command.env("SSH_AUTH_SOCK", &sock);
    }
    command.env("LANG", "en_US.UTF-8");
    command.env("LC_ALL", "en_US.UTF-8");

    command
}

/// Returns (command, args) with version manager wrapper based on project config
/// Priority: Volta > Corepack > direct execution
/// Uses path_resolver to ensure commands work in macOS GUI apps
pub fn get_volta_wrapped_command(
    project_path: &Path,
    base_command: &str,
    base_args: Vec<String>,
) -> (String, Vec<String>) {
    // Parse package.json to check for version manager configs
    let (has_volta_config, has_package_manager_field) = match parse_package_json(project_path) {
        Ok(pj) => (pj.volta.is_some(), pj.package_manager.is_some()),
        Err(_) => (false, false),
    };

    // Priority 1: Volta - use `volta run` for explicit version control
    // This works even if Volta shims are overwritten by Corepack
    if has_volta_config {
        let volta_status = detect_volta();
        if volta_status.available {
            let volta_command = volta_status
                .path
                .unwrap_or_else(|| path_resolver::get_tool_path("volta"));
            let mut volta_args = vec!["run".to_string(), base_command.to_string()];
            volta_args.extend(base_args);
            println!(
                "[version-manager] Using Volta: {} run {} ...",
                volta_command, base_command
            );
            return (volta_command, volta_args);
        }
    }

    // Priority 2: Corepack - packageManager field is present
    // Corepack automatically handles version via shims, no wrapper needed
    // Just execute the command directly and Corepack will intercept
    if has_package_manager_field {
        println!("[version-manager] Using Corepack (packageManager field detected)");
        // Corepack works via shims, so we just run the command normally
        return (path_resolver::get_tool_path(base_command), base_args);
    }

    // No version manager config, use direct execution
    println!("[version-manager] No version manager config, using direct execution");
    (path_resolver::get_tool_path(base_command), base_args)
}

// ============================================================================
// Tool Detection Commands
// ============================================================================

/// Detect monorepo tools in the project directory (fast - no version checks)
/// This is optimized for quick detection by only checking config files.
/// Use `get_tool_version` to lazily fetch versions when needed.
#[tauri::command]
pub fn detect_monorepo_tools(project_path: String) -> DetectMonorepoToolsResponse {
    let path = Path::new(&project_path);

    if !path.exists() {
        return DetectMonorepoToolsResponse {
            success: false,
            tools: None,
            primary: None,
            error: Some("INVALID_PATH".to_string()),
        };
    }

    if !path.is_dir() {
        return DetectMonorepoToolsResponse {
            success: false,
            tools: None,
            primary: None,
            error: Some("NOT_A_DIRECTORY".to_string()),
        };
    }

    let mut tools: Vec<MonorepoToolInfo> = Vec::new();
    let mut primary: Option<MonorepoToolType> = None;

    // Check for Nx (fast - file existence only)
    let nx_json = path.join("nx.json");
    if nx_json.exists() {
        tools.push(MonorepoToolInfo {
            tool_type: MonorepoToolType::Nx,
            version: None, // Lazy loaded via get_tool_version
            config_path: "nx.json".to_string(),
            is_available: true, // Assume available if config exists
        });
        if primary.is_none() {
            primary = Some(MonorepoToolType::Nx);
        }
    }

    // Check for Turborepo (fast - file existence only)
    let turbo_json = path.join("turbo.json");
    if turbo_json.exists() {
        tools.push(MonorepoToolInfo {
            tool_type: MonorepoToolType::Turbo,
            version: None, // Lazy loaded via get_tool_version
            config_path: "turbo.json".to_string(),
            is_available: true, // Assume available if config exists
        });
        if primary.is_none() {
            primary = Some(MonorepoToolType::Turbo);
        }
    }

    // Check for Lerna (fast - file existence only)
    let lerna_json = path.join("lerna.json");
    if lerna_json.exists() {
        tools.push(MonorepoToolInfo {
            tool_type: MonorepoToolType::Lerna,
            version: None, // Lazy loaded via get_tool_version
            config_path: "lerna.json".to_string(),
            is_available: true, // Assume available if config exists
        });
        if primary.is_none() {
            primary = Some(MonorepoToolType::Lerna);
        }
    }

    // Check for standard workspaces (pnpm-workspace.yaml or package.json workspaces)
    let pnpm_workspace = path.join("pnpm-workspace.yaml");
    let package_json = path.join("package.json");

    if pnpm_workspace.exists() {
        tools.push(MonorepoToolInfo {
            tool_type: MonorepoToolType::Workspaces,
            version: None,
            config_path: "pnpm-workspace.yaml".to_string(),
            is_available: true,
        });
        if primary.is_none() {
            primary = Some(MonorepoToolType::Workspaces);
        }
    } else if package_json.exists() {
        if let Ok(content) = fs::read_to_string(&package_json) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                if json.get("workspaces").is_some() {
                    tools.push(MonorepoToolInfo {
                        tool_type: MonorepoToolType::Workspaces,
                        version: None,
                        config_path: "package.json".to_string(),
                        is_available: true,
                    });
                    if primary.is_none() {
                        primary = Some(MonorepoToolType::Workspaces);
                    }
                }
            }
        }
    }

    // If no tools found, mark as unknown
    if tools.is_empty() {
        primary = Some(MonorepoToolType::Unknown);
    }

    DetectMonorepoToolsResponse {
        success: true,
        tools: Some(tools),
        primary,
        error: None,
    }
}

/// Get tool version lazily (call this when you need to display version info)
#[tauri::command]
pub async fn get_tool_version(
    project_path: String,
    tool_type: String,
) -> Result<Option<String>, String> {
    let version = match tool_type.as_str() {
        "nx" => get_nx_version(&project_path),
        "turbo" => get_turbo_version(&project_path),
        "lerna" => get_lerna_version(&project_path),
        _ => None,
    };
    Ok(version)
}

// ============================================================================
// Nx Commands
// ============================================================================

/// Get Nx targets from the workspace
#[tauri::command]
pub fn get_nx_targets(project_path: String) -> GetNxTargetsResponse {
    let path = Path::new(&project_path);

    if !path.exists() || !path.is_dir() {
        return GetNxTargetsResponse {
            success: false,
            targets: None,
            error: Some("INVALID_PATH".to_string()),
        };
    }

    // Check if nx.json exists
    if !path.join("nx.json").exists() {
        return GetNxTargetsResponse {
            success: false,
            targets: None,
            error: Some("NX_NOT_FOUND".to_string()),
        };
    }

    // Try to get targets from nx show projects command
    let output = path_resolver::create_command("npx")
        .args(["nx", "show", "projects", "--json"])
        .current_dir(&project_path)
        .output();

    match output {
        Ok(result) => {
            if !result.status.success() {
                return GetNxTargetsResponse {
                    success: false,
                    targets: None,
                    error: Some("EXECUTION_ERROR".to_string()),
                };
            }

            let stdout = String::from_utf8_lossy(&result.stdout);
            let projects: Vec<String> = match serde_json::from_str(&stdout) {
                Ok(p) => p,
                Err(_) => {
                    return GetNxTargetsResponse {
                        success: false,
                        targets: None,
                        error: Some("PARSE_ERROR".to_string()),
                    };
                }
            };

            // Common Nx targets
            let common_targets = vec!["build", "test", "lint", "serve", "e2e"];
            let mut targets: Vec<NxTarget> = Vec::new();

            for target_name in common_targets {
                targets.push(NxTarget {
                    name: target_name.to_string(),
                    projects: projects.clone(),
                    cached: target_name != "serve" && target_name != "e2e",
                });
            }

            GetNxTargetsResponse {
                success: true,
                targets: Some(targets),
                error: None,
            }
        }
        Err(_) => GetNxTargetsResponse {
            success: false,
            targets: None,
            error: Some("EXECUTION_ERROR".to_string()),
        },
    }
}

/// Run an Nx command
#[tauri::command]
pub async fn run_nx_command(
    app: AppHandle,
    project_path: String,
    command: String,
    target: String,
    project: Option<String>,
    projects: Option<Vec<String>>,
    base: Option<String>,
    parallel: Option<u32>,
) -> RunNxCommandResponse {
    let path = Path::new(&project_path);

    if !path.exists() || !path.is_dir() {
        return RunNxCommandResponse {
            success: false,
            execution_id: None,
            error: Some("INVALID_PATH".to_string()),
        };
    }

    if !path.join("nx.json").exists() {
        return RunNxCommandResponse {
            success: false,
            execution_id: None,
            error: Some("NX_NOT_FOUND".to_string()),
        };
    }

    let execution_id = Uuid::new_v4().to_string();
    let mut args: Vec<String> = vec!["nx".to_string()];

    match command.as_str() {
        "run" => {
            if let Some(proj) = project {
                args.push("run".to_string());
                args.push(format!("{}:{}", proj, target));
            } else {
                return RunNxCommandResponse {
                    success: false,
                    execution_id: None,
                    error: Some("INVALID_PARAMS".to_string()),
                };
            }
        }
        "affected" => {
            args.push("affected".to_string());
            args.push("-t".to_string());
            args.push(target.clone());
            if let Some(b) = base {
                args.push(format!("--base={}", b));
            }
        }
        "run-many" => {
            args.push("run-many".to_string());
            args.push("-t".to_string());
            args.push(target.clone());
            if let Some(projs) = projects {
                args.push("-p".to_string());
                args.push(projs.join(","));
            }
        }
        _ => {
            return RunNxCommandResponse {
                success: false,
                execution_id: None,
                error: Some("INVALID_PARAMS".to_string()),
            };
        }
    }

    if let Some(p) = parallel {
        args.push(format!("--parallel={}", p));
    }

    // Get Volta-wrapped command if applicable
    let (cmd, cmd_args) = get_volta_wrapped_command(path, "npx", args);

    // Execute command in background
    let exec_id = execution_id.clone();
    let project_path_clone = project_path.clone();

    std::thread::spawn(move || {
        let output = create_env_command(&cmd)
            .args(&cmd_args)
            .current_dir(&project_path_clone)
            .output();

        match output {
            Ok(result) => {
                let stdout = String::from_utf8_lossy(&result.stdout).to_string();
                let stderr = String::from_utf8_lossy(&result.stderr).to_string();

                // Emit output events
                let _ = app.emit(
                    "script_output",
                    serde_json::json!({
                        "executionId": exec_id,
                        "output": stdout,
                        "stream": "stdout",
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    }),
                );

                if !stderr.is_empty() {
                    let _ = app.emit(
                        "script_output",
                        serde_json::json!({
                            "executionId": exec_id,
                            "output": stderr,
                            "stream": "stderr",
                            "timestamp": chrono::Utc::now().to_rfc3339()
                        }),
                    );
                }

                // Emit completion event
                let _ = app.emit(
                    "script_completed",
                    serde_json::json!({
                        "executionId": exec_id,
                        "exitCode": result.status.code().unwrap_or(-1),
                        "success": result.status.success(),
                        "durationMs": 0
                    }),
                );
            }
            Err(_) => {
                let _ = app.emit(
                    "script_completed",
                    serde_json::json!({
                        "executionId": exec_id,
                        "exitCode": -1,
                        "success": false,
                        "durationMs": 0
                    }),
                );
            }
        }
    });

    RunNxCommandResponse {
        success: true,
        execution_id: Some(execution_id),
        error: None,
    }
}

// ============================================================================
// Turborepo Commands
// ============================================================================

/// Get Turborepo pipelines from turbo.json
#[tauri::command]
pub fn get_turbo_pipelines(project_path: String) -> GetTurboPipelinesResponse {
    let path = Path::new(&project_path);
    let turbo_json = path.join("turbo.json");

    if !turbo_json.exists() {
        return GetTurboPipelinesResponse {
            success: false,
            pipelines: None,
            error: Some("TURBO_NOT_FOUND".to_string()),
        };
    }

    let content = match fs::read_to_string(&turbo_json) {
        Ok(c) => c,
        Err(_) => {
            return GetTurboPipelinesResponse {
                success: false,
                pipelines: None,
                error: Some("PARSE_ERROR".to_string()),
            };
        }
    };

    let json: Value = match serde_json::from_str(&content) {
        Ok(j) => j,
        Err(_) => {
            return GetTurboPipelinesResponse {
                success: false,
                pipelines: None,
                error: Some("PARSE_ERROR".to_string()),
            };
        }
    };

    let mut pipelines: Vec<TurboPipeline> = Vec::new();

    // Turbo v2 uses "tasks", v1 uses "pipeline"
    let tasks = json.get("tasks").or_else(|| json.get("pipeline"));

    if let Some(Value::Object(task_map)) = tasks {
        for (name, config) in task_map {
            let depends_on = config.get("dependsOn").and_then(|d| {
                d.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
            });

            let cache = config
                .get("cache")
                .and_then(|c| c.as_bool())
                .unwrap_or(true);

            let outputs = config.get("outputs").and_then(|o| {
                o.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
            });

            let inputs = config.get("inputs").and_then(|i| {
                i.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
            });

            pipelines.push(TurboPipeline {
                name: name.clone(),
                depends_on,
                cache,
                outputs,
                inputs,
            });
        }
    }

    GetTurboPipelinesResponse {
        success: true,
        pipelines: Some(pipelines),
        error: None,
    }
}

/// Run a Turborepo command
#[tauri::command]
pub async fn run_turbo_command(
    app: AppHandle,
    project_path: String,
    task: String,
    filter: Option<Vec<String>>,
    force: Option<bool>,
    dry_run: Option<bool>,
    concurrency: Option<u32>,
) -> RunTurboCommandResponse {
    let path = Path::new(&project_path);

    if !path.exists() || !path.is_dir() {
        return RunTurboCommandResponse {
            success: false,
            execution_id: None,
            error: Some("INVALID_PATH".to_string()),
        };
    }

    if !path.join("turbo.json").exists() {
        return RunTurboCommandResponse {
            success: false,
            execution_id: None,
            error: Some("TURBO_NOT_FOUND".to_string()),
        };
    }

    let execution_id = Uuid::new_v4().to_string();
    let mut args: Vec<String> = vec!["turbo".to_string(), "run".to_string(), task];

    if let Some(filters) = filter {
        for f in filters {
            args.push(format!("--filter={}", f));
        }
    }

    if force.unwrap_or(false) {
        args.push("--force".to_string());
    }

    if dry_run.unwrap_or(false) {
        args.push("--dry-run".to_string());
    }

    if let Some(c) = concurrency {
        args.push(format!("--concurrency={}", c));
    }

    // Get Volta-wrapped command if applicable
    let (cmd, cmd_args) = get_volta_wrapped_command(path, "npx", args);

    // Execute command in background
    let exec_id = execution_id.clone();
    let project_path_clone = project_path.clone();

    std::thread::spawn(move || {
        let output = create_env_command(&cmd)
            .args(&cmd_args)
            .current_dir(&project_path_clone)
            .output();

        match output {
            Ok(result) => {
                let stdout = String::from_utf8_lossy(&result.stdout).to_string();
                let stderr = String::from_utf8_lossy(&result.stderr).to_string();

                let _ = app.emit(
                    "script_output",
                    serde_json::json!({
                        "executionId": exec_id,
                        "output": stdout,
                        "stream": "stdout",
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    }),
                );

                if !stderr.is_empty() {
                    let _ = app.emit(
                        "script_output",
                        serde_json::json!({
                            "executionId": exec_id,
                            "output": stderr,
                            "stream": "stderr",
                            "timestamp": chrono::Utc::now().to_rfc3339()
                        }),
                    );
                }

                let _ = app.emit(
                    "script_completed",
                    serde_json::json!({
                        "executionId": exec_id,
                        "exitCode": result.status.code().unwrap_or(-1),
                        "success": result.status.success(),
                        "durationMs": 0
                    }),
                );
            }
            Err(_) => {
                let _ = app.emit(
                    "script_completed",
                    serde_json::json!({
                        "executionId": exec_id,
                        "exitCode": -1,
                        "success": false,
                        "durationMs": 0
                    }),
                );
            }
        }
    });

    RunTurboCommandResponse {
        success: true,
        execution_id: Some(execution_id),
        error: None,
    }
}

/// Get Turborepo cache status
#[tauri::command]
pub fn get_turbo_cache_status(project_path: String) -> GetTurboCacheStatusResponse {
    let path = Path::new(&project_path);

    if !path.join("turbo.json").exists() {
        return GetTurboCacheStatusResponse {
            success: false,
            status: None,
            error: Some("TURBO_NOT_FOUND".to_string()),
        };
    }

    // Check multiple possible cache locations
    // Turbo v1.10+: .turbo/cache/
    // Turbo v1.9 and earlier: node_modules/.cache/turbo/
    let cache_locations = [
        path.join(".turbo").join("cache"),
        path.join(".turbo"),
        path.join("node_modules").join(".cache").join("turbo"),
    ];

    let mut total_size: u64 = 0;
    let mut total_entries: u32 = 0;
    let mut found_cache = false;

    for cache_path in &cache_locations {
        if cache_path.exists() {
            found_cache = true;
            total_size += get_dir_size(cache_path);
            total_entries += count_cache_entries(cache_path);
        }
    }

    if !found_cache {
        return GetTurboCacheStatusResponse {
            success: true,
            status: Some(TurboCacheStatus {
                total_size: "0 B".to_string(),
                hit_rate: 0.0,
                entries: Some(0),
                last_cleared: None,
            }),
            error: None,
        };
    }

    GetTurboCacheStatusResponse {
        success: true,
        status: Some(TurboCacheStatus {
            total_size: format_size(total_size),
            hit_rate: 0.0, // This would require parsing turbo run output
            entries: Some(total_entries),
            last_cleared: None,
        }),
        error: None,
    }
}

/// Clear Turborepo cache
#[tauri::command]
pub fn clear_turbo_cache(project_path: String) -> ClearTurboCacheResponse {
    let path = Path::new(&project_path);

    if !path.join("turbo.json").exists() {
        return ClearTurboCacheResponse {
            success: false,
            error: Some("TURBO_NOT_FOUND".to_string()),
        };
    }

    // Clear all possible cache locations
    let cache_locations = [
        path.join(".turbo"),
        path.join("node_modules").join(".cache").join("turbo"),
    ];

    let mut cleared_any = false;
    for cache_path in &cache_locations {
        if cache_path.exists() {
            if let Err(_) = fs::remove_dir_all(cache_path) {
                return ClearTurboCacheResponse {
                    success: false,
                    error: Some("PERMISSION_DENIED".to_string()),
                };
            }
            cleared_any = true;
        }
    }

    ClearTurboCacheResponse {
        success: true,
        error: None,
    }
}

// ============================================================================
// Nx Cache Commands
// ============================================================================

/// Get Nx cache status
#[tauri::command]
pub fn get_nx_cache_status(project_path: String) -> GetNxCacheStatusResponse {
    let path = Path::new(&project_path);

    // Check if this is an Nx project
    if !path.join("nx.json").exists() {
        return GetNxCacheStatusResponse {
            success: false,
            status: None,
            error: Some("NX_NOT_FOUND".to_string()),
        };
    }

    // Nx cache is typically stored in .nx/cache or node_modules/.cache/nx
    let cache_locations = [
        path.join(".nx").join("cache"),
        path.join("node_modules").join(".cache").join("nx"),
    ];

    let mut total_size: u64 = 0;
    let mut total_entries: u32 = 0;
    let mut found_cache = false;

    for cache_path in &cache_locations {
        if cache_path.exists() {
            found_cache = true;
            total_size += get_dir_size(cache_path);
            total_entries += count_cache_entries(cache_path);
        }
    }

    if !found_cache {
        return GetNxCacheStatusResponse {
            success: true,
            status: Some(NxCacheStatus {
                total_size: "0 B".to_string(),
                entries: Some(0),
            }),
            error: None,
        };
    }

    GetNxCacheStatusResponse {
        success: true,
        status: Some(NxCacheStatus {
            total_size: format_size(total_size),
            entries: Some(total_entries),
        }),
        error: None,
    }
}

/// Clear Nx cache
#[tauri::command]
pub fn clear_nx_cache(project_path: String) -> ClearNxCacheResponse {
    let path = Path::new(&project_path);

    if !path.join("nx.json").exists() {
        return ClearNxCacheResponse {
            success: false,
            error: Some("NX_NOT_FOUND".to_string()),
        };
    }

    // Clear all possible cache locations
    let cache_locations = [
        path.join(".nx").join("cache"),
        path.join("node_modules").join(".cache").join("nx"),
    ];

    for cache_path in &cache_locations {
        if cache_path.exists() {
            if let Err(_) = fs::remove_dir_all(cache_path) {
                return ClearNxCacheResponse {
                    success: false,
                    error: Some("PERMISSION_DENIED".to_string()),
                };
            }
        }
    }

    ClearNxCacheResponse {
        success: true,
        error: None,
    }
}

// ============================================================================
// Dependency Graph Commands
// ============================================================================

/// Get the dependency graph for a monorepo project
#[tauri::command]
pub fn get_dependency_graph(
    project_path: String,
    tool: String,
    include_affected: Option<bool>,
    base: Option<String>,
) -> GetDependencyGraphResponse {
    let path = Path::new(&project_path);

    if !path.exists() || !path.is_dir() {
        return GetDependencyGraphResponse {
            success: false,
            graph: None,
            error: Some("INVALID_PATH".to_string()),
        };
    }

    let tool_type = match tool.as_str() {
        "nx" => MonorepoToolType::Nx,
        "turbo" => MonorepoToolType::Turbo,
        "workspaces" => MonorepoToolType::Workspaces,
        _ => MonorepoToolType::Unknown,
    };

    match tool_type {
        MonorepoToolType::Nx => get_nx_dependency_graph(&project_path, include_affected, base),
        MonorepoToolType::Turbo | MonorepoToolType::Workspaces => {
            get_workspace_dependency_graph(&project_path, include_affected, base)
        }
        _ => GetDependencyGraphResponse {
            success: false,
            graph: None,
            error: Some("TOOL_NOT_AVAILABLE".to_string()),
        },
    }
}

// ============================================================================
// Batch Execution Commands
// ============================================================================

/// Run scripts in batch across multiple packages
#[tauri::command]
pub async fn run_batch_scripts(
    app: AppHandle,
    project_path: String,
    packages: Vec<String>,
    script: String,
    tool: String,
    parallel: Option<bool>,
    stop_on_error: Option<bool>,
) -> RunBatchScriptsResponse {
    let path = Path::new(&project_path);

    if !path.exists() || !path.is_dir() {
        return RunBatchScriptsResponse {
            success: false,
            execution_id: None,
            error: Some("INVALID_PATH".to_string()),
        };
    }

    if packages.is_empty() || script.is_empty() {
        return RunBatchScriptsResponse {
            success: false,
            execution_id: None,
            error: Some("INVALID_PARAMS".to_string()),
        };
    }

    let execution_id = Uuid::new_v4().to_string();
    let exec_id = execution_id.clone();
    let project_path_clone = project_path.clone();
    let _parallel = parallel.unwrap_or(true);
    let _stop_on_error = stop_on_error.unwrap_or(false);

    // Pre-calculate Volta-wrapped command before spawning thread
    // Build base args based on tool type
    let base_args = match tool.as_str() {
        "nx" => {
            vec![
                "nx".to_string(),
                "run-many".to_string(),
                "-t".to_string(),
                script.clone(),
                "-p".to_string(),
                packages.join(","),
            ]
        }
        "turbo" => {
            let mut a = vec!["turbo".to_string(), "run".to_string(), script.clone()];
            for pkg in &packages {
                a.push(format!("--filter={}", pkg));
            }
            a
        }
        _ => {
            // Fallback: use pnpm/npm workspace commands
            vec![
                "pnpm".to_string(),
                "run".to_string(),
                script.clone(),
                "--recursive".to_string(),
            ]
        }
    };

    // Get Volta-wrapped command if applicable
    let (cmd, cmd_args) = get_volta_wrapped_command(path, "npx", base_args);

    std::thread::spawn(move || {
        let start_time = std::time::Instant::now();
        let mut results: Vec<BatchExecutionResult> = Vec::new();
        let total = packages.len() as u32;

        // Emit initial progress
        let _ = app.emit(
            "batch_progress",
            BatchProgressPayload {
                execution_id: exec_id.clone(),
                total,
                completed: 0,
                running: packages.clone(),
                results: vec![],
            },
        );

        let output = create_env_command(&cmd)
            .args(&cmd_args)
            .current_dir(&project_path_clone)
            .output();

        match output {
            Ok(result) => {
                let stdout = String::from_utf8_lossy(&result.stdout).to_string();

                // Emit output
                let _ = app.emit(
                    "script_output",
                    serde_json::json!({
                        "executionId": exec_id,
                        "output": stdout,
                        "stream": "stdout",
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    }),
                );

                // Create results for each package
                for (idx, pkg) in packages.iter().enumerate() {
                    results.push(BatchExecutionResult {
                        package_name: pkg.clone(),
                        success: result.status.success(),
                        exit_code: result.status.code().unwrap_or(-1),
                        duration: start_time.elapsed().as_millis() as u64,
                        cached: None,
                        output: Some(stdout.clone()),
                        error: None,
                    });

                    // Emit progress update
                    let _ = app.emit(
                        "batch_progress",
                        BatchProgressPayload {
                            execution_id: exec_id.clone(),
                            total,
                            completed: (idx + 1) as u32,
                            running: packages[idx + 1..].to_vec(),
                            results: results.clone(),
                        },
                    );
                }

                // Emit batch completed
                let _ = app.emit(
                    "batch_completed",
                    BatchCompletedPayload {
                        execution_id: exec_id.clone(),
                        success: result.status.success(),
                        results: results.clone(),
                        duration: start_time.elapsed().as_millis() as u64,
                    },
                );
            }
            Err(_e) => {
                let _ = app.emit(
                    "batch_completed",
                    BatchCompletedPayload {
                        execution_id: exec_id.clone(),
                        success: false,
                        results: vec![],
                        duration: start_time.elapsed().as_millis() as u64,
                    },
                );
            }
        }
    });

    RunBatchScriptsResponse {
        success: true,
        execution_id: Some(execution_id),
        error: None,
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn get_nx_version(project_path: &str) -> Option<String> {
    path_resolver::create_command("npx")
        .args(["nx", "--version"])
        .current_dir(project_path)
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
}

fn get_turbo_version(project_path: &str) -> Option<String> {
    path_resolver::create_command("npx")
        .args(["turbo", "--version"])
        .current_dir(project_path)
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
}

fn get_lerna_version(project_path: &str) -> Option<String> {
    path_resolver::create_command("npx")
        .args(["lerna", "--version"])
        .current_dir(project_path)
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
}

fn get_dir_size(path: &Path) -> u64 {
    let mut size = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let metadata = entry.metadata().ok();
            if let Some(m) = metadata {
                if m.is_file() {
                    size += m.len();
                } else if m.is_dir() {
                    size += get_dir_size(&entry.path());
                }
            }
        }
    }
    size
}

fn count_cache_entries(path: &Path) -> u32 {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.metadata().map(|m| m.is_dir()).unwrap_or(false) {
                count += 1;
            }
        }
    }
    count
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn get_nx_dependency_graph(
    project_path: &str,
    include_affected: Option<bool>,
    base: Option<String>,
) -> GetDependencyGraphResponse {
    // Try to use nx graph command
    let output = path_resolver::create_command("npx")
        .args(["nx", "graph", "--file=stdout", "--format=json"])
        .current_dir(project_path)
        .output();

    match output {
        Ok(result) if result.status.success() => {
            let stdout = String::from_utf8_lossy(&result.stdout);
            if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                // Parse Nx graph format
                let graph = parse_nx_graph_json(&json);
                return GetDependencyGraphResponse {
                    success: true,
                    graph: Some(graph),
                    error: None,
                };
            }
        }
        _ => {}
    }

    // Fallback to parsing package.json dependencies
    get_workspace_dependency_graph(project_path, include_affected, base)
}

fn parse_nx_graph_json(json: &Value) -> DependencyGraph {
    let mut nodes: Vec<DependencyNode> = Vec::new();
    let mut edges: Vec<DependencyEdge> = Vec::new();

    if let Some(graph) = json.get("graph") {
        if let Some(nodes_obj) = graph.get("nodes").and_then(|n| n.as_object()) {
            for (id, node) in nodes_obj {
                let node_type = node
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("package")
                    .to_string();

                nodes.push(DependencyNode {
                    id: id.clone(),
                    name: node
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or(id)
                        .to_string(),
                    node_type,
                    root: node
                        .get("data")
                        .and_then(|d| d.get("root"))
                        .and_then(|r| r.as_str())
                        .unwrap_or("")
                        .to_string(),
                    tags: node
                        .get("data")
                        .and_then(|d| d.get("tags"))
                        .and_then(|t| t.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        }),
                    scripts_count: 0,
                });
            }
        }

        if let Some(deps) = graph.get("dependencies").and_then(|d| d.as_object()) {
            for (source, targets) in deps {
                if let Some(arr) = targets.as_array() {
                    for target in arr {
                        if let Some(t) = target.get("target").and_then(|t| t.as_str()) {
                            edges.push(DependencyEdge {
                                source: source.clone(),
                                target: t.to_string(),
                                edge_type: target
                                    .get("type")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("static")
                                    .to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    DependencyGraph {
        nodes,
        edges,
        cycles: None,
        affected_nodes: None,
    }
}

fn get_workspace_dependency_graph(
    project_path: &str,
    _include_affected: Option<bool>,
    _base: Option<String>,
) -> GetDependencyGraphResponse {
    let path = Path::new(project_path);
    let mut nodes: Vec<DependencyNode> = Vec::new();
    let mut edges: Vec<DependencyEdge> = Vec::new();
    let mut package_map: HashMap<String, String> = HashMap::new();

    // Get workspace packages
    let packages = get_workspace_package_dirs(project_path);

    for pkg_path in &packages {
        let pkg_json_path = Path::new(&pkg_path).join("package.json");
        if let Ok(content) = fs::read_to_string(&pkg_json_path) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                let name = json
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let id = name.clone();
                package_map.insert(name.clone(), pkg_path.clone());

                let scripts_count = json
                    .get("scripts")
                    .and_then(|s| s.as_object())
                    .map(|o| o.len() as u32)
                    .unwrap_or(0);

                let relative_root = Path::new(&pkg_path)
                    .strip_prefix(project_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or(pkg_path.clone());

                nodes.push(DependencyNode {
                    id: id.clone(),
                    name: name.clone(),
                    node_type: "package".to_string(),
                    root: relative_root,
                    tags: None,
                    scripts_count,
                });

                // Parse dependencies
                for dep_key in &["dependencies", "devDependencies", "peerDependencies"] {
                    if let Some(deps) = json.get(*dep_key).and_then(|d| d.as_object()) {
                        for (dep_name, _) in deps {
                            // Only include internal workspace dependencies
                            if package_map.contains_key(dep_name)
                                || packages.iter().any(|p| {
                                    let pjson = Path::new(p).join("package.json");
                                    if let Ok(c) = fs::read_to_string(&pjson) {
                                        if let Ok(j) = serde_json::from_str::<Value>(&c) {
                                            j.get("name").and_then(|n| n.as_str()) == Some(dep_name)
                                        } else {
                                            false
                                        }
                                    } else {
                                        false
                                    }
                                })
                            {
                                edges.push(DependencyEdge {
                                    source: dep_name.clone(),
                                    target: id.clone(),
                                    edge_type: "static".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    GetDependencyGraphResponse {
        success: true,
        graph: Some(DependencyGraph {
            nodes,
            edges,
            cycles: None,
            affected_nodes: None,
        }),
        error: None,
    }
}

fn get_workspace_package_dirs(project_path: &str) -> Vec<String> {
    let path = Path::new(project_path);
    let mut packages: Vec<String> = Vec::new();

    // Check pnpm-workspace.yaml
    let pnpm_workspace = path.join("pnpm-workspace.yaml");
    if pnpm_workspace.exists() {
        if let Ok(content) = fs::read_to_string(&pnpm_workspace) {
            // Simple parsing of pnpm-workspace.yaml
            for line in content.lines() {
                let trimmed = line.trim().trim_start_matches('-').trim();
                if !trimmed.is_empty() && !trimmed.starts_with("packages:") {
                    let pattern = trimmed.trim_matches('"').trim_matches('\'');

                    // Handle different glob patterns
                    if pattern.contains("/*/**") {
                        // Pattern like "packages/*/**" - two levels deep
                        let base = pattern.replace("/*/**", "");
                        let base_path = path.join(&base);
                        if base_path.is_dir() {
                            // First level: packages/core, packages/shared, etc.
                            if let Ok(level1_entries) = fs::read_dir(&base_path) {
                                for level1_entry in level1_entries.filter_map(|e| e.ok()) {
                                    let level1_path = level1_entry.path();
                                    if level1_path.is_dir() {
                                        // Second level: packages/core/api, packages/core/config, etc.
                                        if let Ok(level2_entries) = fs::read_dir(&level1_path) {
                                            for level2_entry in
                                                level2_entries.filter_map(|e| e.ok())
                                            {
                                                let level2_path = level2_entry.path();
                                                if level2_path.is_dir()
                                                    && level2_path.join("package.json").exists()
                                                {
                                                    packages.push(
                                                        level2_path.to_string_lossy().to_string(),
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Simple pattern like "packages/*"
                        let glob_path = path.join(pattern.trim_end_matches("/*"));
                        if glob_path.is_dir() {
                            if let Ok(entries) = fs::read_dir(&glob_path) {
                                for entry in entries.filter_map(|e| e.ok()) {
                                    let entry_path = entry.path();
                                    if entry_path.is_dir()
                                        && entry_path.join("package.json").exists()
                                    {
                                        packages.push(entry_path.to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Check package.json workspaces
    let package_json = path.join("package.json");
    if package_json.exists() {
        if let Ok(content) = fs::read_to_string(&package_json) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                if let Some(workspaces) = json.get("workspaces") {
                    let workspace_patterns: Vec<String> = if let Some(arr) = workspaces.as_array() {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    } else if let Some(obj) = workspaces.as_object() {
                        // Yarn workspaces format: { packages: [...] }
                        obj.get("packages")
                            .and_then(|p| p.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(String::from))
                                    .collect()
                            })
                            .unwrap_or_default()
                    } else {
                        vec![]
                    };

                    for pattern in workspace_patterns {
                        let glob_path =
                            path.join(pattern.trim_end_matches("/*").trim_end_matches("/**"));
                        if glob_path.is_dir() {
                            if let Ok(entries) = fs::read_dir(&glob_path) {
                                for entry in entries.filter_map(|e| e.ok()) {
                                    let entry_path = entry.path();
                                    if entry_path.is_dir()
                                        && entry_path.join("package.json").exists()
                                    {
                                        packages.push(entry_path.to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    packages
}
