//! MCP Server modules for PackageFlow
//!
//! This module contains the extracted components from mcp_server.rs
//! for better maintainability and organization.

// Enabled modules
pub mod types;
pub mod security;
pub mod state;

// Modules to be populated incrementally
// pub mod templates;
// pub mod utils;
// pub mod store;
// pub mod background;

// Re-export commonly used items
pub use types::*;
pub use security::{ToolCategory, get_tool_category, is_tool_allowed};
pub use state::{RATE_LIMITER, TOOL_RATE_LIMITERS, ACTION_SEMAPHORE};
