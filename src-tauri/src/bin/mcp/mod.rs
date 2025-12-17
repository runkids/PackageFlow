//! MCP Server modules for PackageFlow
//!
//! This module contains the extracted components from mcp_server.rs
//! for better maintainability and organization.

// Enabled modules
pub mod types;
pub mod security;
pub mod state;
pub mod templates;
pub mod store;
pub mod background;

// Modules to be populated incrementally
// pub mod utils;

// Re-export commonly used items
pub use types::*;
pub use security::{ToolCategory, get_tool_category, is_tool_allowed};
pub use state::{RATE_LIMITER, TOOL_RATE_LIMITERS, ACTION_SEMAPHORE};
pub use templates::get_builtin_templates;
pub use store::{
    read_store_data, write_store_data, log_request, open_database, get_database_path,
    StoreData, Project, Workflow, WorkflowNode, NodePosition, CustomStepTemplate,
};
pub use background::{
    BackgroundProcessManager, BackgroundProcessStatus, BackgroundProcessInfo, ProcessOutput,
    CircularBuffer, BackgroundProcessState, BACKGROUND_PROCESS_MANAGER,
    CLEANUP_INTERVAL_SECS,
};
