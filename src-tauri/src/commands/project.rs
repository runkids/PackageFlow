// Project management commands
// Implements US2: Project Management Functions

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

use crate::models::{PackageManager, Project, WorkspacePackage};
use crate::utils::store::STORE_FILE;

/// Response for scan_project command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectResponse {
    pub success: bool,
    pub project: Option<Project>,
    pub workspaces: Option<Vec<WorkspacePackage>>,
    pub error: Option<String>,
}

/// Response for refresh_project command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshProjectResponse {
    pub success: bool,
    pub project: Option<Project>,
    pub workspaces: Option<Vec<WorkspacePackage>>,
    pub error: Option<String>,
}

/// Volta configuration in package.json
#[derive(Debug, Clone, Deserialize)]
pub struct PackageJsonVolta {
    pub node: Option<String>,
    pub npm: Option<String>,
    pub yarn: Option<String>,
    pub pnpm: Option<String>,
}

/// Engines configuration in package.json
#[derive(Debug, Clone, Deserialize)]
pub struct PackageJsonEngines {
    pub node: Option<String>,
    pub npm: Option<String>,
    pub yarn: Option<String>,
    pub pnpm: Option<String>,
}

/// Package.json structure for parsing
#[derive(Debug, Deserialize)]
pub struct PackageJson {
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub scripts: Option<HashMap<String, String>>,
    pub workspaces: Option<WorkspacesConfig>,
    // Version management fields (006-node-package-manager)
    #[serde(rename = "packageManager")]
    pub package_manager: Option<String>,
    pub volta: Option<PackageJsonVolta>,
    pub engines: Option<PackageJsonEngines>,
}

/// Workspaces configuration in package.json
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum WorkspacesConfig {
    Array(Vec<String>),
    Object { packages: Vec<String> },
}

/// Detect package manager based on lock files
fn detect_package_manager(path: &Path) -> PackageManager {
    if path.join("pnpm-lock.yaml").exists() {
        PackageManager::Pnpm
    } else if path.join("yarn.lock").exists() {
        PackageManager::Yarn
    } else if path.join("package-lock.json").exists() {
        PackageManager::Npm
    } else {
        PackageManager::Unknown
    }
}

/// Check if project is a monorepo
fn is_monorepo(package_json: &PackageJson, path: &Path) -> bool {
    // Check package.json workspaces field
    if package_json.workspaces.is_some() {
        return true;
    }

    // Check for pnpm-workspace.yaml
    if path.join("pnpm-workspace.yaml").exists() {
        return true;
    }

    false
}

/// Get workspace patterns from package.json or pnpm-workspace.yaml
fn get_workspace_patterns(package_json: &PackageJson, path: &Path) -> Vec<String> {
    // First try package.json workspaces field
    if let Some(ref ws) = package_json.workspaces {
        return match ws {
            WorkspacesConfig::Array(patterns) => patterns.clone(),
            WorkspacesConfig::Object { packages } => packages.clone(),
        };
    }

    // Try pnpm-workspace.yaml
    let pnpm_workspace_path = path.join("pnpm-workspace.yaml");
    if pnpm_workspace_path.exists() {
        if let Ok(content) = fs::read_to_string(&pnpm_workspace_path) {
            // Simple YAML parsing for packages field
            // Format: packages:\n  - 'packages/*'\n  - 'apps/*'
            let mut patterns = Vec::new();
            let mut in_packages = false;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("packages:") {
                    in_packages = true;
                    continue;
                }
                if in_packages {
                    if trimmed.starts_with('-') {
                        // Extract pattern from "- 'pattern'" or "- pattern"
                        let pattern = trimmed[1..]
                            .trim()
                            .trim_matches('\'')
                            .trim_matches('"')
                            .to_string();
                        if !pattern.is_empty() {
                            patterns.push(pattern);
                        }
                    } else if !trimmed.is_empty() && !trimmed.starts_with('#') {
                        // Non-indented line that's not a comment means end of packages section
                        break;
                    }
                }
            }
            return patterns;
        }
    }

    vec![]
}

/// Scan workspace packages based on patterns
fn scan_workspace_packages(root_path: &Path, patterns: &[String]) -> Vec<WorkspacePackage> {
    let mut packages = Vec::new();

    for pattern in patterns {
        // Handle glob patterns like "packages/*" or "apps/**"
        let pattern_path = root_path.join(pattern);
        let pattern_str = pattern_path.to_string_lossy();

        // Use simple glob matching
        if let Ok(entries) = glob::glob(&pattern_str) {
            for entry in entries.flatten() {
                // Skip node_modules directories
                let path_str = entry.to_string_lossy();
                if path_str.contains("/node_modules/") || path_str.contains("\\node_modules\\") {
                    continue;
                }

                let package_json_path = entry.join("package.json");
                if package_json_path.exists() {
                    if let Ok(content) = fs::read_to_string(&package_json_path) {
                        if let Ok(pkg_json) = serde_json::from_str::<PackageJson>(&content) {
                            let name = pkg_json.name.unwrap_or_else(|| {
                                entry
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_else(|| "unnamed".to_string())
                            });

                            let relative_path = entry
                                .strip_prefix(root_path)
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_else(|_| entry.to_string_lossy().to_string());

                            packages.push(WorkspacePackage {
                                name,
                                version: pkg_json.version.unwrap_or_else(|| "0.0.0".to_string()),
                                relative_path,
                                absolute_path: entry.to_string_lossy().to_string(),
                                scripts: pkg_json.scripts.unwrap_or_default(),
                                dependencies: vec![],
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort by name for consistent ordering
    packages.sort_by(|a, b| a.name.cmp(&b.name));
    packages
}

/// Parse package.json at given path
pub fn parse_package_json(path: &Path) -> Result<PackageJson, String> {
    let package_json_path = path.join("package.json");

    if !package_json_path.exists() {
        return Err("NO_PACKAGE_JSON".to_string());
    }

    let content =
        fs::read_to_string(&package_json_path).map_err(|_| "INVALID_PACKAGE_JSON".to_string())?;

    serde_json::from_str(&content).map_err(|_| "INVALID_PACKAGE_JSON".to_string())
}

/// Scan a project directory
#[tauri::command]
pub async fn scan_project(
    app: tauri::AppHandle,
    path: String,
) -> Result<ScanProjectResponse, String> {
    let project_path = Path::new(&path);

    // Validate path exists
    if !project_path.exists() || !project_path.is_dir() {
        return Ok(ScanProjectResponse {
            success: false,
            project: None,
            workspaces: None,
            error: Some("INVALID_PATH".to_string()),
        });
    }

    // Check if project already exists
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let existing_projects: Vec<Project> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    if existing_projects.iter().any(|p| p.path == path) {
        return Ok(ScanProjectResponse {
            success: false,
            project: None,
            workspaces: None,
            error: Some("ALREADY_EXISTS".to_string()),
        });
    }

    // Parse package.json
    let package_json = match parse_package_json(project_path) {
        Ok(pj) => pj,
        Err(e) => {
            return Ok(ScanProjectResponse {
                success: false,
                project: None,
                workspaces: None,
                error: Some(e),
            });
        }
    };

    let now = Utc::now().to_rfc3339();
    let package_manager = detect_package_manager(project_path);
    let is_mono = is_monorepo(&package_json, project_path);

    // Get workspace patterns BEFORE consuming package_json fields
    let workspace_patterns = if is_mono {
        get_workspace_patterns(&package_json, project_path)
    } else {
        vec![]
    };

    let project = Project {
        id: Uuid::new_v4().to_string(),
        path: path.clone(),
        name: package_json.name.unwrap_or_else(|| "unnamed".to_string()),
        version: package_json.version.unwrap_or_else(|| "0.0.0".to_string()),
        description: package_json.description,
        is_monorepo: is_mono,
        package_manager,
        scripts: package_json.scripts.unwrap_or_default(),
        worktree_sessions: Vec::new(),
        created_at: now.clone(),
        last_opened_at: now,
    };

    // Parse workspace packages if monorepo
    let workspaces = if is_mono {
        let packages = scan_workspace_packages(project_path, &workspace_patterns);
        if packages.is_empty() {
            None
        } else {
            Some(packages)
        }
    } else {
        None
    };

    Ok(ScanProjectResponse {
        success: true,
        project: Some(project),
        workspaces,
        error: None,
    })
}

/// Save a project to store
#[tauri::command]
pub async fn save_project(app: tauri::AppHandle, project: Project) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut projects: Vec<Project> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Update or add project
    if let Some(idx) = projects.iter().position(|p| p.id == project.id) {
        projects[idx] = project;
    } else {
        projects.push(project);
    }

    store.set(
        "projects",
        serde_json::to_value(&projects).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Remove a project from store
#[tauri::command]
pub async fn remove_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut projects: Vec<Project> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    projects.retain(|p| p.id != id);

    store.set(
        "projects",
        serde_json::to_value(&projects).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Refresh project data from disk
#[tauri::command]
pub async fn refresh_project(
    app: tauri::AppHandle,
    id: String,
) -> Result<RefreshProjectResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut projects: Vec<Project> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Find project
    let project_idx = projects.iter().position(|p| p.id == id);

    if project_idx.is_none() {
        return Ok(RefreshProjectResponse {
            success: false,
            project: None,
            workspaces: None,
            error: Some("PROJECT_NOT_FOUND".to_string()),
        });
    }

    let idx = project_idx.unwrap();

    // Clone the values we need before mutating projects
    let project_id = projects[idx].id.clone();
    let project_path_str = projects[idx].path.clone();
    let project_created_at = projects[idx].created_at.clone();
    let project_worktree_sessions = projects[idx].worktree_sessions.clone();
    let project_path = Path::new(&project_path_str);

    // Check path still exists
    if !project_path.exists() {
        return Ok(RefreshProjectResponse {
            success: false,
            project: None,
            workspaces: None,
            error: Some("PATH_NOT_EXISTS".to_string()),
        });
    }

    // Re-parse package.json
    let package_json = match parse_package_json(project_path) {
        Ok(pj) => pj,
        Err(e) => {
            return Ok(RefreshProjectResponse {
                success: false,
                project: None,
                workspaces: None,
                error: Some(e),
            });
        }
    };

    let now = Utc::now().to_rfc3339();
    let package_manager = detect_package_manager(project_path);
    let is_mono = is_monorepo(&package_json, project_path);

    // Get workspace patterns BEFORE consuming package_json fields
    let workspace_patterns = if is_mono {
        get_workspace_patterns(&package_json, project_path)
    } else {
        vec![]
    };

    // Update project
    let updated_project = Project {
        id: project_id,
        path: project_path_str.clone(),
        name: package_json.name.unwrap_or_else(|| "unnamed".to_string()),
        version: package_json.version.unwrap_or_else(|| "0.0.0".to_string()),
        description: package_json.description,
        is_monorepo: is_mono,
        package_manager,
        scripts: package_json.scripts.unwrap_or_default(),
        worktree_sessions: project_worktree_sessions,
        created_at: project_created_at,
        last_opened_at: now,
    };

    projects[idx] = updated_project.clone();

    // Save updated projects
    store.set(
        "projects",
        serde_json::to_value(&projects).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    // Parse workspace packages if monorepo
    let workspaces = if is_mono {
        let packages = scan_workspace_packages(project_path, &workspace_patterns);
        if packages.is_empty() {
            None
        } else {
            Some(packages)
        }
    } else {
        None
    };

    Ok(RefreshProjectResponse {
        success: true,
        project: Some(updated_project),
        workspaces,
        error: None,
    })
}

/// Get workspace packages for a monorepo
#[tauri::command]
pub async fn get_workspace_packages(
    _app: tauri::AppHandle,
    project_path: String,
) -> Result<Vec<WorkspacePackage>, String> {
    let path = Path::new(&project_path);

    // Validate path exists
    if !path.exists() || !path.is_dir() {
        return Err("INVALID_PATH".to_string());
    }

    // Parse package.json
    let package_json = parse_package_json(path)?;

    // Check if it's a monorepo
    if !is_monorepo(&package_json, path) {
        return Ok(vec![]);
    }

    // Get workspace patterns and scan packages
    let patterns = get_workspace_patterns(&package_json, path);
    let packages = scan_workspace_packages(path, &patterns);

    Ok(packages)
}

/// Response for trash_node_modules command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashNodeModulesResponse {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

/// Move node_modules to trash (soft delete)
/// This is safer than permanent deletion and allows recovery if needed
#[tauri::command]
pub async fn trash_node_modules(
    _app: tauri::AppHandle,
    project_path: String,
) -> Result<TrashNodeModulesResponse, String> {
    let path = Path::new(&project_path);

    // Validate path exists
    if !path.exists() || !path.is_dir() {
        return Ok(TrashNodeModulesResponse {
            success: false,
            message: None,
            error: Some("Invalid project path".to_string()),
        });
    }

    let node_modules_path = path.join("node_modules");

    // Check if node_modules exists
    if !node_modules_path.exists() {
        return Ok(TrashNodeModulesResponse {
            success: true,
            message: Some("node_modules directory does not exist".to_string()),
            error: None,
        });
    }

    // Move to trash
    match trash::delete(&node_modules_path) {
        Ok(_) => {
            println!(
                "[project] Moved node_modules to trash: {}",
                node_modules_path.display()
            );
            Ok(TrashNodeModulesResponse {
                success: true,
                message: Some(format!("Successfully moved node_modules to trash")),
                error: None,
            })
        }
        Err(e) => {
            println!("[project] Failed to trash node_modules: {}", e);
            Ok(TrashNodeModulesResponse {
                success: false,
                message: None,
                error: Some(format!("Failed to move node_modules to trash: {}", e)),
            })
        }
    }
}
