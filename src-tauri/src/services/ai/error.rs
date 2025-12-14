// AI Service Error Types
// Feature: AI CLI Integration (020-ai-cli-integration)

use thiserror::Error;

/// AI Service Error
#[derive(Error, Debug)]
pub enum AIError {
    /// AI service not found
    #[error("AI service not found: {0}")]
    ServiceNotFound(String),

    /// AI service is disabled
    #[error("AI service is disabled: {0}")]
    ServiceDisabled(String),

    /// No default AI service configured
    #[error("No default AI service configured")]
    NoDefaultService,

    /// Connection failed
    #[error("Cannot connect to AI service: {0}")]
    ConnectionFailed(String),

    /// Authentication failed
    #[error("Invalid or expired API key: {0}")]
    AuthFailed(String),

    /// Rate limited
    #[error("API rate limit exceeded, please try again later")]
    RateLimited,

    /// Token limit exceeded
    #[error("Input exceeds token limit ({0} tokens)")]
    TokenLimitExceeded(usize),

    /// No staged changes
    #[error("No staged changes, please stage files first")]
    NoStagedChanges,

    /// Template not found
    #[error("Prompt template not found: {0}")]
    TemplateNotFound(String),

    /// Template is built-in (cannot be modified/deleted)
    #[error("Cannot modify or delete built-in template: {0}")]
    TemplateIsBuiltin(String),

    /// Invalid template (missing required placeholder)
    #[error("Invalid template, must contain required placeholder")]
    InvalidTemplate,

    /// Invalid template variables
    #[error("Invalid template: {0}")]
    InvalidTemplateVariables(String),

    /// Request timeout
    #[error("AI service response timeout")]
    Timeout,

    /// Model not found
    #[error("Model not found: {0}")]
    ModelNotFound(String),

    /// API error from provider
    #[error("AI service error: {0}")]
    ApiError(String),

    /// JSON parsing error
    #[error("Response parse error: {0}")]
    ParseError(String),

    /// IO error
    #[error("IO error: {0}")]
    IoError(String),

    /// Git error
    #[error("Git error: {0}")]
    GitError(String),

    /// Storage error
    #[error("Storage error: {0}")]
    StorageError(String),

    /// Encryption error
    #[error("Encryption error: {0}")]
    EncryptionError(String),

    /// Invalid configuration
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    /// Service already exists
    #[error("Service name already exists: {0}")]
    ServiceAlreadyExists(String),

    /// Template already exists
    #[error("Template name already exists: {0}")]
    TemplateAlreadyExists(String),
}

impl From<reqwest::Error> for AIError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AIError::Timeout
        } else if err.is_connect() {
            AIError::ConnectionFailed(err.to_string())
        } else {
            AIError::ApiError(err.to_string())
        }
    }
}

impl From<serde_json::Error> for AIError {
    fn from(err: serde_json::Error) -> Self {
        AIError::ParseError(err.to_string())
    }
}

impl From<std::io::Error> for AIError {
    fn from(err: std::io::Error) -> Self {
        AIError::IoError(err.to_string())
    }
}

/// Result type for AI operations
pub type AIResult<T> = Result<T, AIError>;

/// AI Error codes for frontend
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AIErrorCode {
    ServiceNotFound,
    ServiceDisabled,
    NoDefaultService,
    ConnectionFailed,
    AuthFailed,
    RateLimited,
    TokenLimitExceeded,
    NoStagedChanges,
    TemplateNotFound,
    TemplateIsBuiltin,
    InvalidTemplate,
    InvalidTemplateVariables,
    Timeout,
    ModelNotFound,
    ApiError,
    ParseError,
    IoError,
    GitError,
    StorageError,
    EncryptionError,
    InvalidConfig,
    ServiceAlreadyExists,
    TemplateAlreadyExists,
}

impl AIErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            AIErrorCode::ServiceNotFound => "AI_SERVICE_NOT_FOUND",
            AIErrorCode::ServiceDisabled => "AI_SERVICE_DISABLED",
            AIErrorCode::NoDefaultService => "AI_NO_DEFAULT_SERVICE",
            AIErrorCode::ConnectionFailed => "AI_CONNECTION_FAILED",
            AIErrorCode::AuthFailed => "AI_AUTH_FAILED",
            AIErrorCode::RateLimited => "AI_RATE_LIMITED",
            AIErrorCode::TokenLimitExceeded => "AI_TOKEN_LIMIT",
            AIErrorCode::NoStagedChanges => "AI_NO_STAGED_CHANGES",
            AIErrorCode::TemplateNotFound => "TEMPLATE_NOT_FOUND",
            AIErrorCode::TemplateIsBuiltin => "TEMPLATE_IS_BUILTIN",
            AIErrorCode::InvalidTemplate => "TEMPLATE_INVALID",
            AIErrorCode::InvalidTemplateVariables => "TEMPLATE_INVALID_VARIABLES",
            AIErrorCode::Timeout => "AI_TIMEOUT",
            AIErrorCode::ModelNotFound => "AI_MODEL_NOT_FOUND",
            AIErrorCode::ApiError => "AI_API_ERROR",
            AIErrorCode::ParseError => "AI_PARSE_ERROR",
            AIErrorCode::IoError => "AI_IO_ERROR",
            AIErrorCode::GitError => "AI_GIT_ERROR",
            AIErrorCode::StorageError => "AI_STORAGE_ERROR",
            AIErrorCode::EncryptionError => "AI_ENCRYPTION_ERROR",
            AIErrorCode::InvalidConfig => "AI_INVALID_CONFIG",
            AIErrorCode::ServiceAlreadyExists => "AI_SERVICE_EXISTS",
            AIErrorCode::TemplateAlreadyExists => "AI_TEMPLATE_EXISTS",
        }
    }
}

impl AIError {
    pub fn code(&self) -> AIErrorCode {
        match self {
            AIError::ServiceNotFound(_) => AIErrorCode::ServiceNotFound,
            AIError::ServiceDisabled(_) => AIErrorCode::ServiceDisabled,
            AIError::NoDefaultService => AIErrorCode::NoDefaultService,
            AIError::ConnectionFailed(_) => AIErrorCode::ConnectionFailed,
            AIError::AuthFailed(_) => AIErrorCode::AuthFailed,
            AIError::RateLimited => AIErrorCode::RateLimited,
            AIError::TokenLimitExceeded(_) => AIErrorCode::TokenLimitExceeded,
            AIError::NoStagedChanges => AIErrorCode::NoStagedChanges,
            AIError::TemplateNotFound(_) => AIErrorCode::TemplateNotFound,
            AIError::TemplateIsBuiltin(_) => AIErrorCode::TemplateIsBuiltin,
            AIError::InvalidTemplate => AIErrorCode::InvalidTemplate,
            AIError::InvalidTemplateVariables(_) => AIErrorCode::InvalidTemplateVariables,
            AIError::Timeout => AIErrorCode::Timeout,
            AIError::ModelNotFound(_) => AIErrorCode::ModelNotFound,
            AIError::ApiError(_) => AIErrorCode::ApiError,
            AIError::ParseError(_) => AIErrorCode::ParseError,
            AIError::IoError(_) => AIErrorCode::IoError,
            AIError::GitError(_) => AIErrorCode::GitError,
            AIError::StorageError(_) => AIErrorCode::StorageError,
            AIError::EncryptionError(_) => AIErrorCode::EncryptionError,
            AIError::InvalidConfig(_) => AIErrorCode::InvalidConfig,
            AIError::ServiceAlreadyExists(_) => AIErrorCode::ServiceAlreadyExists,
            AIError::TemplateAlreadyExists(_) => AIErrorCode::TemplateAlreadyExists,
        }
    }

    /// Convert to a user-friendly error message for the frontend
    pub fn to_user_message(&self) -> String {
        self.to_string()
    }
}

impl From<AIError> for String {
    fn from(err: AIError) -> Self {
        err.to_string()
    }
}
