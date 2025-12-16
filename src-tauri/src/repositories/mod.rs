// Repository Layer
// Provides data access abstractions for SQLite database

pub mod ai_repo;
pub mod deploy_repo;
pub mod execution_repo;
pub mod mcp_action_repo;
pub mod mcp_repo;
pub mod notification_repo;
pub mod project_repo;
pub mod security_repo;
pub mod settings_repo;
pub mod template_repo;
pub mod workflow_repo;

// Re-export commonly used repositories
pub use ai_repo::AIRepository;
pub use deploy_repo::DeployRepository;
pub use execution_repo::ExecutionRepository;
pub use mcp_action_repo::MCPActionRepository;
pub use mcp_repo::{MCPRepository, McpLogEntry};
pub use notification_repo::{NotificationListResponse, NotificationRecord, NotificationRepository};
pub use project_repo::ProjectRepository;
pub use security_repo::SecurityRepository;
pub use settings_repo::{
    RecentTemplateEntry, SettingsRepository, TemplatePreferences, TemplateViewMode,
};
pub use template_repo::TemplateRepository;
pub use workflow_repo::WorkflowRepository;
