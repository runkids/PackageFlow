//! Background process management module
//!
//! Contains background process types and manager for running npm scripts
//! and other commands in the background.

pub mod types;
pub mod manager;

// Re-export commonly used items
pub use types::{
    BackgroundProcessStatus, BackgroundProcessInfo, ProcessOutput,
    CircularBuffer, BackgroundProcessState,
    MAX_BACKGROUND_PROCESSES, MAX_OUTPUT_BUFFER_BYTES, MAX_OUTPUT_BUFFER_LINES,
    DEFAULT_SUCCESS_TIMEOUT_MS, CLEANUP_INTERVAL_SECS, COMPLETED_PROCESS_TTL_SECS,
};

pub use manager::{BackgroundProcessManager, BACKGROUND_PROCESS_MANAGER};
