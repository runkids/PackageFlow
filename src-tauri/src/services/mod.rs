// Services module
// Business logic and background services

// Re-export shared services from specforge-lib
pub use specforge_lib::services::crypto;
pub use specforge_lib::services::crypto::*;

// Tauri-dependent services (local)
pub mod file_watcher;
pub mod notification;

pub use file_watcher::*;
pub use notification::*;
