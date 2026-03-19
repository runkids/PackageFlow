use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectType {
    Global,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub project_type: ProjectType,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStore {
    pub projects: Vec<Project>,
    pub active_project_id: Option<String>,
}

impl ProjectStore {
    pub fn active_project(&self) -> Option<&Project> {
        self.active_project_id
            .as_ref()
            .and_then(|id| self.projects.iter().find(|p| &p.id == id))
    }
}
