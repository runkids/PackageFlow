// Version management commands
// Feature: 006-node-package-manager

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

use crate::commands::project::parse_package_json;
use crate::models::{
    CompatibilityItem, PackageManager, RecommendedAction, SystemEnvironment, ToolStatus,
    VersionCompatibility, VersionRequirement, VersionSource, VersionTool,
};
use crate::utils::path_resolver;

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionRequirementResponse {
    pub success: bool,
    pub data: Option<VersionRequirement>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemEnvironmentResponse {
    pub success: bool,
    pub data: Option<SystemEnvironment>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionCompatibilityResponse {
    pub success: bool,
    pub data: Option<VersionCompatibility>,
    pub error: Option<String>,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Parse packageManager field format: (npm|pnpm|yarn)@VERSION[+HASH]
fn parse_package_manager_field(value: &str) -> Option<(PackageManager, String)> {
    let re =
        Regex::new(r"^(npm|pnpm|yarn|bun)@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)(?:\+[a-zA-Z0-9]+)?$")
            .ok()?;
    let caps = re.captures(value)?;

    let pm_name = caps.get(1)?.as_str();
    let version = caps.get(2)?.as_str().to_string();

    let pm = match pm_name {
        "npm" => PackageManager::Npm,
        "pnpm" => PackageManager::Pnpm,
        "yarn" => PackageManager::Yarn,
        "bun" => PackageManager::Bun,
        _ => return None,
    };

    Some((pm, version))
}

/// Detect tool version by running command
fn detect_tool_version(command: &str) -> ToolStatus {
    // Use path_resolver to find the tool (handles macOS GUI app PATH issues)
    let path = path_resolver::find_tool(command);

    if path.is_none() {
        return ToolStatus::default();
    }

    // Get version using create_command for proper environment
    let version_output = path_resolver::create_command(command)
        .arg("--version")
        .output();

    let version = match version_output {
        Ok(output) if output.status.success() => {
            let ver_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // Extract version number (handle formats like "v20.14.0" or "9.15.0" or "volta 1.1.1")
            let re = Regex::new(r"v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]*)?)").ok();
            re.and_then(|r| r.captures(&ver_str))
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
        }
        _ => None,
    };

    ToolStatus {
        available: true,
        version,
        path,
    }
}

/// Detect Volta installation
/// Checks common installation paths since GUI apps may not inherit shell PATH
pub fn detect_volta() -> ToolStatus {
    // First try the standard detection
    let status = detect_tool_version("volta");
    if status.available {
        return status;
    }

    // GUI apps on macOS don't inherit shell PATH, so check common Volta paths
    let home = path_resolver::get_home_dir().unwrap_or_default();
    let common_paths = [
        format!("{}/.volta/bin/volta", home),
        "/usr/local/bin/volta".to_string(),
        "/opt/homebrew/bin/volta".to_string(),
    ];

    for volta_path in &common_paths {
        let path = std::path::Path::new(volta_path);
        if path.exists() {
            // Get version - use full path with proper environment
            let mut cmd = Command::new(volta_path);
            if let Some(home) = path_resolver::get_home_dir() {
                cmd.env("HOME", &home);
            }
            cmd.env("PATH", path_resolver::get_path());

            let version_output = cmd.arg("--version").output();

            let version = match version_output {
                Ok(output) if output.status.success() => {
                    let ver_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let re = Regex::new(r"v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]*)?)").ok();
                    re.and_then(|r| r.captures(&ver_str))
                        .and_then(|caps| caps.get(1))
                        .map(|m| m.as_str().to_string())
                }
                _ => None,
            };

            return ToolStatus {
                available: true,
                version,
                path: Some(volta_path.clone()),
            };
        }
    }

    ToolStatus::default()
}

/// Volta/Corepack conflict information
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VoltaCorepackConflict {
    /// Whether a conflict is detected
    pub has_conflict: bool,
    /// Affected tools (yarn, pnpm, etc.)
    pub affected_tools: Vec<String>,
    /// Human-readable description of the conflict
    pub description: Option<String>,
    /// Suggested fix command
    pub fix_command: Option<String>,
}

/// Detect if Volta shims have been overwritten by Corepack
/// This happens when user runs `corepack enable` and it creates symlinks in ~/.volta/bin
fn detect_volta_corepack_conflict() -> VoltaCorepackConflict {
    let home = match path_resolver::get_home_dir() {
        Some(h) => h,
        None => return VoltaCorepackConflict::default(),
    };

    let volta_bin = format!("{}/.volta/bin", home);
    let volta_bin_path = std::path::Path::new(&volta_bin);

    if !volta_bin_path.exists() {
        return VoltaCorepackConflict::default();
    }

    let tools_to_check = ["yarn", "yarnpkg", "pnpm", "pnpx"];
    let mut affected_tools = Vec::new();

    for tool in &tools_to_check {
        let tool_path = volta_bin_path.join(tool);
        if !tool_path.exists() {
            continue;
        }

        // Check if it's a symlink pointing to corepack
        if let Ok(target) = std::fs::read_link(&tool_path) {
            let target_str = target.to_string_lossy();
            if target_str.contains("corepack") {
                affected_tools.push(tool.to_string());
            }
        } else {
            // Not a symlink - check if it's a corepack script
            if let Ok(content) = std::fs::read_to_string(&tool_path) {
                if content.contains("corepack") {
                    affected_tools.push(tool.to_string());
                }
            }
        }
    }

    if affected_tools.is_empty() {
        return VoltaCorepackConflict::default();
    }

    // Generate fix command
    let fix_commands: Vec<String> = affected_tools
        .iter()
        .map(|t| format!("ln -sf volta-shim ~/.volta/bin/{}", t))
        .collect();

    VoltaCorepackConflict {
        has_conflict: true,
        affected_tools: affected_tools.clone(),
        description: Some(format!(
            "Corepack has overwritten Volta's {} shim(s). Volta version switching won't work for these tools.",
            affected_tools.join(", ")
        )),
        fix_command: Some(fix_commands.join(" && ")),
    }
}

/// Detect Corepack installation
/// Checks common installation paths since GUI apps may not inherit shell PATH
fn detect_corepack() -> ToolStatus {
    // First try the standard detection
    let status = detect_tool_version("corepack");
    if status.available {
        return status;
    }

    // GUI apps on macOS don't inherit shell PATH, so check common paths
    // Corepack is typically bundled with Node.js or installed globally via npm
    let home = path_resolver::get_home_dir().unwrap_or_default();
    let common_paths = [
        "/usr/local/bin/corepack".to_string(),
        "/opt/homebrew/bin/corepack".to_string(),
        format!("{}/.volta/bin/corepack", home),
        format!("{}/.nvm/versions/node/*/bin/corepack", home), // NVM pattern (we'll try exact paths below)
    ];

    // Also check NVM versions if available
    let mut paths_to_check: Vec<String> = common_paths
        .iter()
        .filter(|p| !p.contains('*'))
        .cloned()
        .collect();

    // Try to find NVM corepack
    let nvm_dir = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        for entry in entries.flatten() {
            let corepack_path = entry.path().join("bin/corepack");
            if corepack_path.exists() {
                paths_to_check.push(corepack_path.to_string_lossy().to_string());
            }
        }
    }

    for corepack_path in &paths_to_check {
        let path = std::path::Path::new(corepack_path);
        if path.exists() {
            // Get version - use full path with proper environment
            let mut cmd = Command::new(corepack_path);
            if let Some(home) = path_resolver::get_home_dir() {
                cmd.env("HOME", &home);
            }
            cmd.env("PATH", path_resolver::get_path());

            let version_output = cmd.arg("--version").output();

            let version = match version_output {
                Ok(output) if output.status.success() => {
                    let ver_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let re = Regex::new(r"v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]*)?)").ok();
                    re.and_then(|r| r.captures(&ver_str))
                        .and_then(|caps| caps.get(1))
                        .map(|m| m.as_str().to_string())
                }
                _ => None,
            };

            return ToolStatus {
                available: true,
                version,
                path: Some(corepack_path.clone()),
            };
        }
    }

    ToolStatus::default()
}

/// Check if a version satisfies a semver range
fn check_semver_satisfies(required: &str, current: &str) -> bool {
    // Parse the required range
    let range = match node_semver::Range::parse(required) {
        Ok(r) => r,
        Err(_) => return false,
    };

    // Parse the current version
    let version = match node_semver::Version::parse(current) {
        Ok(v) => v,
        Err(_) => return false,
    };

    range.satisfies(&version)
}

/// Determine recommended action based on compatibility and available tools
fn determine_recommended_action(
    is_compatible: bool,
    node_compatible: bool,
    pm_compatible: bool,
    volta_available: bool,
    corepack_available: bool,
    has_volta_config: bool,
    has_package_manager_field: bool,
    pm_is_pnpm: bool,
) -> RecommendedAction {
    if is_compatible {
        return RecommendedAction::Execute;
    }

    // Volta supports: Node.js, npm, yarn (NOT pnpm)
    // Corepack supports: npm, yarn, pnpm (requires packageManager field)

    // If pnpm is incompatible - Volta can't help, try Corepack
    if !pm_compatible && pm_is_pnpm {
        if corepack_available && has_package_manager_field {
            return RecommendedAction::UseCorepack;
        }
        // No auto-fix available for pnpm without packageManager field
        return RecommendedAction::WarnAndAsk;
    }

    // For Node.js or npm/yarn incompatibility - Volta can help
    if volta_available && has_volta_config {
        // Volta can fix Node.js version
        if !node_compatible {
            return RecommendedAction::UseVolta;
        }
        // Volta can also fix npm/yarn version (not pnpm)
        if !pm_compatible && !pm_is_pnpm {
            return RecommendedAction::UseVolta;
        }
    }

    // Try Corepack as fallback for package manager issues
    if !pm_compatible && corepack_available && has_package_manager_field {
        return RecommendedAction::UseCorepack;
    }

    // Fallback: warn and ask user
    RecommendedAction::WarnAndAsk
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get version requirement from project's package.json
#[tauri::command]
pub async fn get_version_requirement(
    project_path: String,
) -> Result<VersionRequirementResponse, String> {
    let path = Path::new(&project_path);

    // Parse package.json
    let package_json = match parse_package_json(path) {
        Ok(pj) => pj,
        Err(e) => {
            return Ok(VersionRequirementResponse {
                success: false,
                data: None,
                error: Some(e),
            });
        }
    };

    // Merge requirements from multiple sources
    // Priority for Node.js: volta > engines
    // Priority for package manager: volta > packageManager > engines

    let mut node_requirement: Option<String> = None;
    let mut node_source: Option<VersionSource> = None;
    let mut pm_name: Option<PackageManager> = None;
    let mut pm_version: Option<String> = None;
    let mut pm_source: Option<VersionSource> = None;
    let mut source = VersionSource::None;

    // 1. Check volta field (highest priority for Node.js)
    if let Some(volta) = &package_json.volta {
        if volta.node.is_some() {
            node_requirement = volta.node.clone();
            node_source = Some(VersionSource::Volta);
            source = VersionSource::Volta;
        }
        // Also check volta for package manager
        if let Some(pnpm) = &volta.pnpm {
            pm_name = Some(PackageManager::Pnpm);
            pm_version = Some(pnpm.clone());
            pm_source = Some(VersionSource::Volta);
        } else if let Some(yarn) = &volta.yarn {
            pm_name = Some(PackageManager::Yarn);
            pm_version = Some(yarn.clone());
            pm_source = Some(VersionSource::Volta);
        } else if let Some(npm) = &volta.npm {
            pm_name = Some(PackageManager::Npm);
            pm_version = Some(npm.clone());
            pm_source = Some(VersionSource::Volta);
        }
    }

    // 2. Check packageManager field (if pm not already set by volta)
    if pm_name.is_none() {
        if let Some(pm_field) = &package_json.package_manager {
            if let Some((pm, version)) = parse_package_manager_field(pm_field) {
                pm_name = Some(pm);
                pm_version = Some(version);
                pm_source = Some(VersionSource::PackageManager);
                if source == VersionSource::None {
                    source = VersionSource::PackageManager;
                }
            }
        }
    }

    // 3. Check engines field (fill in any gaps)
    if let Some(engines) = &package_json.engines {
        // Fill in Node.js if not set by volta
        if node_requirement.is_none() && engines.node.is_some() {
            node_requirement = engines.node.clone();
            node_source = Some(VersionSource::Engines);
            if source == VersionSource::None {
                source = VersionSource::Engines;
            }
        }

        // Fill in package manager if not set by volta or packageManager
        if pm_name.is_none() {
            if let Some(pnpm) = &engines.pnpm {
                pm_name = Some(PackageManager::Pnpm);
                pm_version = Some(pnpm.clone());
                pm_source = Some(VersionSource::Engines);
                if source == VersionSource::None {
                    source = VersionSource::Engines;
                }
            } else if let Some(yarn) = &engines.yarn {
                pm_name = Some(PackageManager::Yarn);
                pm_version = Some(yarn.clone());
                pm_source = Some(VersionSource::Engines);
                if source == VersionSource::None {
                    source = VersionSource::Engines;
                }
            } else if let Some(npm) = &engines.npm {
                pm_name = Some(PackageManager::Npm);
                pm_version = Some(npm.clone());
                pm_source = Some(VersionSource::Engines);
                if source == VersionSource::None {
                    source = VersionSource::Engines;
                }
            }
        }
    }

    // Return combined requirements
    Ok(VersionRequirementResponse {
        success: true,
        data: Some(VersionRequirement {
            node: node_requirement,
            package_manager_name: pm_name,
            package_manager_version: pm_version,
            source,
            node_source,
            package_manager_source: pm_source,
        }),
        error: None,
    })
}

/// Get system environment information
#[tauri::command]
pub async fn get_system_environment() -> Result<SystemEnvironmentResponse, String> {
    let node_status = detect_tool_version("node");
    let npm_status = detect_tool_version("npm");
    let yarn_status = detect_tool_version("yarn");
    let pnpm_status = detect_tool_version("pnpm");
    let volta_status = detect_volta();
    let corepack_status = detect_corepack();

    Ok(SystemEnvironmentResponse {
        success: true,
        data: Some(SystemEnvironment {
            node_version: node_status.version,
            npm_version: npm_status.version,
            yarn_version: yarn_status.version,
            pnpm_version: pnpm_status.version,
            volta: volta_status,
            corepack: corepack_status,
        }),
        error: None,
    })
}

/// Check version compatibility between project requirements and system environment
#[tauri::command]
pub async fn check_version_compatibility(
    project_path: String,
) -> Result<VersionCompatibilityResponse, String> {
    let path = Path::new(&project_path);

    // Get version requirement
    let requirement_response = get_version_requirement(project_path.clone()).await?;
    let requirement = match requirement_response.data {
        Some(req) => req,
        None => {
            return Ok(VersionCompatibilityResponse {
                success: false,
                data: None,
                error: requirement_response.error,
            });
        }
    };

    // Get system environment
    let env_response = get_system_environment().await?;
    let env = match env_response.data {
        Some(e) => e,
        None => {
            return Ok(VersionCompatibilityResponse {
                success: false,
                data: None,
                error: env_response.error,
            });
        }
    };

    // Check Node.js compatibility
    let node_compat =
        if let (Some(required), Some(current)) = (&requirement.node, &env.node_version) {
            let is_compat = check_semver_satisfies(required, current);
            CompatibilityItem {
                is_compatible: is_compat,
                current: Some(current.clone()),
                required: Some(required.clone()),
                name: Some("node".to_string()),
                message: if is_compat {
                    None
                } else {
                    Some(format!(
                        "Node.js version mismatch: current {}, required {}",
                        current, required
                    ))
                },
            }
        } else {
            CompatibilityItem::default()
        };

    // Check package manager compatibility
    let pm_compat = if let (Some(pm_name), Some(pm_version)) = (
        &requirement.package_manager_name,
        &requirement.package_manager_version,
    ) {
        let current_version = match pm_name {
            PackageManager::Npm => env.npm_version.clone(),
            PackageManager::Yarn => env.yarn_version.clone(),
            PackageManager::Pnpm => env.pnpm_version.clone(),
            PackageManager::Bun => None, // TODO: Add bun support
            PackageManager::Unknown => None,
        };

        let is_compat = if let Some(current) = &current_version {
            check_semver_satisfies(pm_version, current)
        } else {
            false
        };

        let pm_name_str = match pm_name {
            PackageManager::Npm => "npm",
            PackageManager::Yarn => "yarn",
            PackageManager::Pnpm => "pnpm",
            PackageManager::Bun => "bun",
            PackageManager::Unknown => "unknown",
        };

        CompatibilityItem {
            is_compatible: is_compat,
            current: current_version.clone(),
            required: Some(pm_version.clone()),
            name: Some(pm_name_str.to_string()),
            message: if is_compat {
                None
            } else {
                Some(format!(
                    "{} version mismatch: current {}, required {}",
                    pm_name_str,
                    current_version.unwrap_or_else(|| "not installed".to_string()),
                    pm_version
                ))
            },
        }
    } else {
        CompatibilityItem::default()
    };

    let is_compatible = node_compat.is_compatible && pm_compat.is_compatible;

    // Collect available tools
    let mut available_tools = Vec::new();
    if env.volta.available {
        available_tools.push(VersionTool::Volta);
    }
    if env.corepack.available {
        available_tools.push(VersionTool::Corepack);
    }

    // Determine recommended action
    let (has_volta_config, has_package_manager_field) = {
        if let Ok(pj) = parse_package_json(path) {
            (pj.volta.is_some(), pj.package_manager.is_some())
        } else {
            (false, false)
        }
    };

    // Check if the package manager is pnpm (Volta doesn't support pnpm)
    let pm_is_pnpm = requirement.package_manager_name == Some(PackageManager::Pnpm);

    let recommended_action = determine_recommended_action(
        is_compatible,
        node_compat.is_compatible,
        pm_compat.is_compatible,
        env.volta.available,
        env.corepack.available,
        has_volta_config,
        has_package_manager_field,
        pm_is_pnpm,
    );

    // Detect Volta/Corepack conflict
    let volta_corepack_conflict = if env.volta.available && has_volta_config {
        let conflict = detect_volta_corepack_conflict();
        if conflict.has_conflict {
            Some(crate::models::version::VoltaCorepackConflict {
                has_conflict: conflict.has_conflict,
                affected_tools: conflict.affected_tools,
                description: conflict.description,
                fix_command: conflict.fix_command,
            })
        } else {
            None
        }
    } else {
        None
    };

    Ok(VersionCompatibilityResponse {
        success: true,
        data: Some(VersionCompatibility {
            is_compatible,
            node: node_compat,
            package_manager: pm_compat,
            available_tools,
            recommended_action,
            volta_corepack_conflict,
        }),
        error: None,
    })
}

// ============================================================================
// Command Wrapper for Auto Version Switching
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandWrapperResponse {
    pub success: bool,
    /// The command to execute (might be wrapped with volta run)
    pub command: Option<String>,
    /// Arguments to pass to the command
    pub args: Option<Vec<String>>,
    /// Whether version switching is being used
    pub using_version_manager: bool,
    /// Which version manager is being used
    pub version_manager: Option<String>,
    pub error: Option<String>,
}

/// Get the wrapped command for execution with proper version management
/// This will use Volta if:
/// 1. The project has volta config in package.json
/// 2. Volta is installed on the system
#[tauri::command]
pub async fn get_wrapped_command(
    project_path: String,
    command: String,
    args: Vec<String>,
) -> Result<CommandWrapperResponse, String> {
    let path = Path::new(&project_path);

    // Check if project has Volta config
    let has_volta_config = match parse_package_json(path) {
        Ok(pj) => pj.volta.is_some(),
        Err(_) => false,
    };

    // Check if Volta is available
    let volta_status = detect_volta();

    // If project has Volta config AND Volta is installed, use volta run
    if has_volta_config && volta_status.available {
        // Use full path to volta binary to avoid PATH issues in GUI apps
        let volta_command = volta_status.path.unwrap_or_else(|| "volta".to_string());

        // volta run <command> [args...]
        let mut volta_args = vec!["run".to_string(), command];
        volta_args.extend(args);

        return Ok(CommandWrapperResponse {
            success: true,
            command: Some(volta_command),
            args: Some(volta_args),
            using_version_manager: true,
            version_manager: Some("volta".to_string()),
            error: None,
        });
    }

    // No version manager needed, return original command
    Ok(CommandWrapperResponse {
        success: true,
        command: Some(command),
        args: Some(args),
        using_version_manager: false,
        version_manager: None,
        error: None,
    })
}
