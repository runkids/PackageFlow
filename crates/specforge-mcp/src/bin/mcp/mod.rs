//! MCP Server modules for SpecForge
//!
//! This module contains components extracted from mcp_server.rs
//! for better maintainability and organization.
//!
//! ## Module Structure
//!
//! - `types`: Parameter and response type definitions
//! - `security`: Tool categorization and permission checking
//! - `state`: Rate limiters and concurrency controls
//! - `templates`: Built-in schema and workflow templates
//! - `store`: Database access and local data types
//! - `background/`: Background process management
//! - `tools_registry`: Centralized tool definitions
//! - `instance_manager`: Smart multi-instance management with heartbeat
//!
//! The main tool implementations remain in `mcp_server.rs` due to
//! `rmcp` crate's requirement that all `#[tool]` methods be in a
//! single `#[tool_router] impl` block.

// Extracted modules
pub mod types;
pub mod security;
pub mod state;
pub mod templates;
pub mod store;
pub mod background;
pub mod tools_registry;
pub mod instance_manager;

// Re-export commonly used items
pub use security::{ToolCategory, get_tool_category, is_tool_allowed};
pub use tools_registry::ALL_TOOLS;
pub use state::{RATE_LIMITER, TOOL_RATE_LIMITERS};
pub use templates::get_builtin_schemas;
pub use store::{
    read_store_data, log_request, open_database,
};
pub use background::{
    BACKGROUND_PROCESS_MANAGER, CLEANUP_INTERVAL_SECS,
};
pub use instance_manager::InstanceManager;

// Test module (only compiled in test builds)
#[cfg(test)]
mod mcp_tests;
