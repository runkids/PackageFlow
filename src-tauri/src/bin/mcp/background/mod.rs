//! Background process management
//!
//! Manages long-running processes for npm scripts and other commands.

pub mod manager;
pub mod types;

pub use manager::{BackgroundProcessManager, BACKGROUND_MANAGER};
pub use types::*;
