// Services module
// Business logic and background services

pub mod ai;
pub mod ai_assistant;
pub mod ai_cli;
pub mod crypto;
pub mod deploy;
pub mod file_watcher;
pub mod incoming_webhook;
pub mod mcp_action;
pub mod notification;

pub use crypto::*;
pub use file_watcher::*;
pub use incoming_webhook::*;
pub use notification::*;
// Note: ai types are not glob re-exported to keep namespace clean
// Use crate::services::ai::* explicitly when needed
