// Services module
// Business logic and background services

// Core services (shared between Tauri app and MCP)
pub mod crypto;

pub use crypto::*;

// Note: Tauri-dependent modules (file_watcher, notification) are in src-tauri/src/services/
