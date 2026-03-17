//! Type definitions for MCP tool parameters and responses
//!
//! Contains all structs used for tool inputs and outputs.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ============================================================================
// Spec Operation Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpecParams {
    /// Schema name (e.g., "spec", "change-request", "task")
    pub schema: String,
    /// Spec title
    pub title: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListSpecsParams {
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
    /// Optional status filter (e.g., "draft", "active", "completed")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// Optional workflow phase filter (e.g., "discuss", "implement", "review")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow_phase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetSpecParams {
    /// The spec ID (e.g., "spec-2026-03-17-add-oauth2-a3f1")
    pub id: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpecParams {
    /// The spec ID
    pub id: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
    /// Optional field updates as a JSON object (e.g., {"status": "active", "priority": "high"})
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<serde_json::Value>,
    /// Optional new markdown body content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSpecParams {
    /// The spec ID
    pub id: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

// ============================================================================
// Workflow Operation Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceSpecParams {
    /// The spec ID
    pub spec_id: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
    /// Optional target phase (if omitted, advances to next available phase)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_phase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSpecParams {
    /// The spec ID
    pub spec_id: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
    /// Whether the review approves the spec
    pub approved: bool,
    /// Optional review comment
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetWorkflowStatusParams {
    /// The spec ID
    pub spec_id: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetGateStatusParams {
    /// The spec ID
    pub spec_id: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

// ============================================================================
// Schema Operation Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListSchemasParams {
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetSchemaParams {
    /// Schema name (e.g., "spec", "change-request", "task")
    pub name: String,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

// ============================================================================
// Project Operation Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InitProjectParams {
    /// Absolute path to the project directory
    pub project_dir: String,
    /// Preset: "basic-sdd" (built-in schemas + workflow) or "blank" (empty structure)
    #[serde(default = "default_preset")]
    pub preset: String,
}

fn default_preset() -> String {
    "basic-sdd".to_string()
}

// ============================================================================
// Agent Operation Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetAgentRunsParams {
    /// Optional spec ID filter (if omitted, returns all agent runs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_id: Option<String>,
    /// Absolute path to the project directory containing .specforge/
    pub project_dir: String,
}

// ============================================================================
// Git Operation Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusParams {
    /// The absolute path to the project/worktree directory
    pub project_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffParams {
    /// The absolute path to the project/worktree directory
    pub project_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateBranchParams {
    /// The absolute path to the project/worktree directory
    pub project_dir: String,
    /// Branch name to create
    pub branch_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitParams {
    /// The absolute path to the project/worktree directory
    pub project_dir: String,
    /// Commit message
    pub message: String,
}
