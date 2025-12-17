// Deploy Hash Utilities
// Unified hash calculation for different deploy platforms

use sha1::{Digest, Sha1};
use sha2::Sha256;

/// Calculate SHA-1 hash of content (Netlify uses this)
/// Returns full hex string (40 characters)
pub fn calculate_sha1(content: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
}

/// Calculate SHA-256 hash and return first 32 hex characters
/// Cloudflare Pages uses this truncated format for file manifest
pub fn calculate_sha256_short(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let result = format!("{:x}", hasher.finalize());
    // Cloudflare uses first 32 hex characters
    result[..32].to_string()
}

/// Calculate full SHA-256 hash (for future use)
#[allow(dead_code)]
pub fn calculate_sha256(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
}

/// Hash algorithm selection for different platforms
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HashAlgorithm {
    /// SHA-1 (Netlify)
    Sha1,
    /// SHA-256 truncated to 32 chars (Cloudflare)
    Sha256Short,
    /// Full SHA-256
    Sha256Full,
}

impl HashAlgorithm {
    /// Calculate hash using the selected algorithm
    pub fn calculate(&self, content: &[u8]) -> String {
        match self {
            HashAlgorithm::Sha1 => calculate_sha1(content),
            HashAlgorithm::Sha256Short => calculate_sha256_short(content),
            HashAlgorithm::Sha256Full => calculate_sha256(content),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha1_calculation() {
        let content = b"hello world";
        let hash = calculate_sha1(content);
        assert_eq!(hash, "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
        assert_eq!(hash.len(), 40);
    }

    #[test]
    fn test_sha256_short_calculation() {
        let content = b"hello world";
        let hash = calculate_sha256_short(content);
        // SHA-256 of "hello world" starts with b94d27b9...
        assert!(hash.starts_with("b94d27b9"));
        assert_eq!(hash.len(), 32);
    }

    #[test]
    fn test_sha256_full_calculation() {
        let content = b"hello world";
        let hash = calculate_sha256(content);
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_hash_algorithm_enum() {
        let content = b"test data";

        let sha1_hash = HashAlgorithm::Sha1.calculate(content);
        assert_eq!(sha1_hash.len(), 40);

        let sha256_short = HashAlgorithm::Sha256Short.calculate(content);
        assert_eq!(sha256_short.len(), 32);

        let sha256_full = HashAlgorithm::Sha256Full.calculate(content);
        assert_eq!(sha256_full.len(), 64);
    }

    #[test]
    fn test_empty_content() {
        let empty = b"";

        // SHA-1 of empty string
        let sha1_hash = calculate_sha1(empty);
        assert_eq!(sha1_hash, "da39a3ee5e6b4b0d3255bfef95601890afd80709");

        // SHA-256 short of empty string
        let sha256_short = calculate_sha256_short(empty);
        assert_eq!(sha256_short.len(), 32);
    }
}
