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

/// Check if corepack is enabled (shims installed)
pub fn detect_corepack_enabled() -> bool {
    // Use detect_corepack from version module which handles PATH correctly
    let corepack_status = crate::commands::version::detect_corepack();
    if !corepack_status.available {
        return false;
    }

    // Corepack is available, now check if shims are actually installed
    // by checking if pnpm/yarn in common locations are symlinks to corepack
    let shim_paths = [
        "/usr/local/bin/pnpm",
        "/usr/local/bin/yarn",
        "/opt/homebrew/bin/pnpm",
        "/opt/homebrew/bin/yarn",
    ];

    for path in &shim_paths {
        let path = std::path::Path::new(path);
        if path.exists() {
            // Check if it's a symlink pointing to corepack
            if let Ok(target) = std::fs::read_link(path) {
                let target_str = target.to_string_lossy();
                if target_str.contains("corepack") {
                    return true;
                }
            }
            // Also check if it's a script that calls corepack
            if let Ok(content) = std::fs::read_to_string(path) {
                if content.contains("corepack") {
                    return true;
                }
            }
        }
    }

    // Fallback: Check if corepack can run successfully
    let output = crate::utils::path_resolver::create_command("corepack")
        .arg("--version")
        .output();

    output.map(|o| o.status.success()).unwrap_or(false)
}

/// Detailed corepack status including shim information
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorepackStatus {
    /// Whether corepack binary is available
    pub available: bool,
    /// Whether corepack shims are installed (enabled)
    pub enabled: bool,
    /// Corepack version
    pub version: Option<String>,
    /// Path to corepack binary
    pub path: Option<String>,
    /// List of tools with corepack shims installed
    pub enabled_tools: Vec<String>,
}

/// Get detailed corepack status
pub fn get_corepack_status() -> CorepackStatus {
    let corepack_status = crate::commands::version::detect_corepack();
    if !corepack_status.available {
        return CorepackStatus {
            available: false,
            enabled: false,
            version: None,
            path: None,
            enabled_tools: vec![],
        };
    }

    let mut enabled_tools = Vec::new();
    let shim_checks = [
        ("/usr/local/bin/pnpm", "pnpm"),
        ("/usr/local/bin/yarn", "yarn"),
        ("/usr/local/bin/npm", "npm"),
        ("/opt/homebrew/bin/pnpm", "pnpm"),
        ("/opt/homebrew/bin/yarn", "yarn"),
    ];

    for (path, tool) in &shim_checks {
        let p = std::path::Path::new(path);
        if p.exists() {
            let is_corepack = if let Ok(target) = std::fs::read_link(p) {
                target.to_string_lossy().contains("corepack")
            } else if let Ok(content) = std::fs::read_to_string(p) {
                content.contains("corepack")
            } else {
                false
            };

            if is_corepack && !enabled_tools.contains(&tool.to_string()) {
                enabled_tools.push(tool.to_string());
            }
        }
    }

    CorepackStatus {
        available: true,
        enabled: !enabled_tools.is_empty(),
        version: corepack_status.version,
        path: corepack_status.path,
        enabled_tools,
    }
}

/// PNPM HOME path conflict detection result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PnpmHomeConflict {
    /// Whether a conflict is detected
    pub has_conflict: bool,
    /// Description of the conflict
    pub description: Option<String>,
    /// The problematic path
    pub problematic_path: Option<String>,
    /// Suggested fix command
    pub fix_command: Option<String>,
}

/// Detect PNPM_HOME path conflicts
/// This detects the case where $PNPM_HOME/pnpm is a file instead of directory
pub fn detect_pnpm_home_conflict() -> PnpmHomeConflict {
    // Check common PNPM_HOME locations
    let home = crate::utils::path_resolver::get_home_dir().unwrap_or_default();
    let pnpm_home_candidates = [
        std::env::var("PNPM_HOME").ok(),
        Some(format!("{}/Library/pnpm", home)),
        Some(format!("{}/.local/share/pnpm", home)),
    ];

    for pnpm_home in pnpm_home_candidates.into_iter().flatten() {
        let pnpm_path = std::path::Path::new(&pnpm_home).join("pnpm");

        // Check if pnpm is a file (not directory)
        if pnpm_path.exists() && pnpm_path.is_file() {
            // This is the problematic case: pnpm is a file but corepack expects directory
            return PnpmHomeConflict {
                has_conflict: true,
                description: Some(format!(
                    "Found file at '{}' which conflicts with Corepack's expected directory structure. \
                    This typically happens when standalone pnpm was installed alongside Corepack.",
                    pnpm_path.display()
                )),
                problematic_path: Some(pnpm_path.to_string_lossy().to_string()),
                fix_command: Some(format!(
                    "rm '{}' && rm '{}x'",
                    pnpm_path.display(),
                    pnpm_path.display()
                )),
            };
        }
    }

    PnpmHomeConflict {
        has_conflict: false,
        description: None,
        problematic_path: None,
        fix_command: None,
    }
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
            let mut desc = String::from("Project has both Volta and packageManager configured.\n");
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
                "Corepack shim has overwritten Volta shim. Affected tools: {}.\nFix command: {}",
                affected_tools.join(", "),
                fix_command
            ))
        }
        ToolchainConflictType::VoltaMissing => {
            Some("Project has Volta config but Volta is not installed. Please install Volta or remove the volta config.".to_string())
        }
        ToolchainConflictType::CorepackDisabled => {
            Some("Project has packageManager field but Corepack is not enabled. Please run `corepack enable` or remove the packageManager field.".to_string())
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
                format!("Version {} not found.", v)
            } else {
                "Specified version not found.".to_string()
            },
            suggestion: Some("Please verify the version number or install the required version.".to_string()),
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
            message: "Network error, unable to download required tools.".to_string(),
            suggestion: Some("Please check your network connection and try again.".to_string()),
            command: None,
        });
    }

    // Check for corepack disabled errors
    if error_lower.contains("corepack")
        && (error_lower.contains("disabled") || error_lower.contains("not enabled"))
    {
        return Ok(ToolchainError {
            code: ToolchainErrorCode::CorepackDisabled,
            message: "Corepack is not enabled.".to_string(),
            suggestion: Some("Run the following command to enable Corepack.".to_string()),
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
                format!("{} is not installed or not in PATH.", p)
            } else {
                "Package manager is not installed or not in PATH.".to_string()
            },
            suggestion: Some("Please install the required package manager.".to_string()),
            command: pm.map(|p| format!("npm install -g {}", p)),
        });
    }

    // Unknown error
    Ok(ToolchainError {
        code: ToolchainErrorCode::Unknown,
        message: "An unknown error occurred.".to_string(),
        suggestion: Some("Please check the full error message for details.".to_string()),
        command: None,
    })
}

const TOOLCHAIN_PREFERENCES_KEY: &str = "toolchain_preferences";

/// Get project toolchain preference from SQLite
#[tauri::command]
pub async fn get_toolchain_preference(
    db: tauri::State<'_, crate::DatabaseState>,
    project_path: String,
) -> Result<Option<ProjectPreference>, String> {
    use crate::repositories::SettingsRepository;

    let repo = SettingsRepository::new(db.0.as_ref().clone());
    let preferences: std::collections::HashMap<String, ProjectPreference> = repo
        .get(TOOLCHAIN_PREFERENCES_KEY)?
        .unwrap_or_default();

    Ok(preferences.get(&project_path).cloned())
}

/// Get all toolchain preferences from SQLite
#[tauri::command]
pub async fn get_all_toolchain_preferences(
    db: tauri::State<'_, crate::DatabaseState>,
) -> Result<std::collections::HashMap<String, ProjectPreference>, String> {
    use crate::repositories::SettingsRepository;

    let repo = SettingsRepository::new(db.0.as_ref().clone());
    let preferences: std::collections::HashMap<String, ProjectPreference> = repo
        .get(TOOLCHAIN_PREFERENCES_KEY)?
        .unwrap_or_default();

    Ok(preferences)
}

/// Set project toolchain preference to SQLite
#[tauri::command]
pub async fn set_toolchain_preference(
    db: tauri::State<'_, crate::DatabaseState>,
    project_path: String,
    strategy: ToolchainStrategy,
    remember: bool,
) -> Result<(), String> {
    use crate::repositories::SettingsRepository;

    let repo = SettingsRepository::new(db.0.as_ref().clone());
    let mut preferences: std::collections::HashMap<String, ProjectPreference> = repo
        .get(TOOLCHAIN_PREFERENCES_KEY)?
        .unwrap_or_default();

    let preference = ProjectPreference {
        project_path: project_path.clone(),
        strategy,
        remember,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    preferences.insert(project_path, preference);
    repo.set(TOOLCHAIN_PREFERENCES_KEY, &preferences)?;

    Ok(())
}

/// Clear project toolchain preference from SQLite
#[tauri::command]
pub async fn clear_toolchain_preference(
    db: tauri::State<'_, crate::DatabaseState>,
    project_path: String,
) -> Result<(), String> {
    use crate::repositories::SettingsRepository;

    let repo = SettingsRepository::new(db.0.as_ref().clone());
    let mut preferences: std::collections::HashMap<String, ProjectPreference> = repo
        .get(TOOLCHAIN_PREFERENCES_KEY)?
        .unwrap_or_default();

    preferences.remove(&project_path);
    repo.set(TOOLCHAIN_PREFERENCES_KEY, &preferences)?;

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

    // Get system Node.js - use path_resolver for proper PATH handling in macOS GUI apps
    let node_output = crate::utils::path_resolver::create_command("node")
        .arg("--version")
        .output();

    let node_path = crate::utils::path_resolver::find_tool("node");

    let system_node = SystemNodeInfo {
        version: node_output
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string()),
        path: node_path,
    };

    // Get package manager versions - use path_resolver for proper PATH handling
    let get_tool_info = |tool: &str| -> Option<ToolVersionInfo> {
        let version = crate::utils::path_resolver::create_command(tool)
            .arg("--version")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())?;

        let path = crate::utils::path_resolver::find_tool(tool)?;

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

// ============================================================================
// Corepack Management Commands
// ============================================================================

/// Response for corepack operations
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorepackOperationResponse {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

/// Get detailed corepack status
#[tauri::command]
pub async fn get_corepack_status_cmd() -> Result<CorepackStatus, String> {
    Ok(get_corepack_status())
}

/// Detect PNPM HOME path conflicts
#[tauri::command]
pub async fn detect_pnpm_home_conflict_cmd() -> Result<PnpmHomeConflict, String> {
    Ok(detect_pnpm_home_conflict())
}

/// Enable corepack (run `corepack enable`)
#[tauri::command]
pub async fn enable_corepack() -> Result<CorepackOperationResponse, String> {
    // Check if corepack is available first
    let corepack_status = crate::commands::version::detect_corepack();
    if !corepack_status.available {
        return Ok(CorepackOperationResponse {
            success: false,
            message: None,
            error: Some("Corepack is not installed. Please install Node.js 16+ which includes Corepack.".to_string()),
        });
    }

    // Run corepack enable
    let output = crate::utils::path_resolver::create_command("corepack")
        .arg("enable")
        .output()
        .map_err(|e| format!("Failed to run corepack enable: {}", e))?;

    if output.status.success() {
        Ok(CorepackOperationResponse {
            success: true,
            message: Some("Corepack enabled successfully. Package manager shims have been installed.".to_string()),
            error: None,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if it's a permission error
        if stderr.contains("EACCES") || stderr.contains("permission denied") {
            Ok(CorepackOperationResponse {
                success: false,
                message: None,
                error: Some(format!(
                    "Permission denied. Please run manually with sudo: sudo corepack enable\n\nError: {}",
                    stderr.trim()
                )),
            })
        } else {
            Ok(CorepackOperationResponse {
                success: false,
                message: None,
                error: Some(format!("Failed to enable corepack: {}", stderr.trim())),
            })
        }
    }
}

/// Fix PNPM HOME conflict by removing problematic files
#[tauri::command]
pub async fn fix_pnpm_home_conflict() -> Result<CorepackOperationResponse, String> {
    let conflict = detect_pnpm_home_conflict();

    if !conflict.has_conflict {
        return Ok(CorepackOperationResponse {
            success: true,
            message: Some("No PNPM HOME conflict detected.".to_string()),
            error: None,
        });
    }

    let problematic_path = conflict.problematic_path.unwrap_or_default();
    let pnpx_path = format!("{}x", problematic_path);

    // Remove the problematic pnpm file
    if std::path::Path::new(&problematic_path).exists() {
        std::fs::remove_file(&problematic_path)
            .map_err(|e| format!("Failed to remove {}: {}", problematic_path, e))?;
    }

    // Also remove pnpx if it exists
    if std::path::Path::new(&pnpx_path).exists() {
        std::fs::remove_file(&pnpx_path)
            .map_err(|e| format!("Failed to remove {}: {}", pnpx_path, e))?;
    }

    Ok(CorepackOperationResponse {
        success: true,
        message: Some(format!(
            "Removed conflicting files: {} and {}. Corepack should now work correctly.",
            problematic_path, pnpx_path
        )),
        error: None,
    })
}
