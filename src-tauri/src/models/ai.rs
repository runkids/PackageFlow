// AI Integration data models
// Feature: AI CLI Integration (020-ai-cli-integration)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Supported AI service providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AIProvider {
    OpenAI,
    Anthropic,
    Gemini,
    Ollama,
    #[serde(rename = "lm_studio")]
    LMStudio,
}

impl std::fmt::Display for AIProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AIProvider::OpenAI => write!(f, "openai"),
            AIProvider::Anthropic => write!(f, "anthropic"),
            AIProvider::Gemini => write!(f, "gemini"),
            AIProvider::Ollama => write!(f, "ollama"),
            AIProvider::LMStudio => write!(f, "lm_studio"),
        }
    }
}

impl AIProvider {
    /// Returns whether this provider requires an API key
    pub fn requires_api_key(&self) -> bool {
        matches!(self, AIProvider::OpenAI | AIProvider::Anthropic | AIProvider::Gemini)
    }

    /// Returns the default endpoint for this provider
    pub fn default_endpoint(&self) -> &'static str {
        match self {
            AIProvider::OpenAI => "https://api.openai.com/v1",
            AIProvider::Anthropic => "https://api.anthropic.com/v1",
            AIProvider::Gemini => "https://generativelanguage.googleapis.com/v1beta",
            AIProvider::Ollama => "http://127.0.0.1:11434",
            AIProvider::LMStudio => "http://127.0.0.1:1234/v1",
        }
    }

    /// Returns the default model for this provider
    pub fn default_model(&self) -> &'static str {
        match self {
            AIProvider::OpenAI => "gpt-4o-mini",
            AIProvider::Anthropic => "claude-3-haiku-20240307",
            AIProvider::Gemini => "gemini-1.5-flash",
            AIProvider::Ollama => "llama3.2",
            AIProvider::LMStudio => "local-model",
        }
    }
}

/// Template category for different AI use cases
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TemplateCategory {
    /// Git commit message generation
    #[default]
    GitCommit,
    /// Pull request description generation
    PullRequest,
    /// Code review suggestions
    CodeReview,
    /// Documentation generation
    Documentation,
    /// Release notes generation
    ReleaseNotes,
    /// Custom/general purpose
    Custom,
}

impl TemplateCategory {
    /// Get the available variables for this category
    pub fn available_variables(&self) -> Vec<&'static str> {
        match self {
            TemplateCategory::GitCommit => vec!["diff"],
            TemplateCategory::PullRequest => vec!["diff", "commits", "branch", "base_branch"],
            TemplateCategory::CodeReview => vec!["diff", "file_path", "code"],
            TemplateCategory::Documentation => vec!["code", "file_path", "function_name"],
            TemplateCategory::ReleaseNotes => vec!["commits", "version", "previous_version"],
            TemplateCategory::Custom => vec!["input"],
        }
    }

    /// Get display name for this category
    pub fn display_name(&self) -> &'static str {
        match self {
            TemplateCategory::GitCommit => "Git Commit",
            TemplateCategory::PullRequest => "Pull Request",
            TemplateCategory::CodeReview => "Code Review",
            TemplateCategory::Documentation => "Documentation",
            TemplateCategory::ReleaseNotes => "Release Notes",
            TemplateCategory::Custom => "Custom",
        }
    }
}

/// Commit message format types (subset for GitCommit category)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum CommitFormat {
    #[default]
    ConventionalCommits,
    Simple,
    Custom,
}

/// AI Service configuration
/// Stores user-configured AI service connection information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIServiceConfig {
    /// Unique identifier (UUID v4)
    pub id: String,
    /// User-defined name for this service
    pub name: String,
    /// AI provider type
    pub provider: AIProvider,
    /// API endpoint URL
    pub endpoint: String,
    /// Selected model name
    pub model: String,
    /// Whether this is the default service
    #[serde(default)]
    pub is_default: bool,
    /// Whether this service is enabled
    #[serde(default = "default_true")]
    pub is_enabled: bool,
    /// When this service was created
    pub created_at: DateTime<Utc>,
    /// When this service was last updated
    pub updated_at: DateTime<Utc>,
}

fn default_true() -> bool {
    true
}

impl AIServiceConfig {
    /// Create a new AI service configuration
    pub fn new(name: String, provider: AIProvider, endpoint: String, model: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            provider,
            endpoint,
            model,
            is_default: false,
            is_enabled: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Create with default endpoint and model
    pub fn with_defaults(name: String, provider: AIProvider) -> Self {
        Self::new(
            name,
            provider.clone(),
            provider.default_endpoint().to_string(),
            provider.default_model().to_string(),
        )
    }
}

/// Prompt template for AI generation tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    /// Unique identifier (UUID v4)
    pub id: String,
    /// Template name
    pub name: String,
    /// Template description
    pub description: Option<String>,
    /// Template category (determines available variables)
    #[serde(default)]
    pub category: TemplateCategory,
    /// Prompt content with variable placeholders like {diff}, {code}, etc.
    pub template: String,
    /// Output format type (mainly for GitCommit category)
    #[serde(default)]
    pub output_format: Option<CommitFormat>,
    /// Whether this is the default template for its category
    #[serde(default)]
    pub is_default: bool,
    /// Whether this is a built-in template (cannot be deleted)
    #[serde(default)]
    pub is_builtin: bool,
    /// When this template was created
    pub created_at: DateTime<Utc>,
    /// When this template was last updated
    pub updated_at: DateTime<Utc>,
}

impl PromptTemplate {
    /// Create a new prompt template
    pub fn new(
        name: String,
        description: Option<String>,
        category: TemplateCategory,
        template: String,
        output_format: Option<CommitFormat>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            category,
            template,
            output_format,
            is_default: false,
            is_builtin: false,
            created_at: now,
            updated_at: now,
        }
    }

    /// Get the built-in Conventional Commits template
    pub fn builtin_git_conventional() -> Self {
        Self {
            id: "builtin-git-conventional".to_string(),
            name: "Conventional Commits".to_string(),
            description: Some("Standard Conventional Commits format".to_string()),
            category: TemplateCategory::GitCommit,
            template: r#"Generate a Git commit message following Conventional Commits format.

Format: <type>(<scope>): <description>

Types: feat|fix|docs|style|refactor|test|chore

Changes:
{diff}

IMPORTANT: Output ONLY the commit message. No thinking, no explanation, no XML tags, no markdown code blocks. Just the plain commit message text."#.to_string(),
            output_format: Some(CommitFormat::ConventionalCommits),
            is_default: true,
            is_builtin: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Get the built-in Simple commit template
    pub fn builtin_git_simple() -> Self {
        Self {
            id: "builtin-git-simple".to_string(),
            name: "Simple Commit".to_string(),
            description: Some("Concise single-line description".to_string()),
            category: TemplateCategory::GitCommit,
            template: r#"Generate a concise one-line commit message for these changes:

{diff}

IMPORTANT: Output ONLY the commit message. No thinking, no explanation, no XML tags, no markdown code blocks. Just the plain commit message text (one line)."#.to_string(),
            output_format: Some(CommitFormat::Simple),
            is_default: false,
            is_builtin: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Get the built-in PR description template
    pub fn builtin_pr_description() -> Self {
        Self {
            id: "builtin-pr-description".to_string(),
            name: "PR Description".to_string(),
            description: Some("Generate pull request description".to_string()),
            category: TemplateCategory::PullRequest,
            template: r#"You are a professional developer writing a pull request description.
Based on the following information, generate a clear and informative PR description.

Branch: {branch}
Base branch: {base_branch}

Commits:
{commits}

Code changes:
{diff}

Generate a PR description with:
1. A brief summary (1-2 sentences)
2. Key changes (bullet points)
3. Any breaking changes or migration notes if applicable

Use markdown formatting."#.to_string(),
            output_format: None,
            is_default: true,
            is_builtin: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Get the built-in code review template
    pub fn builtin_code_review() -> Self {
        Self {
            id: "builtin-code-review".to_string(),
            name: "Code Review".to_string(),
            description: Some("Review code changes and provide suggestions".to_string()),
            category: TemplateCategory::CodeReview,
            template: r#"You are a senior developer conducting a code review.
Review the following code changes and provide constructive feedback.

File: {file_path}

Changes:
{diff}

Provide feedback on:
1. Code quality and readability
2. Potential bugs or issues
3. Performance considerations
4. Security concerns if any
5. Suggestions for improvement

Be constructive and specific. Use markdown formatting."#.to_string(),
            output_format: None,
            is_default: true,
            is_builtin: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Get the built-in release notes template
    pub fn builtin_release_notes() -> Self {
        Self {
            id: "builtin-release-notes".to_string(),
            name: "Release Notes".to_string(),
            description: Some("Generate release notes from commits".to_string()),
            category: TemplateCategory::ReleaseNotes,
            template: r#"You are a technical writer preparing release notes.
Generate release notes based on the following commits.

Version: {version}
Previous version: {previous_version}

Commits:
{commits}

Generate release notes with sections:
- **New Features** - New functionality added
- **Bug Fixes** - Issues that were fixed
- **Improvements** - Enhancements to existing features
- **Breaking Changes** - Changes that require user action

Use markdown formatting. Be concise but informative."#.to_string(),
            output_format: None,
            is_default: true,
            is_builtin: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Get all built-in templates
    pub fn all_builtins() -> Vec<Self> {
        vec![
            Self::builtin_git_conventional(),
            Self::builtin_git_simple(),
            Self::builtin_pr_description(),
            Self::builtin_code_review(),
            Self::builtin_release_notes(),
        ]
    }

    /// Get built-in templates for a specific category
    pub fn builtins_for_category(category: &TemplateCategory) -> Vec<Self> {
        Self::all_builtins()
            .into_iter()
            .filter(|t| &t.category == category)
            .collect()
    }

    /// Get available variables for this template's category
    pub fn available_variables(&self) -> Vec<&'static str> {
        self.category.available_variables()
    }

    /// Validate that the template contains required variables for its category
    pub fn validate_variables(&self) -> Result<(), String> {
        let available = self.available_variables();

        // Check if at least one variable is used
        let has_variable = available.iter().any(|var| {
            self.template.contains(&format!("{{{}}}", var))
        });

        if !has_variable && !available.is_empty() {
            return Err(format!(
                "Template must contain at least one of: {}",
                available.iter().map(|v| format!("{{{}}}", v)).collect::<Vec<_>>().join(", ")
            ));
        }

        Ok(())
    }

    /// Render the template with the given variables
    pub fn render(&self, variables: &std::collections::HashMap<String, String>) -> String {
        let mut result = self.template.clone();
        for (key, value) in variables {
            result = result.replace(&format!("{{{}}}", key), value);
        }
        result
    }

    /// Render with a single diff (backward compatible helper)
    pub fn render_with_diff(&self, diff: &str) -> String {
        let mut vars = std::collections::HashMap::new();
        vars.insert("diff".to_string(), diff.to_string());
        self.render(&vars)
    }
}

/// Project-level AI settings override
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAISettings {
    /// Project path (used as key)
    pub project_path: String,
    /// Preferred AI service ID for this project
    pub preferred_service_id: Option<String>,
    /// Preferred prompt template ID for this project
    pub preferred_template_id: Option<String>,
}

/// Chat message for AI completion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// Role: "system", "user", or "assistant"
    pub role: String,
    /// Message content
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".to_string(),
            content: content.into(),
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: content.into(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.into(),
        }
    }
}

/// Options for chat completion requests
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatOptions {
    /// Temperature (0.0 - 2.0)
    pub temperature: Option<f32>,
    /// Maximum tokens to generate
    pub max_tokens: Option<u32>,
    /// Top-p sampling
    pub top_p: Option<f32>,
}

/// Response from chat completion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    /// Generated content
    pub content: String,
    /// Tokens used (if available)
    pub tokens_used: Option<u32>,
    /// Model used
    pub model: String,
}

/// Result from AI commit message generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    /// Generated commit message
    pub message: String,
    /// Tokens used (if available)
    pub tokens_used: Option<u32>,
}

/// Result from AI connection test
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    /// Whether the connection was successful
    pub success: bool,
    /// Response latency in milliseconds
    pub latency_ms: Option<u64>,
    /// Available models (for Ollama/LMStudio)
    pub models: Option<Vec<String>>,
    /// Error message if failed
    pub error: Option<String>,
}

/// Model information (for Ollama/LMStudio)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    /// Model name
    pub name: String,
    /// Model size in bytes
    pub size: Option<u64>,
    /// Last modified time
    pub modified_at: Option<String>,
}

/// Request to add a new AI service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddServiceRequest {
    pub name: String,
    pub provider: AIProvider,
    pub endpoint: String,
    pub model: String,
    /// API key (only for cloud providers)
    pub api_key: Option<String>,
}

/// Request to update an AI service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateServiceRequest {
    pub id: String,
    pub name: Option<String>,
    pub endpoint: Option<String>,
    pub model: Option<String>,
    pub is_enabled: Option<bool>,
    /// API key (if provided, will be updated)
    pub api_key: Option<String>,
}

/// Request to add a new prompt template
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub category: TemplateCategory,
    pub template: String,
    /// Output format (mainly for GitCommit category)
    pub output_format: Option<CommitFormat>,
}

/// Request to update a prompt template
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTemplateRequest {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub template: Option<String>,
    pub output_format: Option<CommitFormat>,
}

/// Request to generate a commit message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCommitMessageRequest {
    pub project_path: String,
    /// Service ID (if not specified, use default)
    pub service_id: Option<String>,
    /// Template ID (if not specified, use default)
    pub template_id: Option<String>,
}

/// Request to update project AI settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectSettingsRequest {
    pub project_path: String,
    /// Preferred service ID (null to clear)
    pub preferred_service_id: Option<String>,
    /// Preferred template ID (null to clear)
    pub preferred_template_id: Option<String>,
}
