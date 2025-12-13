// File Watcher Service
// Monitors package.json files for changes and emits events to frontend

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent, DebouncedEventKind, Debouncer};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

/// Event payload sent to frontend when package.json changes
#[derive(Clone, serde::Serialize)]
pub struct PackageJsonChangedPayload {
    /// The project path (parent directory of package.json)
    pub project_path: String,
    /// The full path to the changed file
    pub file_path: String,
}

/// Manages file watchers for multiple project paths
pub struct FileWatcherManager {
    /// Map of project path -> watcher
    watchers: Arc<Mutex<HashMap<String, Debouncer<RecommendedWatcher>>>>,
}

impl Default for FileWatcherManager {
    fn default() -> Self {
        Self::new()
    }
}

impl FileWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start watching a project's package.json file
    pub fn watch_project<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        project_path: &str,
    ) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        // Already watching this path
        if watchers.contains_key(project_path) {
            return Ok(());
        }

        let package_json_path = Path::new(project_path).join("package.json");
        if !package_json_path.exists() {
            return Err(format!(
                "package.json not found at {}",
                package_json_path.display()
            ));
        }

        let app_handle = app_handle.clone();
        let project_path_owned = project_path.to_string();
        let package_json_path_owned = package_json_path.clone();

        // Create debounced watcher (500ms debounce)
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            move |res: Result<Vec<DebouncedEvent>, notify::Error>| {
                match res {
                    Ok(events) => {
                        for event in events {
                            // Check if this is the package.json file
                            if event.path == package_json_path_owned {
                                if let DebouncedEventKind::Any = event.kind {
                                    log::info!(
                                        "[FileWatcher] package.json changed: {}",
                                        package_json_path_owned.display()
                                    );

                                    // Emit event to frontend
                                    let payload = PackageJsonChangedPayload {
                                        project_path: project_path_owned.clone(),
                                        file_path: package_json_path_owned
                                            .to_string_lossy()
                                            .to_string(),
                                    };

                                    if let Err(e) =
                                        app_handle.emit("package-json-changed", payload.clone())
                                    {
                                        log::error!("[FileWatcher] Failed to emit event: {}", e);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("[FileWatcher] Watch error: {:?}", e);
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to create debouncer: {}", e))?;

        // Watch the package.json file specifically
        debouncer
            .watcher()
            .watch(&package_json_path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        log::info!(
            "[FileWatcher] Started watching: {}",
            package_json_path.display()
        );
        watchers.insert(project_path.to_string(), debouncer);

        Ok(())
    }

    /// Stop watching a project
    pub fn unwatch_project(&self, project_path: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        if watchers.remove(project_path).is_some() {
            log::info!("[FileWatcher] Stopped watching: {}", project_path);
        }

        Ok(())
    }

    /// Stop watching all projects
    pub fn unwatch_all(&self) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;
        let count = watchers.len();
        watchers.clear();
        log::info!("[FileWatcher] Stopped watching {} projects", count);
        Ok(())
    }

    /// Get list of watched project paths
    pub fn get_watched_paths(&self) -> Result<Vec<String>, String> {
        let watchers = self.watchers.lock().map_err(|e| e.to_string())?;
        Ok(watchers.keys().cloned().collect())
    }
}
