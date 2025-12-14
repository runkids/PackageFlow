// Git Diff Analysis for AI Commit Message Generation
// Feature: AI CLI Integration (020-ai-cli-integration)

use std::path::Path;
use std::process::Command;

use super::{AIError, AIResult};

/// Maximum diff size in characters before truncation
const MAX_DIFF_SIZE: usize = 16000; // ~4000 tokens

/// Maximum number of lines to include in diff
const MAX_DIFF_LINES: usize = 500;

/// Result of git diff analysis
#[derive(Debug, Clone)]
pub struct DiffAnalysis {
    /// The diff content
    pub diff: String,
    /// Number of files changed
    pub files_changed: usize,
    /// Number of insertions
    pub insertions: usize,
    /// Number of deletions
    pub deletions: usize,
    /// Whether the diff was truncated
    pub was_truncated: bool,
}

/// Get the staged changes diff for a repository
///
/// # Arguments
/// * `repo_path` - Path to the git repository
///
/// # Returns
/// The diff analysis result
pub fn get_staged_diff(repo_path: &Path) -> AIResult<DiffAnalysis> {
    // First check if there are any staged changes
    let status_output = Command::new("git")
        .args(["diff", "--cached", "--stat"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AIError::GitError(format!("無法執行 git diff: {}", e)))?;

    if !status_output.status.success() {
        let stderr = String::from_utf8_lossy(&status_output.stderr);
        return Err(AIError::GitError(format!("git diff 失敗: {}", stderr)));
    }

    let stat_output = String::from_utf8_lossy(&status_output.stdout);

    // Parse the stat output for file count
    if stat_output.trim().is_empty() {
        return Err(AIError::NoStagedChanges);
    }

    // Get file count and stats from the last line
    let (files_changed, insertions, deletions) = parse_diff_stat(&stat_output);

    if files_changed == 0 {
        return Err(AIError::NoStagedChanges);
    }

    // Get the actual diff
    let diff_output = Command::new("git")
        .args(["diff", "--cached"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AIError::GitError(format!("無法執行 git diff: {}", e)))?;

    if !diff_output.status.success() {
        let stderr = String::from_utf8_lossy(&diff_output.stderr);
        return Err(AIError::GitError(format!("git diff 失敗: {}", stderr)));
    }

    let diff = String::from_utf8_lossy(&diff_output.stdout).to_string();

    // Truncate if necessary
    let (truncated_diff, was_truncated) = truncate_diff(&diff);

    Ok(DiffAnalysis {
        diff: truncated_diff,
        files_changed,
        insertions,
        deletions,
        was_truncated,
    })
}

/// Parse the diff stat output to get file count and line changes
fn parse_diff_stat(stat_output: &str) -> (usize, usize, usize) {
    // Example last line: " 3 files changed, 50 insertions(+), 10 deletions(-)"
    let lines: Vec<&str> = stat_output.lines().collect();
    let last_line = lines.last().unwrap_or(&"");

    let mut files = 0;
    let mut insertions = 0;
    let mut deletions = 0;

    // Parse the summary line
    for part in last_line.split(',') {
        let part = part.trim();
        if part.contains("file") {
            if let Some(num) = part.split_whitespace().next() {
                files = num.parse().unwrap_or(0);
            }
        } else if part.contains("insertion") {
            if let Some(num) = part.split_whitespace().next() {
                insertions = num.parse().unwrap_or(0);
            }
        } else if part.contains("deletion") {
            if let Some(num) = part.split_whitespace().next() {
                deletions = num.parse().unwrap_or(0);
            }
        }
    }

    (files, insertions, deletions)
}

/// Truncate diff to fit within token limits
fn truncate_diff(diff: &str) -> (String, bool) {
    // Check if truncation is needed
    if diff.len() <= MAX_DIFF_SIZE {
        let line_count = diff.lines().count();
        if line_count <= MAX_DIFF_LINES {
            return (diff.to_string(), false);
        }
    }

    // Need to truncate - keep most important parts
    let mut result = String::new();
    let mut current_file = String::new();
    let mut files_included = 0;
    let mut in_hunk = false;
    let mut hunk_lines = 0;

    for line in diff.lines() {
        // Track file boundaries
        if line.starts_with("diff --git") {
            // Save previous file if we have room
            if !current_file.is_empty() && result.len() + current_file.len() < MAX_DIFF_SIZE {
                result.push_str(&current_file);
                files_included += 1;
            }
            current_file = String::new();
            current_file.push_str(line);
            current_file.push('\n');
            in_hunk = false;
            hunk_lines = 0;
            continue;
        }

        // Track hunk boundaries
        if line.starts_with("@@") {
            in_hunk = true;
            hunk_lines = 0;
            current_file.push_str(line);
            current_file.push('\n');
            continue;
        }

        // Limit lines per hunk
        if in_hunk {
            hunk_lines += 1;
            if hunk_lines <= 30 {
                current_file.push_str(line);
                current_file.push('\n');
            } else if hunk_lines == 31 {
                current_file.push_str("... (truncated)\n");
            }
        } else {
            // File header lines
            current_file.push_str(line);
            current_file.push('\n');
        }

        // Check total size
        if result.len() + current_file.len() > MAX_DIFF_SIZE {
            break;
        }
    }

    // Add last file if there's room
    if !current_file.is_empty() && result.len() + current_file.len() < MAX_DIFF_SIZE {
        result.push_str(&current_file);
        files_included += 1;
    }

    // Add truncation notice
    let was_truncated = result.len() < diff.len();
    if was_truncated {
        result.push_str(&format!(
            "\n... (已截斷，共 {} 個檔案變更)\n",
            files_included
        ));
    }

    (result, was_truncated)
}

/// Create a summary of changes for very large diffs
pub fn summarize_changes(diff: &DiffAnalysis) -> String {
    let file_summary = if diff.files_changed == 1 {
        "1 個檔案".to_string()
    } else {
        format!("{} 個檔案", diff.files_changed)
    };

    format!(
        "變更摘要：{}，新增 {} 行，刪除 {} 行{}",
        file_summary,
        diff.insertions,
        diff.deletions,
        if diff.was_truncated { " (已截斷)" } else { "" }
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_diff_stat() {
        let stat = " 3 files changed, 50 insertions(+), 10 deletions(-)";
        let (files, insertions, deletions) = parse_diff_stat(stat);
        assert_eq!(files, 3);
        assert_eq!(insertions, 50);
        assert_eq!(deletions, 10);
    }

    #[test]
    fn test_parse_diff_stat_single_file() {
        let stat = " 1 file changed, 5 insertions(+)";
        let (files, insertions, deletions) = parse_diff_stat(stat);
        assert_eq!(files, 1);
        assert_eq!(insertions, 5);
        assert_eq!(deletions, 0);
    }

    #[test]
    fn test_truncate_diff_small() {
        let diff = "diff --git a/test.rs b/test.rs\n+line1\n";
        let (result, was_truncated) = truncate_diff(diff);
        assert_eq!(result, diff);
        assert!(!was_truncated);
    }

    #[test]
    fn test_summarize_changes() {
        let analysis = DiffAnalysis {
            diff: String::new(),
            files_changed: 3,
            insertions: 50,
            deletions: 10,
            was_truncated: false,
        };
        let summary = summarize_changes(&analysis);
        assert!(summary.contains("3 個檔案"));
        assert!(summary.contains("50"));
        assert!(summary.contains("10"));
    }
}
