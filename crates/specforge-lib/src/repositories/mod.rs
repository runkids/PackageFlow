// Repository Layer
// Provides data access abstractions for SQLite database

pub mod mcp_repo;
pub mod notification_repo;
pub mod settings_repo;
pub mod workflow_repo;

// Re-export commonly used repositories
pub use mcp_repo::{MCPRepository, McpLogEntry};
pub use notification_repo::{NotificationListResponse, NotificationRecord, NotificationRepository};
pub use settings_repo::{
    RecentTemplateEntry, SettingsRepository, TemplatePreferences, TemplateViewMode,
};
pub use workflow_repo::WorkflowRepository;

// Note: ExecutionRepository is in src-tauri/src/repositories/ because it depends on commands
