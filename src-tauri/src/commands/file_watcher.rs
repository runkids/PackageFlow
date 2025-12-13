// File watcher commands
// Commands for managing package.json file watching

use crate::services::FileWatcherManager;
use tauri::{AppHandle, State};

/// Response type for file watcher commands
#[derive(serde::Serialize)]
pub struct FileWatcherResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Start watching a project's package.json file for changes
#[tauri::command]
pub async fn watch_project(
    app: AppHandle,
    state: State<'_, FileWatcherManager>,
    project_path: String,
) -> Result<FileWatcherResponse, String> {
    match state.watch_project(&app, &project_path) {
        Ok(()) => Ok(FileWatcherResponse {
            success: true,
            error: None,
        }),
        Err(e) => Ok(FileWatcherResponse {
            success: false,
            error: Some(e),
        }),
    }
}

/// Stop watching a project's package.json file
#[tauri::command]
pub async fn unwatch_project(
    state: State<'_, FileWatcherManager>,
    project_path: String,
) -> Result<FileWatcherResponse, String> {
    match state.unwatch_project(&project_path) {
        Ok(()) => Ok(FileWatcherResponse {
            success: true,
            error: None,
        }),
        Err(e) => Ok(FileWatcherResponse {
            success: false,
            error: Some(e),
        }),
    }
}

/// Stop watching all projects
#[tauri::command]
pub async fn unwatch_all_projects(
    state: State<'_, FileWatcherManager>,
) -> Result<FileWatcherResponse, String> {
    match state.unwatch_all() {
        Ok(()) => Ok(FileWatcherResponse {
            success: true,
            error: None,
        }),
        Err(e) => Ok(FileWatcherResponse {
            success: false,
            error: Some(e),
        }),
    }
}

/// Get list of watched project paths
#[tauri::command]
pub async fn get_watched_projects(
    state: State<'_, FileWatcherManager>,
) -> Result<Vec<String>, String> {
    state.get_watched_paths()
}
