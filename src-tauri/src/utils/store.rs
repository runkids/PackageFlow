// Store helper functions
// Provides utilities for loading and saving data using tauri-plugin-store

use crate::models::{Execution, Project, SecurityScanData, Workflow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Default scan reminder interval in days
fn default_scan_reminder_interval() -> u32 {
    7
}

/// Default project sort mode
fn default_project_sort_mode() -> String {
    String::from("name")
}

/// Default webhook notifications enabled
fn default_webhook_notifications_enabled() -> bool {
    true
}

/// Default workflow sort mode
fn default_workflow_sort_mode() -> String {
    String::from("updated")
}

/// Default global shortcuts enabled
fn default_global_shortcuts_enabled() -> bool {
    true
}

/// Default global toggle shortcut
fn default_global_toggle_shortcut() -> String {
    String::from("cmd+shift+p")
}

/// Default path display format
fn default_path_display_format() -> String {
    String::from("short")
}

/// Custom shortcut binding configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomShortcutBinding {
    /// Shortcut identifier
    pub id: String,
    /// Custom key combination (None = use default)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_key: Option<String>,
    /// Whether this shortcut is enabled
    pub enabled: bool,
}

/// Keyboard shortcuts settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardShortcutsSettings {
    /// Settings version for migration
    #[serde(default = "default_keyboard_shortcuts_version")]
    pub version: u32,
    /// Custom shortcut bindings (keyed by shortcut id)
    #[serde(default)]
    pub custom_bindings: HashMap<String, CustomShortcutBinding>,
    /// Whether global shortcuts are enabled
    #[serde(default = "default_global_shortcuts_enabled")]
    pub global_shortcuts_enabled: bool,
    /// Global shortcut for toggling window visibility
    #[serde(default = "default_global_toggle_shortcut")]
    pub global_toggle_shortcut: String,
}

fn default_keyboard_shortcuts_version() -> u32 {
    1
}

impl Default for KeyboardShortcutsSettings {
    fn default() -> Self {
        Self {
            version: default_keyboard_shortcuts_version(),
            custom_bindings: HashMap::new(),
            global_shortcuts_enabled: default_global_shortcuts_enabled(),
            global_toggle_shortcut: default_global_toggle_shortcut(),
        }
    }
}

/// Application settings stored in settings.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_timeout: u64,
    pub sidebar_width: u32,
    pub terminal_height: u32,
    pub theme: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_workflow_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_project_id: Option<String>,
    /// Security scan reminder interval in days (default: 7)
    #[serde(default = "default_scan_reminder_interval")]
    pub scan_reminder_interval_days: u32,
    /// Project sort mode: "name" | "lastOpened" | "created" | "custom"
    #[serde(default = "default_project_sort_mode")]
    pub project_sort_mode: String,
    /// Project order for custom sorting (array of project IDs)
    #[serde(default)]
    pub project_order: Vec<String>,
    /// Whether to show desktop notifications for webhook events (default: true)
    #[serde(default = "default_webhook_notifications_enabled")]
    pub webhook_notifications_enabled: bool,
    /// Workflow sort mode: "name" | "updated" | "created" | "custom"
    #[serde(default = "default_workflow_sort_mode")]
    pub workflow_sort_mode: String,
    /// Workflow order for custom sorting (array of workflow IDs)
    #[serde(default)]
    pub workflow_order: Vec<String>,
    /// Custom store path for packageflow.json (None = use default app data directory)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_store_path: Option<String>,
    /// Keyboard shortcuts settings
    #[serde(default)]
    pub keyboard_shortcuts: KeyboardShortcutsSettings,
    /// Path display format: "short" (with ~/...) | "full" (complete path)
    #[serde(default = "default_path_display_format")]
    pub path_display_format: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_timeout: 600000,
            sidebar_width: 240,
            terminal_height: 200,
            theme: String::from("dark"),
            last_workflow_id: None,
            last_project_id: None,
            scan_reminder_interval_days: default_scan_reminder_interval(),
            project_sort_mode: default_project_sort_mode(),
            project_order: Vec::new(),
            webhook_notifications_enabled: default_webhook_notifications_enabled(),
            workflow_sort_mode: default_workflow_sort_mode(),
            workflow_order: Vec::new(),
            custom_store_path: None,
            keyboard_shortcuts: KeyboardShortcutsSettings::default(),
            path_display_format: default_path_display_format(),
        }
    }
}

/// Complete store schema
/// Note: Uses `#[serde(default)]` on all fields to gracefully handle unknown fields (e.g., mcp_server_config)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreData {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub workflows: Vec<Workflow>,
    #[serde(default)]
    pub running_executions: HashMap<String, Execution>,
    #[serde(default)]
    pub settings: AppSettings,
    /// Security scan data per project (keyed by project ID)
    #[serde(default)]
    pub security_scans: HashMap<String, SecurityScanData>,
}

impl Default for StoreData {
    fn default() -> Self {
        Self {
            version: String::from("2.0.0"),
            projects: Vec::new(),
            workflows: Vec::new(),
            running_executions: HashMap::new(),
            settings: AppSettings::default(),
            security_scans: HashMap::new(),
        }
    }
}

/// Store file name
/// Note: Must match frontend store file in src/lib/workflow-storage.ts
pub const STORE_FILE: &str = "packageflow.json";
