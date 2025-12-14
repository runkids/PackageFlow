// Toolchain commands for Node.js toolchain conflict detection
// Feature: 017-toolchain-conflict-detection

use crate::models::toolchain::{
    BuildCommandResult, EnvironmentDiagnostics, ParsedPackageManager, ProjectPreference,
    ToolchainConfig, ToolchainConflictResult, ToolchainConflictType, ToolchainError,
    ToolchainErrorCode, ToolchainStrategy, VoltaToolchainConfig,
};
use regex::Regex;
use serde_json::Value;
use std::path::Path;

// ============================================================================
// Helper Functions
// ============================================================================

/// Parse package.json volta and packageManager fields
pub fn parse_toolchain_config(project_path: &Path) -> Result<ToolchainConfig, String> {
    let package_json_path = project_path.join("package.json");

    if !package_json_path.exists() {
        return Err("package.json not found".to_string());
    }

    let content = std::fs::read_to_string(&package_json_path)
        .map_err(|e| format!("Failed to read package.json: {}", e))?;

    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse package.json: {}", e))?;

    // Parse volta configuration
    let volta = json.get("volta").map(|v| VoltaToolchainConfig {
        node: v.get("node").and_then(|n| n.as_str()).map(String::from),
        npm: v.get("npm").and_then(|n| n.as_str()).map(String::from),
        yarn: v.get("yarn").and_then(|n| n.as_str()).map(String::from),
        pnpm: v.get("pnpm").and_then(|n| n.as_str()).map(String::from),
    });

    // Parse packageManager field
    let package_manager = json
        .get("packageManager")
        .and_then(|v| v.as_str())
        .map(String::from);

    // Parse the packageManager string if present
    let parsed_package_manager = package_manager
        .as_ref()
        .and_then(|pm| parse_package_manager_string(pm).ok());

    Ok(ToolchainConfig {
        volta,
        package_manager,
        parsed_package_manager,
    })
}

/// Parse packageManager string (e.g., "pnpm@9.15.0+sha512.xxx")
fn parse_package_manager_string(pm_string: &str) -> Result<ParsedPackageManager, String> {
    // Format: <name>@<version>[+<hash>]
    // Example: pnpm@9.15.0+sha512.xxx
    let re = Regex::new(r"^(npm|pnpm|yarn|bun)@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)(?:\+(.+))?$")
        .map_err(|e| format!("Regex error: {}", e))?;

    if let Some(caps) = re.captures(pm_string) {
        Ok(ParsedPackageManager {
            name: caps
                .get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            version: caps
                .get(2)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            hash: caps.get(3).map(|m| m.as_str().to_string()),
        })
    } else {
        Err(format!("Invalid packageManager format: {}", pm_string))
    }
}

/// Check if corepack is enabled
pub fn detect_corepack_enabled() -> bool {
    // Try to run corepack --version
    let output = std::process::Command::new("corepack")
        .arg("--version")
        .output();

    output.map(|o| o.status.success()).unwrap_or(false)
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Detect toolchain conflict for a project
#[tauri::command]
pub async fn detect_toolchain_conflict(
    project_path: String,
) -> Result<ToolchainConflictResult, String> {
    let path = Path::new(&project_path);

    // Parse toolchain configuration
    let config = parse_toolchain_config(path)?;

    // Check for Volta availability
    let volta_available = crate::commands::version::detect_volta().available;

    // Check for Corepack status
    let corepack_enabled = detect_corepack_enabled();

    // Determine conflict type
    let (conflict_type, has_conflict) =
        determine_conflict_type(&config, volta_available, corepack_enabled);

    // Generate suggested strategies based on conflict type
    let (suggested_strategies, recommended_strategy) =
        generate_strategy_suggestions(&conflict_type, volta_available, corepack_enabled);

    // Generate description
    let description = generate_conflict_description(&conflict_type);

    Ok(ToolchainConflictResult {
        has_conflict,
        conflict_type,
        description,
        suggested_strategies,
        recommended_strategy,
    })
}

/// Determine the conflict type based on configuration and environment
fn determine_conflict_type(
    config: &ToolchainConfig,
    volta_available: bool,
    corepack_enabled: bool,
) -> (ToolchainConflictType, bool) {
    let has_volta_config = config.volta.is_some();
    let has_package_manager = config.package_manager.is_some();

    // Case 1: Both volta and packageManager present - dual config conflict
    if has_volta_config && has_package_manager {
        let volta = config.volta.as_ref().unwrap();
        let pm = config.package_manager.as_ref().unwrap();

        // Determine volta's package manager version
        let volta_pm = volta
            .pnpm
            .clone()
            .or_else(|| volta.yarn.clone())
            .or_else(|| volta.npm.clone());

        return (
            ToolchainConflictType::DualConfig {
                volta_node: volta.node.clone(),
                volta_pm,
                package_manager: pm.clone(),
            },
            true,
        );
    }

    // Case 2: Volta config but Volta not installed
    if has_volta_config && !volta_available {
        return (ToolchainConflictType::VoltaMissing, true);
    }

    // Case 3: packageManager config but Corepack not enabled
    if has_package_manager && !corepack_enabled {
        return (ToolchainConflictType::CorepackDisabled, true);
    }

    // No conflict
    (ToolchainConflictType::None, false)
}

/// Generate strategy suggestions based on conflict type
fn generate_strategy_suggestions(
    conflict_type: &ToolchainConflictType,
    volta_available: bool,
    corepack_enabled: bool,
) -> (Vec<ToolchainStrategy>, ToolchainStrategy) {
    match conflict_type {
        ToolchainConflictType::DualConfig { .. } => {
            let mut strategies = vec![];

            // Always suggest Hybrid as the recommended strategy for dual config
            if volta_available && corepack_enabled {
                strategies.push(ToolchainStrategy::Hybrid);
            }

            if volta_available {
                strategies.push(ToolchainStrategy::VoltaPriority);
            }

            if corepack_enabled {
                strategies.push(ToolchainStrategy::CorepackPriority);
            }

            strategies.push(ToolchainStrategy::SystemDefault);

            let recommended = if volta_available && corepack_enabled {
                ToolchainStrategy::Hybrid
            } else if volta_available {
                ToolchainStrategy::VoltaPriority
            } else if corepack_enabled {
                ToolchainStrategy::CorepackPriority
            } else {
                ToolchainStrategy::SystemDefault
            };

            (strategies, recommended)
        }
        ToolchainConflictType::VoltaMissing => {
            // Volta missing, can only use Corepack or System
            let strategies = if corepack_enabled {
                vec![
                    ToolchainStrategy::CorepackPriority,
                    ToolchainStrategy::SystemDefault,
                ]
            } else {
                vec![ToolchainStrategy::SystemDefault]
            };

            let recommended = if corepack_enabled {
                ToolchainStrategy::CorepackPriority
            } else {
                ToolchainStrategy::SystemDefault
            };

            (strategies, recommended)
        }
        ToolchainConflictType::CorepackDisabled => {
            // Corepack disabled, can use Volta or System
            let strategies = if volta_available {
                vec![
                    ToolchainStrategy::VoltaPriority,
                    ToolchainStrategy::SystemDefault,
                ]
            } else {
                vec![ToolchainStrategy::SystemDefault]
            };

            let recommended = if volta_available {
                ToolchainStrategy::VoltaPriority
            } else {
                ToolchainStrategy::SystemDefault
            };

            (strategies, recommended)
        }
        ToolchainConflictType::ShimOverwrite { .. } => {
            // Shim overwrite - prefer Volta priority to avoid confusion
            let strategies = vec![
                ToolchainStrategy::VoltaPriority,
                ToolchainStrategy::CorepackPriority,
                ToolchainStrategy::SystemDefault,
            ];

            (strategies, ToolchainStrategy::VoltaPriority)
        }
        ToolchainConflictType::None => {
            // No conflict - use appropriate default
            if volta_available {
                (
                    vec![ToolchainStrategy::VoltaPriority],
                    ToolchainStrategy::VoltaPriority,
                )
            } else if corepack_enabled {
                (
                    vec![ToolchainStrategy::CorepackPriority],
                    ToolchainStrategy::CorepackPriority,
                )
            } else {
                (
                    vec![ToolchainStrategy::SystemDefault],
                    ToolchainStrategy::SystemDefault,
                )
            }
        }
    }
}

/// Generate human-readable conflict description
fn generate_conflict_description(conflict_type: &ToolchainConflictType) -> Option<String> {
    match conflict_type {
        ToolchainConflictType::None => None,
        ToolchainConflictType::DualConfig { volta_node, volta_pm, package_manager } => {
            let mut desc = String::from("專案同時配置了 Volta 和 packageManager 欄位。\n");
            if let Some(node) = volta_node {
                desc.push_str(&format!("Volta Node.js: {}\n", node));
            }
            if let Some(pm) = volta_pm {
                desc.push_str(&format!("Volta Package Manager: {}\n", pm));
            }
            desc.push_str(&format!("packageManager: {}", package_manager));
            Some(desc)
        }
        ToolchainConflictType::ShimOverwrite { affected_tools, fix_command } => {
            Some(format!(
                "Corepack shim 覆蓋了 Volta shim，影響工具：{}。\n修復命令：{}",
                affected_tools.join(", "),
                fix_command
            ))
        }
        ToolchainConflictType::VoltaMissing => {
            Some("專案配置了 Volta，但系統未安裝 Volta。請安裝 Volta 或移除 volta 配置。".to_string())
        }
        ToolchainConflictType::CorepackDisabled => {
            Some("專案配置了 packageManager，但 Corepack 未啟用。請執行 `corepack enable` 或移除 packageManager 配置。".to_string())
        }
    }
}

/// Build wrapped command with toolchain strategy
#[tauri::command]
pub async fn build_toolchain_command(
    project_path: String,
    command: String,
    args: Vec<String>,
    strategy: Option<ToolchainStrategy>,
) -> Result<BuildCommandResult, String> {
    let path = Path::new(&project_path);

    // Parse toolchain configuration
    let config = parse_toolchain_config(path)?;

    // Get Volta status
    let volta_status = crate::commands::version::detect_volta();

    // Determine strategy to use
    let strategy = strategy.unwrap_or_else(|| {
        // Auto-detect best strategy
        if volta_status.available && config.volta.is_some() {
            if config.package_manager.is_some() && detect_corepack_enabled() {
                ToolchainStrategy::Hybrid
            } else {
                ToolchainStrategy::VoltaPriority
            }
        } else if config.package_manager.is_some() && detect_corepack_enabled() {
            ToolchainStrategy::CorepackPriority
        } else {
            ToolchainStrategy::SystemDefault
        }
    });

    // Build the wrapped command
    let (cmd, cmd_args, using_volta, using_corepack) =
        build_wrapped_command(&config, &volta_status, &command, &args, &strategy)?;

    Ok(BuildCommandResult {
        command: cmd,
        args: cmd_args,
        strategy_used: strategy,
        using_volta,
        using_corepack,
    })
}

/// Core command wrapping logic - shared between PTY and non-PTY
pub fn build_wrapped_command(
    config: &ToolchainConfig,
    volta_status: &crate::models::version::ToolStatus,
    command: &str,
    args: &[String],
    strategy: &ToolchainStrategy,
) -> Result<(String, Vec<String>, bool, bool), String> {
    match strategy {
        ToolchainStrategy::VoltaPriority => {
            // Use volta run --node <ver> [--<pm> <ver>] <command> <args>
            if !volta_status.available {
                return Err(
                    "Volta is not available but VoltaPriority strategy was selected".to_string(),
                );
            }

            let volta_cmd = volta_status
                .path
                .clone()
                .unwrap_or_else(|| "volta".to_string());
            let mut volta_args = vec!["run".to_string()];

            // Add node version if specified
            if let Some(ref volta_config) = config.volta {
                if let Some(ref node_ver) = volta_config.node {
                    volta_args.push("--node".to_string());
                    volta_args.push(node_ver.clone());
                }

                // Add package manager version from volta config
                if let Some(ref pnpm_ver) = volta_config.pnpm {
                    volta_args.push("--pnpm".to_string());
                    volta_args.push(pnpm_ver.clone());
                } else if let Some(ref yarn_ver) = volta_config.yarn {
                    volta_args.push("--yarn".to_string());
                    volta_args.push(yarn_ver.clone());
                } else if let Some(ref npm_ver) = volta_config.npm {
                    volta_args.push("--npm".to_string());
                    volta_args.push(npm_ver.clone());
                }
            }

            // Add the actual command and arguments
            volta_args.push(command.to_string());
            volta_args.extend(args.iter().cloned());

            Ok((volta_cmd, volta_args, true, false))
        }

        ToolchainStrategy::CorepackPriority => {
            // Direct execution, let Corepack handle it
            Ok((command.to_string(), args.to_vec(), false, true))
        }

        ToolchainStrategy::Hybrid => {
            // Use volta run --node <ver> <command> <args>
            // Let Corepack handle the package manager version
            if !volta_status.available {
                return Err("Volta is not available but Hybrid strategy was selected".to_string());
            }

            let volta_cmd = volta_status
                .path
                .clone()
                .unwrap_or_else(|| "volta".to_string());
            let mut volta_args = vec!["run".to_string()];

            // Add node version if specified
            if let Some(ref volta_config) = config.volta {
                if let Some(ref node_ver) = volta_config.node {
                    volta_args.push("--node".to_string());
                    volta_args.push(node_ver.clone());
                }
            }

            // Add the actual command and arguments (without PM version, let Corepack handle it)
            volta_args.push(command.to_string());
            volta_args.extend(args.iter().cloned());

            Ok((volta_cmd, volta_args, true, true))
        }

        ToolchainStrategy::SystemDefault => {
            // No wrapping, direct execution
            Ok((command.to_string(), args.to_vec(), false, false))
        }
    }
}

/// Humanize toolchain error messages
#[tauri::command]
pub async fn humanize_toolchain_error(raw_error: String) -> Result<ToolchainError, String> {
    let error_lower = raw_error.to_lowercase();

    // Check for version not found errors
    if error_lower.contains("no matching version") || error_lower.contains("version not found") {
        // Extract version number if possible
        let version_re = Regex::new(r"v?(\d+\.\d+\.\d+)").ok();
        let version = version_re
            .and_then(|re| re.captures(&raw_error))
            .and_then(|caps| caps.get(1))
            .map(|m| m.as_str().to_string());

        return Ok(ToolchainError {
            code: ToolchainErrorCode::VersionNotFound,
            message: if let Some(v) = &version {
                format!("找不到指定的版本 {}。", v)
            } else {
                "找不到指定的版本。".to_string()
            },
            suggestion: Some("請確認版本號是否正確，或安裝所需的版本。".to_string()),
            command: version.map(|v| format!("volta install node@{}", v)),
        });
    }

    // Check for network errors
    if error_lower.contains("network")
        || error_lower.contains("could not download")
        || error_lower.contains("fetch")
    {
        return Ok(ToolchainError {
            code: ToolchainErrorCode::NetworkError,
            message: "網路連線錯誤，無法下載所需的工具。".to_string(),
            suggestion: Some("請檢查網路連線狀態，或稍後再試。".to_string()),
            command: None,
        });
    }

    // Check for corepack disabled errors
    if error_lower.contains("corepack")
        && (error_lower.contains("disabled") || error_lower.contains("not enabled"))
    {
        return Ok(ToolchainError {
            code: ToolchainErrorCode::CorepackDisabled,
            message: "Corepack 未啟用。".to_string(),
            suggestion: Some("請執行以下命令啟用 Corepack。".to_string()),
            command: Some("corepack enable".to_string()),
        });
    }

    // Check for package manager not installed
    if error_lower.contains("command not found") || error_lower.contains("not recognized") {
        let pm_re = Regex::new(r"(npm|pnpm|yarn|bun)").ok();
        let pm = pm_re
            .and_then(|re| re.find(&error_lower))
            .map(|m| m.as_str().to_string());

        return Ok(ToolchainError {
            code: ToolchainErrorCode::PmNotInstalled,
            message: if let Some(ref p) = pm {
                format!("{} 未安裝或不在 PATH 中。", p)
            } else {
                "Package manager 未安裝或不在 PATH 中。".to_string()
            },
            suggestion: Some("請安裝所需的 package manager。".to_string()),
            command: pm.map(|p| format!("npm install -g {}", p)),
        });
    }

    // Unknown error
    Ok(ToolchainError {
        code: ToolchainErrorCode::Unknown,
        message: "發生未知錯誤。".to_string(),
        suggestion: Some("請查看完整錯誤訊息以了解詳情。".to_string()),
        command: None,
    })
}

/// Get project toolchain preference from store
#[tauri::command]
pub async fn get_toolchain_preference(
    app_handle: tauri::AppHandle,
    project_path: String,
) -> Result<Option<ProjectPreference>, String> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle
        .store("packageflow.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let preferences: std::collections::HashMap<String, ProjectPreference> = store
        .get("toolchain_preferences")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(preferences.get(&project_path).cloned())
}

/// Set project toolchain preference to store
#[tauri::command]
pub async fn set_toolchain_preference(
    app_handle: tauri::AppHandle,
    project_path: String,
    strategy: ToolchainStrategy,
    remember: bool,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle
        .store("packageflow.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let mut preferences: std::collections::HashMap<String, ProjectPreference> = store
        .get("toolchain_preferences")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let preference = ProjectPreference {
        project_path: project_path.clone(),
        strategy,
        remember,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    preferences.insert(project_path, preference);

    store.set(
        "toolchain_preferences",
        serde_json::to_value(&preferences).map_err(|e| format!("Serialization error: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Clear project toolchain preference from store
#[tauri::command]
pub async fn clear_toolchain_preference(
    app_handle: tauri::AppHandle,
    project_path: String,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle
        .store("packageflow.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let mut preferences: std::collections::HashMap<String, ProjectPreference> = store
        .get("toolchain_preferences")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    preferences.remove(&project_path);

    store.set(
        "toolchain_preferences",
        serde_json::to_value(&preferences).map_err(|e| format!("Serialization error: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Get environment diagnostics
#[tauri::command]
pub async fn get_environment_diagnostics(
    project_path: Option<String>,
) -> Result<EnvironmentDiagnostics, String> {
    use crate::models::toolchain::{
        CorepackInfo, PackageManagersInfo, PathAnalysis, SystemNodeInfo, ToolVersionInfo, VoltaInfo,
    };

    // Get Volta status
    let volta_status = crate::commands::version::detect_volta();
    let volta_shim_path =
        dirs::home_dir().map(|h| h.join(".volta").join("bin").to_string_lossy().to_string());

    let volta_info = VoltaInfo {
        available: volta_status.available,
        version: volta_status.version,
        path: volta_status.path,
        shim_path: volta_shim_path,
    };

    // Get Corepack status
    let corepack_status = crate::commands::version::detect_corepack();
    let corepack_info = CorepackInfo {
        available: corepack_status.available,
        enabled: detect_corepack_enabled(),
        version: corepack_status.version,
        path: corepack_status.path,
    };

    // Get system Node.js
    let node_output = std::process::Command::new("node").arg("--version").output();

    let node_which = std::process::Command::new("which").arg("node").output();

    let system_node = SystemNodeInfo {
        version: node_output
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string()),
        path: node_which
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string()),
    };

    // Get package manager versions
    let get_tool_info = |tool: &str| -> Option<ToolVersionInfo> {
        let version = std::process::Command::new(tool)
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())?;

        let path = std::process::Command::new("which")
            .arg(tool)
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())?;

        Some(ToolVersionInfo { version, path })
    };

    let package_managers = PackageManagersInfo {
        npm: get_tool_info("npm"),
        pnpm: get_tool_info("pnpm"),
        yarn: get_tool_info("yarn"),
    };

    // Analyze PATH order
    let path_env = std::env::var("PATH").unwrap_or_default();
    let path_entries: Vec<String> = path_env.split(':').map(String::from).collect();

    let volta_shim = dirs::home_dir()
        .map(|h| h.join(".volta").join("bin").to_string_lossy().to_string())
        .unwrap_or_default();

    let volta_idx = path_entries.iter().position(|p| p.contains(".volta"));
    let corepack_idx = path_entries
        .iter()
        .position(|p| p.contains("corepack") || p.contains(".npm") || p.contains(".nvm"));

    let path_analysis = PathAnalysis {
        volta_first: volta_idx
            .map(|i| i == 0 || corepack_idx.map(|c| i < c).unwrap_or(true))
            .unwrap_or(false),
        corepack_first: corepack_idx
            .map(|i| volta_idx.map(|v| i < v).unwrap_or(true))
            .unwrap_or(false),
        order: path_entries.into_iter().take(10).collect(), // First 10 entries
    };

    Ok(EnvironmentDiagnostics {
        volta: volta_info,
        corepack: corepack_info,
        system_node,
        package_managers,
        path_analysis,
    })
}
