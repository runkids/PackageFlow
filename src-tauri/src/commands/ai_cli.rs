// AI CLI Commands
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Tauri commands for AI CLI tool management and execution

use crate::commands::ai::ApiResponse;
use crate::models::cli_tool::{
    AICLIExecuteRequest, AICLIExecuteResult, CLIAuthMode, CLIToolConfig, CLIToolType,
    DetectedCLITool,
};
use crate::repositories::AIRepository;
use crate::services::ai::keychain::AIKeychain;
use crate::services::ai_cli::{detect_all_cli_tools, detect_cli_tool, CLIExecutor};
use crate::DatabaseState;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::RwLock;

/// State for managing CLI executor instances
pub struct CLIExecutorState {
    executor: RwLock<Option<Arc<CLIExecutor>>>,
}

impl CLIExecutorState {
    pub fn new() -> Self {
        Self {
            executor: RwLock::new(None),
        }
    }

    pub async fn get_or_create(&self, app: &AppHandle) -> Arc<CLIExecutor> {
        let mut guard = self.executor.write().await;
        if let Some(ref executor) = *guard {
            executor.clone()
        } else {
            let executor = Arc::new(CLIExecutor::new(app.clone()));
            *guard = Some(executor.clone());
            executor
        }
    }
}

impl Default for CLIExecutorState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// CLI Tool Detection Commands
// ============================================================================

/// Detect all available AI CLI tools on the system
#[tauri::command]
pub async fn ai_cli_detect_tools() -> ApiResponse<Vec<DetectedCLITool>> {
    log::info!("[ai_cli] Detecting available CLI tools");
    let tools = detect_all_cli_tools().await;
    log::info!("[ai_cli] Found {} CLI tools", tools.len());
    ApiResponse::success(tools)
}

/// Detect a specific CLI tool
#[tauri::command]
pub async fn ai_cli_detect_tool(tool_type: CLIToolType) -> ApiResponse<Option<DetectedCLITool>> {
    log::info!("[ai_cli] Detecting CLI tool: {:?}", tool_type);
    let tool = detect_cli_tool(tool_type).await;
    ApiResponse::success(tool)
}

// ============================================================================
// CLI Tool Configuration Commands
// ============================================================================

/// List all configured CLI tools
#[tauri::command]
pub async fn ai_cli_list_tools(db: State<'_, DatabaseState>) -> Result<ApiResponse<Vec<CLIToolConfig>>, String> {
    log::info!("[ai_cli] Listing configured CLI tools");
    let repo = AIRepository::new(db.0.as_ref().clone());
    match repo.list_cli_tools() {
        Ok(tools) => Ok(ApiResponse::success(tools)),
        Err(e) => {
            log::error!("[ai_cli] Failed to list CLI tools: {}", e);
            Ok(ApiResponse::error(format!("Failed to list CLI tools: {}", e)))
        }
    }
}

/// Save CLI tool configuration (create or update)
#[tauri::command]
pub async fn ai_cli_save_tool(
    db: State<'_, DatabaseState>,
    config: CLIToolConfig,
) -> Result<ApiResponse<CLIToolConfig>, String> {
    log::info!("[ai_cli] Saving CLI tool config: {:?}", config.tool_type);
    let repo = AIRepository::new(db.0.as_ref().clone());
    match repo.save_cli_tool(&config) {
        Ok(_) => Ok(ApiResponse::success(config)),
        Err(e) => {
            log::error!("[ai_cli] Failed to save CLI tool config: {}", e);
            Ok(ApiResponse::error(format!("Failed to save CLI tool: {}", e)))
        }
    }
}

/// Delete CLI tool configuration
#[tauri::command]
pub async fn ai_cli_delete_tool(
    db: State<'_, DatabaseState>,
    id: String,
) -> Result<ApiResponse<()>, String> {
    log::info!("[ai_cli] Deleting CLI tool config: {}", id);
    let repo = AIRepository::new(db.0.as_ref().clone());
    match repo.delete_cli_tool(&id) {
        Ok(_) => Ok(ApiResponse::success(())),
        Err(e) => {
            log::error!("[ai_cli] Failed to delete CLI tool config: {}", e);
            Ok(ApiResponse::error(format!("Failed to delete CLI tool: {}", e)))
        }
    }
}

/// Get CLI tool configuration by ID
#[tauri::command]
pub async fn ai_cli_get_tool(
    db: State<'_, DatabaseState>,
    id: String,
) -> Result<ApiResponse<Option<CLIToolConfig>>, String> {
    log::info!("[ai_cli] Getting CLI tool config: {}", id);
    let repo = AIRepository::new(db.0.as_ref().clone());
    match repo.get_cli_tool(&id) {
        Ok(tool) => Ok(ApiResponse::success(tool)),
        Err(e) => {
            log::error!("[ai_cli] Failed to get CLI tool config: {}", e);
            Ok(ApiResponse::error(format!("Failed to get CLI tool: {}", e)))
        }
    }
}

/// Get CLI tool configuration by type
#[tauri::command]
pub async fn ai_cli_get_tool_by_type(
    db: State<'_, DatabaseState>,
    tool_type: CLIToolType,
) -> Result<ApiResponse<Option<CLIToolConfig>>, String> {
    log::info!("[ai_cli] Getting CLI tool config by type: {:?}", tool_type);
    let repo = AIRepository::new(db.0.as_ref().clone());
    match repo.get_cli_tool_by_type(tool_type) {
        Ok(tool) => Ok(ApiResponse::success(tool)),
        Err(e) => {
            log::error!("[ai_cli] Failed to get CLI tool config: {}", e);
            Ok(ApiResponse::error(format!("Failed to get CLI tool: {}", e)))
        }
    }
}

// ============================================================================
// CLI Execution Commands
// ============================================================================

/// Execute an AI CLI command
#[tauri::command]
pub async fn ai_cli_execute(
    app: AppHandle,
    db: State<'_, DatabaseState>,
    executor_state: State<'_, CLIExecutorState>,
    request: AICLIExecuteRequest,
) -> Result<ApiResponse<AICLIExecuteResult>, String> {
    log::info!(
        "[ai_cli] Executing {:?} CLI in {}",
        request.tool,
        request.project_path
    );

    // Get executor
    let executor = executor_state.get_or_create(&app).await;

    // Get tool config if exists
    let repo = AIRepository::new(db.0.as_ref().clone());
    let config = repo.get_cli_tool_by_type(request.tool).ok().flatten();

    // Get API key if in API key mode
    let api_key = if config
        .as_ref()
        .map(|c| c.auth_mode == CLIAuthMode::ApiKey)
        .unwrap_or(false)
    {
        // Get API key from keychain via linked service
        if let Some(ref cfg) = config {
            if let Some(ref provider_id) = cfg.api_key_provider_id {
                let keychain = AIKeychain::new(app.clone());
                keychain
                    .get_api_key(provider_id)
                    .ok()
                    .flatten()
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    // Execute
    match executor
        .execute(request.clone(), config.as_ref(), api_key.as_deref())
        .await
    {
        Ok(result) => {
            // Log execution for audit
            if let Err(e) = repo.log_cli_execution(
                request.tool,
                Some(&request.project_path),
                &request.prompt,
                result.exit_code,
                result.duration_ms,
            ) {
                log::warn!("[ai_cli] Failed to log execution: {}", e);
            }
            Ok(ApiResponse::success(result))
        }
        Err((error_code, message)) => {
            log::error!("[ai_cli] Execution failed: {} - {}", error_code, message);
            Ok(ApiResponse::error(format!("{}: {}", error_code, message)))
        }
    }
}

/// Cancel a running CLI execution
#[tauri::command]
pub async fn ai_cli_cancel(
    app: AppHandle,
    executor_state: State<'_, CLIExecutorState>,
    execution_id: String,
) -> Result<ApiResponse<bool>, String> {
    log::info!("[ai_cli] Cancelling execution: {}", execution_id);

    let executor = executor_state.get_or_create(&app).await;
    let cancelled = executor.cancel(&execution_id).await;

    if cancelled {
        log::info!("[ai_cli] Successfully cancelled execution: {}", execution_id);
    } else {
        log::warn!(
            "[ai_cli] Could not cancel execution (not found or already finished): {}",
            execution_id
        );
    }

    Ok(ApiResponse::success(cancelled))
}

// ============================================================================
// CLI Execution History Commands
// ============================================================================

/// Get CLI execution history
#[tauri::command]
pub async fn ai_cli_get_history(
    db: State<'_, DatabaseState>,
    project_path: Option<String>,
    limit: Option<usize>,
) -> Result<ApiResponse<Vec<crate::models::cli_tool::CLIExecutionLog>>, String> {
    log::info!(
        "[ai_cli] Getting execution history (project: {:?}, limit: {:?})",
        project_path,
        limit
    );

    let repo = AIRepository::new(db.0.as_ref().clone());
    match repo.get_cli_execution_history(project_path.as_deref(), limit.unwrap_or(100)) {
        Ok(logs) => Ok(ApiResponse::success(logs)),
        Err(e) => {
            log::error!("[ai_cli] Failed to get execution history: {}", e);
            Ok(ApiResponse::error(format!(
                "Failed to get execution history: {}",
                e
            )))
        }
    }
}

/// Clear CLI execution history
#[tauri::command]
pub async fn ai_cli_clear_history(
    db: State<'_, DatabaseState>,
    project_path: Option<String>,
) -> Result<ApiResponse<()>, String> {
    log::info!(
        "[ai_cli] Clearing execution history (project: {:?})",
        project_path
    );

    let repo = AIRepository::new(db.0.as_ref().clone());
    match repo.clear_cli_execution_history(project_path.as_deref()) {
        Ok(_) => Ok(ApiResponse::success(())),
        Err(e) => {
            log::error!("[ai_cli] Failed to clear execution history: {}", e);
            Ok(ApiResponse::error(format!(
                "Failed to clear execution history: {}",
                e
            )))
        }
    }
}
