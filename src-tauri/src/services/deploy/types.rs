// Deploy Common Types
// Shared types for deploy providers

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Get MIME type from file path
pub fn get_mime_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        // HTML
        "html" | "htm" => "text/html",
        // CSS
        "css" => "text/css",
        // JavaScript
        "js" | "mjs" | "cjs" => "application/javascript",
        // JSON
        "json" => "application/json",
        // Images
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        "avif" => "image/avif",
        // Fonts
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "eot" => "application/vnd.ms-fontobject",
        // Documents
        "pdf" => "application/pdf",
        "xml" => "application/xml",
        "txt" => "text/plain",
        "md" => "text/markdown",
        // Web Assembly
        "wasm" => "application/wasm",
        // Data
        "csv" => "text/csv",
        // Archives
        "zip" => "application/zip",
        "gz" => "application/gzip",
        // Video
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        // Audio
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        // Source maps
        "map" => "application/json",
        // Default
        _ => "application/octet-stream",
    }
}

/// A file to be uploaded to a deploy platform
#[derive(Debug, Clone)]
pub struct FileToUpload {
    /// Relative path from build directory (e.g., "/index.html")
    pub path: String,
    /// File content
    pub content: Vec<u8>,
    /// Pre-calculated hash
    pub hash: String,
    /// MIME type
    pub content_type: String,
}

impl FileToUpload {
    /// Create a new file to upload
    pub fn new(path: String, content: Vec<u8>, hash: String) -> Self {
        let content_type = get_mime_type(&path).to_string();
        Self {
            path,
            content,
            hash,
            content_type,
        }
    }
}

/// File manifest for deployment
/// Maps file paths to their hashes
#[derive(Debug, Clone, Default)]
pub struct FileManifest {
    /// Map of path -> hash
    pub files: HashMap<String, String>,
    /// All files with their content
    pub file_data: Vec<FileToUpload>,
}

impl FileManifest {
    /// Create a new empty manifest
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a file to the manifest
    pub fn add_file(&mut self, path: String, hash: String, content: Vec<u8>) {
        self.files.insert(path.clone(), hash.clone());
        self.file_data.push(FileToUpload::new(path, content, hash));
    }

    /// Get all hashes
    pub fn hashes(&self) -> Vec<String> {
        self.files.values().cloned().collect()
    }

    /// Get file count
    pub fn len(&self) -> usize {
        self.files.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// Convert to JSON for Cloudflare manifest format
    pub fn to_cloudflare_json(&self) -> serde_json::Value {
        serde_json::json!(self.files)
    }
}

/// Deployment result from a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentResult {
    /// Deployment URL
    pub url: String,
    /// Production/alias URL (if available)
    pub alias_url: Option<String>,
    /// Provider-specific deployment ID
    pub provider_deploy_id: Option<String>,
}

impl DeploymentResult {
    pub fn new(url: String) -> Self {
        Self {
            url,
            alias_url: None,
            provider_deploy_id: None,
        }
    }

    pub fn with_alias(mut self, alias: String) -> Self {
        self.alias_url = Some(alias);
        self
    }

    pub fn with_deploy_id(mut self, id: String) -> Self {
        self.provider_deploy_id = Some(id);
        self
    }
}

/// Upload summary after batch upload
#[derive(Debug, Clone, Default)]
pub struct UploadSummary {
    /// Number of files uploaded
    pub uploaded_count: usize,
    /// Number of files skipped (already on server)
    pub skipped_count: usize,
    /// Total bytes uploaded
    pub total_bytes: u64,
    /// Failed uploads
    pub failed: Vec<String>,
}

impl UploadSummary {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_success(&self) -> bool {
        self.failed.is_empty()
    }
}

/// Collect all files from a build directory
/// Returns a list of (relative_path, content) tuples
pub fn collect_build_files(build_path: &Path) -> Result<Vec<(String, Vec<u8>)>, std::io::Error> {
    let mut files = Vec::new();
    collect_recursive(build_path, build_path, &mut files)?;
    Ok(files)
}

fn collect_recursive(
    base_path: &Path,
    current_path: &Path,
    files: &mut Vec<(String, Vec<u8>)>,
) -> Result<(), std::io::Error> {
    if current_path.is_dir() {
        for entry in std::fs::read_dir(current_path)? {
            let entry = entry?;
            let path = entry.path();
            collect_recursive(base_path, &path, files)?;
        }
    } else if current_path.is_file() {
        let relative_path = current_path
            .strip_prefix(base_path)
            .unwrap_or(current_path)
            .to_string_lossy()
            .replace('\\', "/");

        // Use forward slash for web paths
        let web_path = if relative_path.starts_with('/') {
            relative_path
        } else {
            format!("/{}", relative_path)
        };

        let content = std::fs::read(current_path)?;
        files.push((web_path, content));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mime_types() {
        assert_eq!(get_mime_type("index.html"), "text/html");
        assert_eq!(get_mime_type("style.css"), "text/css");
        assert_eq!(get_mime_type("app.js"), "application/javascript");
        assert_eq!(get_mime_type("data.json"), "application/json");
        assert_eq!(get_mime_type("image.png"), "image/png");
        assert_eq!(get_mime_type("font.woff2"), "font/woff2");
        assert_eq!(get_mime_type("unknown.xyz"), "application/octet-stream");
    }

    #[test]
    fn test_mime_type_case_insensitive() {
        assert_eq!(get_mime_type("file.HTML"), "text/html");
        assert_eq!(get_mime_type("file.CSS"), "text/css");
        assert_eq!(get_mime_type("file.JS"), "application/javascript");
    }

    #[test]
    fn test_file_manifest() {
        let mut manifest = FileManifest::new();
        assert!(manifest.is_empty());

        manifest.add_file(
            "/index.html".to_string(),
            "abc123".to_string(),
            b"<html></html>".to_vec(),
        );

        assert_eq!(manifest.len(), 1);
        assert!(!manifest.is_empty());
        assert!(manifest.hashes().contains(&"abc123".to_string()));
    }

    #[test]
    fn test_deployment_result() {
        let result = DeploymentResult::new("https://example.com".to_string())
            .with_alias("https://prod.example.com".to_string())
            .with_deploy_id("deploy-123".to_string());

        assert_eq!(result.url, "https://example.com");
        assert_eq!(
            result.alias_url,
            Some("https://prod.example.com".to_string())
        );
        assert_eq!(result.provider_deploy_id, Some("deploy-123".to_string()));
    }

    #[test]
    fn test_file_to_upload() {
        let file = FileToUpload::new(
            "/script.js".to_string(),
            b"console.log('hello')".to_vec(),
            "hash123".to_string(),
        );

        assert_eq!(file.path, "/script.js");
        assert_eq!(file.content_type, "application/javascript");
        assert_eq!(file.hash, "hash123");
    }
}
