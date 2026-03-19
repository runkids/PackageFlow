use crate::models::project::{Project, ProjectStore, ProjectType};
use std::path::PathBuf;

fn store_path() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.skillshare.app");
    std::fs::create_dir_all(&dir).ok();
    dir.join("projects.json")
}

pub fn load() -> ProjectStore {
    let path = store_path();
    if path.exists() {
        let data = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        ProjectStore::default()
    }
}

pub fn save(store: &ProjectStore) -> Result<(), String> {
    let path = store_path();
    let data =
        serde_json::to_string_pretty(store).map_err(|e| format!("Serialize error: {e}"))?;
    std::fs::write(&path, data).map_err(|e| format!("Write error: {e}"))
}

pub fn add_project(
    store: &mut ProjectStore,
    name: String,
    path: String,
    project_type: ProjectType,
) -> Project {
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
        project_type,
        added_at: chrono::Utc::now().to_rfc3339(),
    };
    store.projects.push(project.clone());
    if store.active_project_id.is_none() {
        store.active_project_id = Some(project.id.clone());
    }
    project
}

pub fn remove_project(store: &mut ProjectStore, id: &str) {
    store.projects.retain(|p| p.id != id);
    if store.active_project_id.as_deref() == Some(id) {
        store.active_project_id = store.projects.first().map(|p| p.id.clone());
    }
}

pub fn set_active(store: &mut ProjectStore, id: &str) -> Result<(), String> {
    if store.projects.iter().any(|p| p.id == id) {
        store.active_project_id = Some(id.to_string());
        Ok(())
    } else {
        Err(format!("Project {id} not found"))
    }
}
