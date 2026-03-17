//! Database access for MCP server
//!
//! Provides SQLite database functions for the MCP server.
//! Uses a global connection pool to avoid creating a new connection for every tool call.

use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};

use specforge_lib::models::mcp::MCPServerConfig;
use specforge_lib::repositories::{
    MCPRepository, McpLogEntry, SettingsRepository,
};
use specforge_lib::utils::database::{Database, DATABASE_FILE};
use specforge_lib::utils::shared_store::{get_app_data_dir, sanitize_error};

// ============================================================================
// Constants
// ============================================================================

/// SQLite settings key for MCP config
pub const MCP_CONFIG_KEY: &str = "mcp_server_config";

// ============================================================================
// Global Database Connection Pool
// ============================================================================

/// Global database connection, initialized once on first access
static DB_POOL: OnceCell<Arc<Database>> = OnceCell::new();

/// Get or initialize the global database connection
fn get_db_pool() -> Result<Arc<Database>, String> {
    DB_POOL.get_or_try_init(|| {
        let db_path = get_database_path()?;
        eprintln!("[MCP Database] Initializing connection pool at: {:?}", db_path);
        let db = Database::new(db_path)?;
        Ok(Arc::new(db))
    }).cloned()
}

// ============================================================================
// Database Access Functions
// ============================================================================

/// Get the SQLite database path
pub fn get_database_path() -> Result<PathBuf, String> {
    let app_dir = get_app_data_dir()?;
    Ok(app_dir.join(DATABASE_FILE))
}

/// Open the SQLite database (uses connection pool)
pub fn open_database() -> Result<Database, String> {
    let db = get_db_pool()?;
    Ok((*db).clone())
}

/// Read MCP config from SQLite database
pub fn read_store_data() -> Result<StoreData, String> {
    let db = open_database()?;
    let settings_repo = SettingsRepository::new(db.clone());

    let mcp_config: MCPServerConfig = settings_repo
        .get(MCP_CONFIG_KEY)?
        .unwrap_or_default();

    Ok(StoreData { mcp_config })
}

/// Write MCP config to SQLite database
pub fn write_store_data(data: &StoreData) -> Result<(), String> {
    let db = open_database()?;
    let settings_repo = SettingsRepository::new(db.clone());
    settings_repo.set(MCP_CONFIG_KEY, &data.mcp_config)?;
    Ok(())
}

// ============================================================================
// Logging Functions
// ============================================================================

/// Log a request to the MCP log table
pub fn log_request(
    tool_name: &str,
    arguments: &serde_json::Value,
    result: &str,
    duration_ms: u64,
    error: Option<&str>,
) -> Option<i64> {
    let db = match open_database() {
        Ok(db) => db,
        Err(e) => {
            eprintln!("[MCP Log] Failed to open database for logging: {}", e);
            return None;
        }
    };

    let repo = MCPRepository::new(db);
    let sanitized_error = error.map(|e| sanitize_error(e));
    let sanitized_args = sanitize_arguments(arguments);

    let log_entry = McpLogEntry {
        id: None,
        timestamp: Utc::now(),
        tool: tool_name.to_string(),
        arguments: sanitized_args,
        result: result.to_string(),
        duration_ms,
        error: sanitized_error,
        source: Some("mcp_server".to_string()),
    };

    match repo.insert_log(&log_entry) {
        Ok(id) => Some(id),
        Err(e) => {
            eprintln!("[MCP Log] Failed to insert log entry: {}", e);
            None
        }
    }
}

/// Update an existing log entry's status (for background processes)
pub fn update_log_status(
    log_id: i64,
    result: &str,
    duration_ms: u64,
    error: Option<&str>,
) {
    let db = match open_database() {
        Ok(db) => db,
        Err(e) => {
            eprintln!("[MCP Log] Failed to open database for status update: {}", e);
            return;
        }
    };

    let repo = MCPRepository::new(db);
    let sanitized_error = error.map(|e| sanitize_error(e));

    if let Err(e) = repo.update_log_status(log_id, result, duration_ms, sanitized_error.as_deref()) {
        eprintln!("[MCP Log] Failed to update log entry {}: {}", log_id, e);
    }
}

/// Sanitize arguments to remove or obscure sensitive paths
pub fn sanitize_arguments(args: &serde_json::Value) -> serde_json::Value {
    match args {
        serde_json::Value::Object(map) => {
            let mut sanitized = serde_json::Map::new();
            for (key, value) in map {
                let sanitized_value = if key == "path" || key == "cwd" || key == "project_path" || key == "project_dir" || key == "projectDir" {
                    match value {
                        serde_json::Value::String(s) => {
                            serde_json::Value::String(sanitize_error(s))
                        }
                        _ => sanitize_arguments(value),
                    }
                } else {
                    sanitize_arguments(value)
                };
                sanitized.insert(key.clone(), sanitized_value);
            }
            serde_json::Value::Object(sanitized)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(sanitize_arguments).collect())
        }
        other => other.clone(),
    }
}

// ============================================================================
// Store Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoreData {
    /// MCP Server configuration (imported from specforge_lib)
    #[serde(default)]
    pub mcp_config: MCPServerConfig,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_config_key_is_correct() {
        assert_eq!(MCP_CONFIG_KEY, "mcp_server_config");
    }

    #[test]
    fn test_store_data_default() {
        let store = StoreData::default();
        assert!(!store.mcp_config.is_enabled);
    }

    #[test]
    fn test_sanitize_arguments_with_path() {
        let args = serde_json::json!({
            "project_dir": "/Users/testuser/secret/project",
            "name": "test"
        });

        let sanitized = sanitize_arguments(&args);
        assert_eq!(sanitized["name"], "test");
    }

    #[test]
    fn test_sanitize_arguments_nested() {
        let args = serde_json::json!({
            "config": {
                "project_dir": "/some/path",
                "value": 42
            },
            "items": [
                {"cwd": "/another/path"}
            ]
        });

        let sanitized = sanitize_arguments(&args);
        assert!(sanitized["config"]["value"].as_i64() == Some(42));
    }

    #[test]
    fn test_database_path_ends_with_db_file() {
        if let Ok(path) = get_database_path() {
            let path_str = path.to_string_lossy();
            assert!(
                path_str.ends_with("specforge.db") || path_str.ends_with("specforge-dev.db"),
                "Database path should end with specforge.db or specforge-dev.db, got: {}",
                path_str
            );
        }
    }

    #[test]
    fn test_db_pool_returns_same_instance() {
        if let (Ok(db1), Ok(db2)) = (get_db_pool(), get_db_pool()) {
            assert!(
                Arc::ptr_eq(&db1, &db2),
                "Connection pool should return the same instance"
            );
        }
    }
}
