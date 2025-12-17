// Deploy Service Error Types
// Refactored from commands/deploy.rs

use thiserror::Error;

/// Deploy Service Error
#[derive(Error, Debug)]
pub enum DeployError {
    /// Platform connection failed
    #[error("Cannot connect to {platform}: {message}")]
    ConnectionFailed { platform: String, message: String },

    /// Authentication failed
    #[error("Authentication failed for {platform}: {message}")]
    AuthFailed { platform: String, message: String },

    /// Project not found
    #[error("Project not found: {project_name}")]
    ProjectNotFound { project_name: String },

    /// Project creation failed
    #[error("Failed to create project {project_name}: {message}")]
    ProjectCreationFailed { project_name: String, message: String },

    /// File upload failed
    #[error("Failed to upload file {file_path}: {message}")]
    UploadFailed { file_path: String, message: String },

    /// Deployment creation failed
    #[error("Failed to create deployment: {message}")]
    DeploymentCreationFailed { message: String },

    /// Deployment timeout
    #[error("Deployment timed out after {seconds} seconds")]
    DeploymentTimeout { seconds: u64 },

    /// Deployment failed
    #[error("Deployment failed: {message}")]
    DeploymentFailed { message: String },

    /// Invalid configuration
    #[error("Invalid configuration: {message}")]
    InvalidConfig { message: String },

    /// API error from provider
    #[error("{platform} API error: {message}")]
    ApiError { platform: String, message: String },

    /// Token not found or invalid
    #[error("Token not found for account: {account_id}")]
    TokenNotFound { account_id: String },

    /// Build directory not found
    #[error("Build directory not found: {path}")]
    BuildDirNotFound { path: String },

    /// IO error
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    /// Network error
    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    /// JSON parse error
    #[error("JSON parse error: {0}")]
    ParseError(#[from] serde_json::Error),
}

/// Result type for deploy operations
pub type DeployResult<T> = Result<T, DeployError>;

/// Deploy error codes for frontend
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeployErrorCode {
    ConnectionFailed,
    AuthFailed,
    ProjectNotFound,
    ProjectCreationFailed,
    UploadFailed,
    DeploymentCreationFailed,
    DeploymentTimeout,
    DeploymentFailed,
    InvalidConfig,
    ApiError,
    TokenNotFound,
    BuildDirNotFound,
    IoError,
    NetworkError,
    ParseError,
}

impl DeployErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            DeployErrorCode::ConnectionFailed => "DEPLOY_CONNECTION_FAILED",
            DeployErrorCode::AuthFailed => "DEPLOY_AUTH_FAILED",
            DeployErrorCode::ProjectNotFound => "DEPLOY_PROJECT_NOT_FOUND",
            DeployErrorCode::ProjectCreationFailed => "DEPLOY_PROJECT_CREATION_FAILED",
            DeployErrorCode::UploadFailed => "DEPLOY_UPLOAD_FAILED",
            DeployErrorCode::DeploymentCreationFailed => "DEPLOY_CREATION_FAILED",
            DeployErrorCode::DeploymentTimeout => "DEPLOY_TIMEOUT",
            DeployErrorCode::DeploymentFailed => "DEPLOY_FAILED",
            DeployErrorCode::InvalidConfig => "DEPLOY_INVALID_CONFIG",
            DeployErrorCode::ApiError => "DEPLOY_API_ERROR",
            DeployErrorCode::TokenNotFound => "DEPLOY_TOKEN_NOT_FOUND",
            DeployErrorCode::BuildDirNotFound => "DEPLOY_BUILD_DIR_NOT_FOUND",
            DeployErrorCode::IoError => "DEPLOY_IO_ERROR",
            DeployErrorCode::NetworkError => "DEPLOY_NETWORK_ERROR",
            DeployErrorCode::ParseError => "DEPLOY_PARSE_ERROR",
        }
    }
}

impl DeployError {
    pub fn code(&self) -> DeployErrorCode {
        match self {
            DeployError::ConnectionFailed { .. } => DeployErrorCode::ConnectionFailed,
            DeployError::AuthFailed { .. } => DeployErrorCode::AuthFailed,
            DeployError::ProjectNotFound { .. } => DeployErrorCode::ProjectNotFound,
            DeployError::ProjectCreationFailed { .. } => DeployErrorCode::ProjectCreationFailed,
            DeployError::UploadFailed { .. } => DeployErrorCode::UploadFailed,
            DeployError::DeploymentCreationFailed { .. } => DeployErrorCode::DeploymentCreationFailed,
            DeployError::DeploymentTimeout { .. } => DeployErrorCode::DeploymentTimeout,
            DeployError::DeploymentFailed { .. } => DeployErrorCode::DeploymentFailed,
            DeployError::InvalidConfig { .. } => DeployErrorCode::InvalidConfig,
            DeployError::ApiError { .. } => DeployErrorCode::ApiError,
            DeployError::TokenNotFound { .. } => DeployErrorCode::TokenNotFound,
            DeployError::BuildDirNotFound { .. } => DeployErrorCode::BuildDirNotFound,
            DeployError::IoError(_) => DeployErrorCode::IoError,
            DeployError::NetworkError(_) => DeployErrorCode::NetworkError,
            DeployError::ParseError(_) => DeployErrorCode::ParseError,
        }
    }

    /// Convert to a user-friendly error message for the frontend
    pub fn to_user_message(&self) -> String {
        self.to_string()
    }
}

impl From<DeployError> for String {
    fn from(err: DeployError) -> Self {
        err.to_string()
    }
}
