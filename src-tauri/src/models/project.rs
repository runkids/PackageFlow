// Project data models
// Represents a frontend project (single project or monorepo root)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::worktree_sessions::WorktreeSession;

/// Package manager type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PackageManager {
    Npm,
    Yarn,
    Pnpm,
    Bun,
    Unknown,
}

impl std::fmt::Display for PackageManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PackageManager::Npm => write!(f, "npm"),
            PackageManager::Pnpm => write!(f, "pnpm"),
            PackageManager::Yarn => write!(f, "yarn"),
            PackageManager::Bun => write!(f, "bun"),
            PackageManager::Unknown => write!(f, "unknown"),
        }
    }
}

impl Default for PackageManager {
    fn default() -> Self {
        PackageManager::Unknown
    }
}

/// Represents a frontend project
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub path: String,
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub is_monorepo: bool,
    pub package_manager: PackageManager,
    pub scripts: HashMap<String, String>,
    #[serde(default)]
    pub worktree_sessions: Vec<WorktreeSession>,
    pub created_at: String,
    pub last_opened_at: String,
}

impl Project {
    pub fn new(id: String, path: String, name: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            path,
            name,
            version: String::from("0.0.0"),
            description: None,
            is_monorepo: false,
            package_manager: PackageManager::Unknown,
            scripts: HashMap::new(),
            worktree_sessions: Vec::new(),
            created_at: now.clone(),
            last_opened_at: now,
        }
    }
}

/// Represents a workspace package in a monorepo
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePackage {
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub version: String,
    pub scripts: HashMap<String, String>,
    pub dependencies: Vec<String>,
}

impl WorkspacePackage {
    pub fn new(name: String, relative_path: String, absolute_path: String) -> Self {
        Self {
            name,
            relative_path,
            absolute_path,
            version: String::from("0.0.0"),
            scripts: HashMap::new(),
            dependencies: Vec::new(),
        }
    }
}
