// Git commands module
// Implements Git integration feature (009-git-integration)

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::models::git::{
    Branch, Commit, DiffHunk, DiffLine, DiffLineType, FileDiff, FileDiffStatus, GitFile,
    GitFileStatus, GitStatus, Stash,
};
use crate::utils::path_resolver;

// ============================================================================
// Response Types
// ============================================================================

/// Response for get_git_status command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetGitStatusResponse {
    pub success: bool,
    pub status: Option<GitStatus>,
    pub error: Option<String>,
}

/// Response for stage_files command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageFilesResponse {
    pub success: bool,
    pub staged_files: Option<Vec<String>>,
    pub error: Option<String>,
}

/// Response for unstage_files command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnstageFilesResponse {
    pub success: bool,
    pub unstaged_files: Option<Vec<String>>,
    pub error: Option<String>,
}

/// Response for create_commit command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommitResponse {
    pub success: bool,
    pub commit_hash: Option<String>,
    pub error: Option<String>,
}

/// Response for get_branches command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetBranchesResponse {
    pub success: bool,
    pub branches: Option<Vec<Branch>>,
    pub current_branch: Option<String>,
    pub error: Option<String>,
}

/// Response for create_branch command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBranchResponse {
    pub success: bool,
    pub branch: Option<Branch>,
    pub error: Option<String>,
}

/// Response for switch_branch command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchBranchResponse {
    pub success: bool,
    pub previous_branch: Option<String>,
    pub error: Option<String>,
}

/// Response for delete_branch command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBranchResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for get_commit_history command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCommitHistoryResponse {
    pub success: bool,
    pub commits: Option<Vec<Commit>>,
    pub has_more: bool,
    pub error: Option<String>,
}

/// Response for git_push command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for git_pull command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResponse {
    pub success: bool,
    pub updated_files: Option<i32>,
    pub has_conflicts: Option<bool>,
    pub error: Option<String>,
}

/// Response for list_stashes command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListStashesResponse {
    pub success: bool,
    pub stashes: Option<Vec<Stash>>,
    pub error: Option<String>,
}

/// Response for create_stash command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStashResponse {
    pub success: bool,
    pub stash: Option<Stash>,
    pub error: Option<String>,
}

/// Response for apply_stash command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyStashResponse {
    pub success: bool,
    pub has_conflicts: Option<bool>,
    pub error: Option<String>,
}

/// Response for drop_stash command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DropStashResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for discard_changes command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardChangesResponse {
    pub success: bool,
    pub discarded_files: Option<Vec<String>>,
    pub error: Option<String>,
}

/// Git remote information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub url: String,
    pub push_url: Option<String>,
}

/// Response for get_remotes command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetRemotesResponse {
    pub success: bool,
    pub remotes: Option<Vec<GitRemote>>,
    pub error: Option<String>,
}

/// Response for add_remote command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRemoteResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for remove_remote command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveRemoteResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for git_fetch command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for git_rebase command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRebaseResponse {
    pub success: bool,
    pub has_conflicts: Option<bool>,
    pub error: Option<String>,
}

/// Git authentication status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitAuthStatus {
    /// Whether SSH agent is available
    pub ssh_agent_available: bool,
    /// List of SSH identities loaded
    pub ssh_identities: Vec<String>,
    /// Current credential helper
    pub credential_helper: Option<String>,
    /// Git user name
    pub user_name: Option<String>,
    /// Git user email
    pub user_email: Option<String>,
}

/// Response for get_git_auth_status command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetGitAuthStatusResponse {
    pub success: bool,
    pub auth_status: Option<GitAuthStatus>,
    pub error: Option<String>,
}

/// Response for test_remote_connection command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRemoteConnectionResponse {
    pub success: bool,
    pub can_connect: bool,
    pub error: Option<String>,
}

// ============================================================================
// Diff Response Types (Feature 010-git-diff-viewer)
// ============================================================================

/// Response for get_file_diff command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetFileDiffResponse {
    pub success: bool,
    pub diff: Option<FileDiff>,
    pub error: Option<String>,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Execute a git command and return the output
pub fn exec_git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = path_resolver::create_command("git")
        .args(args)
        .current_dir(cwd)
        // Disable interactive prompts for credentials
        .env("GIT_TERMINAL_PROMPT", "0")
        // Use SSH agent if available, don't prompt for password
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // Check for credential errors
        if stderr.contains("could not read Username")
            || stderr.contains("Permission denied")
            || stderr.contains("Host key verification failed")
        {
            return Err("AUTH_FAILED: Authentication required. Please configure SSH keys or credential helper.".to_string());
        }
        Err(stderr)
    }
}

/// Check if a path is a git repository
fn is_git_repo(path: &Path) -> bool {
    exec_git(path, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false)
}

/// Parse git status --porcelain=v2 output
/// Format documentation: https://git-scm.com/docs/git-status#_porcelain_format_version_2
pub fn parse_git_status_porcelain(output: &str) -> GitStatus {
    let mut status = GitStatus::default();
    let mut files: Vec<GitFile> = Vec::new();

    for line in output.lines() {
        if line.is_empty() {
            continue;
        }

        // Header lines start with #
        if line.starts_with("# branch.head ") {
            status.branch = line
                .strip_prefix("# branch.head ")
                .unwrap_or("")
                .to_string();
        } else if line.starts_with("# branch.upstream ") {
            status.upstream = Some(
                line.strip_prefix("# branch.upstream ")
                    .unwrap_or("")
                    .to_string(),
            );
        } else if line.starts_with("# branch.ab ") {
            // Format: # branch.ab +ahead -behind
            let ab = line.strip_prefix("# branch.ab ").unwrap_or("");
            let parts: Vec<&str> = ab.split_whitespace().collect();
            if parts.len() >= 2 {
                status.ahead = parts[0].trim_start_matches('+').parse().unwrap_or(0);
                status.behind = parts[1].trim_start_matches('-').parse().unwrap_or(0);
            }
        }
        // Tracked entries: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
        // or: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><tab><origPath>
        else if line.starts_with("1 ") || line.starts_with("2 ") {
            let is_rename = line.starts_with("2 ");
            let parts: Vec<&str> = line.splitn(if is_rename { 10 } else { 9 }, ' ').collect();

            if parts.len() >= 2 {
                let xy = parts[1];
                let staged_code = xy.chars().next().unwrap_or('.');
                let unstaged_code = xy.chars().nth(1).unwrap_or('.');

                // Get path (last element, may contain tab for renames)
                let path_part = parts.last().unwrap_or(&"");
                let (path, old_path) = if is_rename && path_part.contains('\t') {
                    let mut split = path_part.split('\t');
                    let new_path = split.next().unwrap_or("").to_string();
                    let orig_path = split.next().map(|s| s.to_string());
                    (new_path, orig_path)
                } else {
                    (path_part.to_string(), None)
                };

                // Handle staged changes
                if staged_code != '.' {
                    let file_status = match staged_code {
                        'M' => GitFileStatus::Modified,
                        'A' => GitFileStatus::Added,
                        'D' => GitFileStatus::Deleted,
                        'R' => GitFileStatus::Renamed,
                        'C' => GitFileStatus::Copied,
                        _ => GitFileStatus::Modified,
                    };
                    files.push(GitFile {
                        path: path.clone(),
                        status: file_status,
                        staged: true,
                        old_path: old_path.clone(),
                    });
                    status.staged_count += 1;
                }

                // Handle unstaged changes
                if unstaged_code != '.' {
                    let file_status = match unstaged_code {
                        'M' => GitFileStatus::Modified,
                        'D' => GitFileStatus::Deleted,
                        _ => GitFileStatus::Modified,
                    };
                    files.push(GitFile {
                        path: path.clone(),
                        status: file_status,
                        staged: false,
                        old_path: None,
                    });
                    status.modified_count += 1;
                }
            }
        }
        // Untracked entries: ? <path>
        else if line.starts_with("? ") {
            let path = line.strip_prefix("? ").unwrap_or("").to_string();
            files.push(GitFile {
                path,
                status: GitFileStatus::Untracked,
                staged: false,
                old_path: None,
            });
            status.untracked_count += 1;
        }
        // Ignored entries: ! <path>
        else if line.starts_with("! ") {
            // We typically don't need to track ignored files, but include for completeness
            let path = line.strip_prefix("! ").unwrap_or("").to_string();
            files.push(GitFile {
                path,
                status: GitFileStatus::Ignored,
                staged: false,
                old_path: None,
            });
        }
        // Unmerged (conflict) entries: u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
        else if line.starts_with("u ") {
            let parts: Vec<&str> = line.splitn(11, ' ').collect();
            if let Some(path) = parts.last() {
                files.push(GitFile {
                    path: path.to_string(),
                    status: GitFileStatus::Conflict,
                    staged: false,
                    old_path: None,
                });
                status.conflict_count += 1;
            }
        }
    }

    status.files = files;
    status.is_clean = status.staged_count == 0
        && status.modified_count == 0
        && status.untracked_count == 0
        && status.conflict_count == 0;

    status
}

// ============================================================================
// Commands - Phase 3: US1 View Git Status
// ============================================================================

/// Get Git repository status
#[tauri::command]
pub async fn get_git_status(project_path: String) -> Result<GetGitStatusResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GetGitStatusResponse {
            success: false,
            status: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Run git status --porcelain=v2 --branch
    match exec_git(path, &["status", "--porcelain=v2", "--branch"]) {
        Ok(output) => {
            let status = parse_git_status_porcelain(&output);
            Ok(GetGitStatusResponse {
                success: true,
                status: Some(status),
                error: None,
            })
        }
        Err(e) => Ok(GetGitStatusResponse {
            success: false,
            status: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

// ============================================================================
// Commands - Phase 4: US2 Stage and Commit
// ============================================================================

/// Stage files for commit
#[tauri::command]
pub async fn stage_files(
    project_path: String,
    files: Vec<String>,
) -> Result<StageFilesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(StageFilesResponse {
            success: false,
            staged_files: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // If files is empty, stage all
    let result = if files.is_empty() {
        exec_git(path, &["add", "-A"])
    } else {
        let mut args = vec!["add", "--"];
        let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
        args.extend(file_refs);
        exec_git(path, &args)
    };

    match result {
        Ok(_) => Ok(StageFilesResponse {
            success: true,
            staged_files: Some(if files.is_empty() {
                vec!["*".to_string()]
            } else {
                files
            }),
            error: None,
        }),
        Err(e) => Ok(StageFilesResponse {
            success: false,
            staged_files: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

/// Unstage files
#[tauri::command]
pub async fn unstage_files(
    project_path: String,
    files: Vec<String>,
) -> Result<UnstageFilesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(UnstageFilesResponse {
            success: false,
            unstaged_files: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // If files is empty, unstage all
    let result = if files.is_empty() {
        exec_git(path, &["reset", "HEAD"])
    } else {
        let mut args = vec!["reset", "HEAD", "--"];
        let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
        args.extend(file_refs);
        exec_git(path, &args)
    };

    match result {
        Ok(_) => Ok(UnstageFilesResponse {
            success: true,
            unstaged_files: Some(if files.is_empty() {
                vec!["*".to_string()]
            } else {
                files
            }),
            error: None,
        }),
        Err(e) => {
            // git reset on empty staging area returns error but is actually successful
            if e.is_empty() || e.contains("Unstaged") {
                return Ok(UnstageFilesResponse {
                    success: true,
                    unstaged_files: Some(if files.is_empty() {
                        vec!["*".to_string()]
                    } else {
                        files
                    }),
                    error: None,
                });
            }
            Ok(UnstageFilesResponse {
                success: false,
                unstaged_files: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Create a new commit
#[tauri::command]
pub async fn create_commit(
    project_path: String,
    message: String,
    amend_last: Option<bool>,
) -> Result<CreateCommitResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(CreateCommitResponse {
            success: false,
            commit_hash: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Validate message
    if message.trim().is_empty() {
        return Ok(CreateCommitResponse {
            success: false,
            commit_hash: None,
            error: Some("EMPTY_MESSAGE".to_string()),
        });
    }

    // Check if there are staged changes (unless amending)
    let amend = amend_last.unwrap_or(false);
    if !amend {
        let status_output = exec_git(path, &["status", "--porcelain=v2", "--branch"])?;
        let status = parse_git_status_porcelain(&status_output);
        if status.staged_count == 0 {
            return Ok(CreateCommitResponse {
                success: false,
                commit_hash: None,
                error: Some("NOTHING_TO_COMMIT".to_string()),
            });
        }
    }

    // Build commit command
    let result = if amend {
        exec_git(path, &["commit", "--amend", "-m", &message])
    } else {
        exec_git(path, &["commit", "-m", &message])
    };

    match result {
        Ok(_) => {
            // Get the commit hash
            let hash = exec_git(path, &["rev-parse", "HEAD"]).unwrap_or_default();
            Ok(CreateCommitResponse {
                success: true,
                commit_hash: Some(hash),
                error: None,
            })
        }
        Err(e) => Ok(CreateCommitResponse {
            success: false,
            commit_hash: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

// ============================================================================
// Commands - Phase 5: US3 Branch Management
// ============================================================================

/// Get all branches
#[tauri::command]
pub async fn get_branches(
    project_path: String,
    include_remote: Option<bool>,
) -> Result<GetBranchesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GetBranchesResponse {
            success: false,
            branches: None,
            current_branch: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Get current branch
    let current_branch = exec_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string());

    // Build branch list command
    let include_remote = include_remote.unwrap_or(true);
    let format_arg =
        format!("--format=%(refname:short)|%(objectname:short)|%(subject)|%(upstream:short)");

    let result = if include_remote {
        exec_git(path, &["branch", "-a", &format_arg])
    } else {
        exec_git(path, &["branch", &format_arg])
    };

    match result {
        Ok(output) => {
            let mut branches: Vec<Branch> = Vec::new();

            for line in output.lines() {
                if line.is_empty() {
                    continue;
                }

                let parts: Vec<&str> = line.splitn(4, '|').collect();
                if parts.len() >= 3 {
                    let name = parts[0].to_string();
                    let is_remote = name.starts_with("remotes/") || name.contains('/');
                    let display_name = name.strip_prefix("remotes/").unwrap_or(&name).to_string();

                    branches.push(Branch {
                        name: display_name.clone(),
                        is_current: display_name == current_branch,
                        is_remote,
                        upstream: parts
                            .get(3)
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string()),
                        last_commit_hash: parts[1].to_string(),
                        last_commit_message: parts[2].to_string(),
                    });
                }
            }

            Ok(GetBranchesResponse {
                success: true,
                branches: Some(branches),
                current_branch: Some(current_branch),
                error: None,
            })
        }
        Err(e) => Ok(GetBranchesResponse {
            success: false,
            branches: None,
            current_branch: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

/// Create a new branch
#[tauri::command]
pub async fn create_branch(
    project_path: String,
    branch_name: String,
    checkout: Option<bool>,
) -> Result<CreateBranchResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(CreateBranchResponse {
            success: false,
            branch: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Check if branch already exists
    if exec_git(path, &["rev-parse", "--verify", &branch_name]).is_ok() {
        return Ok(CreateBranchResponse {
            success: false,
            branch: None,
            error: Some("BRANCH_EXISTS".to_string()),
        });
    }

    // Create branch (optionally checkout)
    let checkout = checkout.unwrap_or(false);
    let result = if checkout {
        exec_git(path, &["checkout", "-b", &branch_name])
    } else {
        exec_git(path, &["branch", &branch_name])
    };

    match result {
        Ok(_) => {
            // Get branch info
            let hash = exec_git(path, &["rev-parse", "--short", &branch_name]).unwrap_or_default();
            let message =
                exec_git(path, &["log", "-1", "--format=%s", &branch_name]).unwrap_or_default();

            Ok(CreateBranchResponse {
                success: true,
                branch: Some(Branch {
                    name: branch_name,
                    is_current: checkout,
                    is_remote: false,
                    upstream: None,
                    last_commit_hash: hash,
                    last_commit_message: message,
                }),
                error: None,
            })
        }
        Err(e) => {
            if e.contains("not a valid branch name") {
                return Ok(CreateBranchResponse {
                    success: false,
                    branch: None,
                    error: Some("INVALID_BRANCH_NAME".to_string()),
                });
            }
            Ok(CreateBranchResponse {
                success: false,
                branch: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Switch to a branch
#[tauri::command]
pub async fn switch_branch(
    project_path: String,
    branch_name: String,
    force: Option<bool>,
) -> Result<SwitchBranchResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(SwitchBranchResponse {
            success: false,
            previous_branch: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Get current branch before switching
    let previous_branch = exec_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string());

    // Check if branch exists
    if exec_git(path, &["rev-parse", "--verify", &branch_name]).is_err() {
        return Ok(SwitchBranchResponse {
            success: false,
            previous_branch: None,
            error: Some("BRANCH_NOT_FOUND".to_string()),
        });
    }

    // Switch branch
    let force = force.unwrap_or(false);
    let result = if force {
        exec_git(path, &["checkout", "-f", &branch_name])
    } else {
        exec_git(path, &["checkout", &branch_name])
    };

    match result {
        Ok(_) => Ok(SwitchBranchResponse {
            success: true,
            previous_branch: Some(previous_branch),
            error: None,
        }),
        Err(e) => {
            if e.contains("local changes") || e.contains("uncommitted changes") {
                return Ok(SwitchBranchResponse {
                    success: false,
                    previous_branch: Some(previous_branch),
                    error: Some("HAS_UNCOMMITTED_CHANGES".to_string()),
                });
            }
            Ok(SwitchBranchResponse {
                success: false,
                previous_branch: Some(previous_branch),
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Delete a branch
#[tauri::command]
pub async fn delete_branch(
    project_path: String,
    branch_name: String,
    force: Option<bool>,
) -> Result<DeleteBranchResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(DeleteBranchResponse {
            success: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Check if trying to delete current branch
    let current_branch = exec_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string());

    if branch_name == current_branch {
        return Ok(DeleteBranchResponse {
            success: false,
            error: Some("CANNOT_DELETE_CURRENT".to_string()),
        });
    }

    // Delete branch
    let force = force.unwrap_or(false);
    let delete_flag = if force { "-D" } else { "-d" };

    match exec_git(path, &["branch", delete_flag, &branch_name]) {
        Ok(_) => Ok(DeleteBranchResponse {
            success: true,
            error: None,
        }),
        Err(e) => {
            if e.contains("not fully merged") {
                return Ok(DeleteBranchResponse {
                    success: false,
                    error: Some("BRANCH_NOT_MERGED".to_string()),
                });
            }
            if e.contains("not found") {
                return Ok(DeleteBranchResponse {
                    success: false,
                    error: Some("BRANCH_NOT_FOUND".to_string()),
                });
            }
            Ok(DeleteBranchResponse {
                success: false,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

// ============================================================================
// Commands - Phase 6: US4 Commit History
// ============================================================================

/// Get commit history
#[tauri::command]
pub async fn get_commit_history(
    project_path: String,
    skip: Option<i32>,
    limit: Option<i32>,
    branch: Option<String>,
) -> Result<GetCommitHistoryResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GetCommitHistoryResponse {
            success: false,
            commits: None,
            has_more: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let skip = skip.unwrap_or(0);
    let limit = limit.unwrap_or(20).min(100);
    let branch = branch.unwrap_or_else(|| "HEAD".to_string());

    // Format: hash|short_hash|message|author|email|date
    let format_arg = "--format=%H|%h|%s|%an|%ae|%cI".to_string();
    let skip_arg = format!("--skip={}", skip);
    let limit_arg = format!("-n{}", limit + 1); // Request one extra to check hasMore (no = sign)

    match exec_git(path, &["log", &branch, &format_arg, &skip_arg, &limit_arg]) {
        Ok(output) => {
            let mut commits: Vec<Commit> = Vec::new();

            for line in output.lines() {
                if line.is_empty() {
                    continue;
                }

                let parts: Vec<&str> = line.splitn(6, '|').collect();
                if parts.len() >= 6 {
                    commits.push(Commit {
                        hash: parts[0].to_string(),
                        short_hash: parts[1].to_string(),
                        message: parts[2].to_string(),
                        author: parts[3].to_string(),
                        author_email: parts[4].to_string(),
                        date: parts[5].to_string(),
                    });
                }
            }

            // Check if there are more commits
            let has_more = commits.len() > limit as usize;
            if has_more {
                commits.pop(); // Remove the extra commit
            }

            Ok(GetCommitHistoryResponse {
                success: true,
                commits: Some(commits),
                has_more,
                error: None,
            })
        }
        Err(e) => Ok(GetCommitHistoryResponse {
            success: false,
            commits: None,
            has_more: false,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

// ============================================================================
// Commands - Phase 7: US5 Push and Pull
// ============================================================================

/// Push to remote
#[tauri::command]
pub async fn git_push(
    project_path: String,
    remote: Option<String>,
    branch: Option<String>,
    set_upstream: Option<bool>,
    force: Option<bool>,
) -> Result<GitPushResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GitPushResponse {
            success: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let remote = remote.filter(|r| !r.trim().is_empty());
    let branch = branch.filter(|b| !b.trim().is_empty());
    let set_upstream = set_upstream.unwrap_or(false);
    let force = force.unwrap_or(false);

    // Build push args
    let mut args = vec!["push"];

    if set_upstream {
        args.push("-u");
    }

    if force {
        args.push("--force");
    }

    if let Some(ref remote) = remote {
        args.push(remote);
        if let Some(ref branch) = branch {
            args.push(branch);
        }
    } else if branch.is_some() {
        return Ok(GitPushResponse {
            success: false,
            error: Some("REMOTE_REQUIRED".to_string()),
        });
    }

    match exec_git(path, &args) {
        Ok(_) => Ok(GitPushResponse {
            success: true,
            error: None,
        }),
        Err(e) => {
            let error_lower = e.to_lowercase();

            let error = if error_lower.contains("no upstream")
                || error_lower.contains("has no upstream")
                || error_lower.contains("no tracking information")
                || error_lower.contains("no tracking")
            {
                "NO_UPSTREAM".to_string()
            } else if error_lower.contains("no configured push destination")
                || error_lower.contains("no remote repository specified")
                || error_lower.contains("does not appear to be a git repository")
                || error_lower.contains("no such remote")
            {
                "NO_REMOTE".to_string()
            } else if error_lower.contains("rejected") && error_lower.contains("non-fast-forward") {
                "REJECTED_NON_FAST_FORWARD".to_string()
            } else if error_lower.contains("auth_failed")
                || error_lower.contains("authentication")
                || error_lower.contains("permission denied")
            {
                "AUTH_FAILED".to_string()
            } else if error_lower.contains("could not resolve host")
                || error_lower.contains("connection refused")
            {
                "NETWORK_ERROR".to_string()
            } else {
                format!("GIT_ERROR: {}", e)
            };

            Ok(GitPushResponse {
                success: false,
                error: Some(error),
            })
        }
    }
}

/// Pull from remote
#[tauri::command]
pub async fn git_pull(
    project_path: String,
    remote: Option<String>,
    branch: Option<String>,
    rebase: Option<bool>,
) -> Result<GitPullResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GitPullResponse {
            success: false,
            updated_files: None,
            has_conflicts: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let remote = remote.filter(|r| !r.trim().is_empty());
    let branch = branch.filter(|b| !b.trim().is_empty());
    let rebase = rebase.unwrap_or(false);

    // Build pull args
    let mut args = vec!["pull"];

    if rebase {
        args.push("--rebase");
    }

    if let Some(ref remote) = remote {
        args.push(remote);
        if let Some(ref branch) = branch {
            args.push(branch);
        }
    } else if branch.is_some() {
        return Ok(GitPullResponse {
            success: false,
            updated_files: None,
            has_conflicts: Some(false),
            error: Some("REMOTE_REQUIRED".to_string()),
        });
    }

    match exec_git(path, &args) {
        Ok(output) => {
            // Check for conflicts
            let has_conflicts =
                output.contains("CONFLICT") || output.contains("Automatic merge failed");

            // Try to count updated files from output
            let updated_files = output
                .lines()
                .filter(|line| line.contains("insertions") || line.contains("deletions"))
                .count() as i32;

            Ok(GitPullResponse {
                success: true,
                updated_files: Some(updated_files),
                has_conflicts: Some(has_conflicts),
                error: None,
            })
        }
        Err(e) => {
            let has_conflicts = e.contains("CONFLICT") || e.contains("Automatic merge failed");

            if has_conflicts {
                return Ok(GitPullResponse {
                    success: false,
                    updated_files: None,
                    has_conflicts: Some(true),
                    error: Some("MERGE_CONFLICT".to_string()),
                });
            }

            let error_lower = e.to_lowercase();

            let error = if error_lower.contains("no upstream")
                || error_lower.contains("has no upstream")
                || error_lower.contains("no tracking")
                || error_lower.contains("no tracking information")
                || error_lower.contains("there is no tracking information")
            {
                "NO_UPSTREAM".to_string()
            } else if error_lower.contains("no remote repository specified")
                || error_lower.contains("does not appear to be a git repository")
                || error_lower.contains("no such remote")
            {
                "NO_REMOTE".to_string()
            } else if error_lower.contains("auth_failed")
                || error_lower.contains("authentication")
                || error_lower.contains("permission denied")
            {
                "AUTH_FAILED".to_string()
            } else if error_lower.contains("could not resolve host")
                || error_lower.contains("connection refused")
            {
                "NETWORK_ERROR".to_string()
            } else {
                format!("GIT_ERROR: {}", e)
            };

            Ok(GitPullResponse {
                success: false,
                updated_files: None,
                has_conflicts: Some(false),
                error: Some(error),
            })
        }
    }
}

// ============================================================================
// Commands - Phase 8: US6 Stash
// ============================================================================

/// List all stashes
#[tauri::command]
pub async fn list_stashes(project_path: String) -> Result<ListStashesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(ListStashesResponse {
            success: false,
            stashes: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Format: stash@{index}|message|branch|date
    let format = "%gd|%s|%gs|%ci";

    match exec_git(path, &["stash", "list", &format!("--format={}", format)]) {
        Ok(output) => {
            let mut stashes: Vec<Stash> = Vec::new();

            for (index, line) in output.lines().enumerate() {
                if line.is_empty() {
                    continue;
                }

                let parts: Vec<&str> = line.splitn(4, '|').collect();
                if parts.len() >= 4 {
                    // Extract branch from message like "WIP on main: abc1234 message"
                    let message = parts[1];
                    let branch = if message.starts_with("WIP on ") || message.starts_with("On ") {
                        message
                            .split(':')
                            .next()
                            .unwrap_or("")
                            .replace("WIP on ", "")
                            .replace("On ", "")
                    } else {
                        String::new()
                    };

                    stashes.push(Stash {
                        index: index as i32,
                        message: parts[2].to_string(),
                        branch,
                        date: parts[3].to_string(),
                    });
                }
            }

            Ok(ListStashesResponse {
                success: true,
                stashes: Some(stashes),
                error: None,
            })
        }
        Err(e) => {
            // Empty stash list is not an error
            if e.is_empty() {
                return Ok(ListStashesResponse {
                    success: true,
                    stashes: Some(vec![]),
                    error: None,
                });
            }
            Ok(ListStashesResponse {
                success: false,
                stashes: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Create a new stash
#[tauri::command]
pub async fn create_stash(
    project_path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<CreateStashResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(CreateStashResponse {
            success: false,
            stash: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let include_untracked = include_untracked.unwrap_or(false);

    // Build stash args
    let mut args = vec!["stash", "push"];

    if include_untracked {
        args.push("-u");
    }

    if let Some(ref msg) = message {
        args.push("-m");
        args.push(msg);
    }

    match exec_git(path, &args) {
        Ok(output) => {
            // Check if no changes to stash
            if output.contains("No local changes to save") {
                return Ok(CreateStashResponse {
                    success: false,
                    stash: None,
                    error: Some("NOTHING_TO_STASH".to_string()),
                });
            }

            // Get current branch
            let branch = exec_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
                .unwrap_or_else(|_| "HEAD".to_string());

            Ok(CreateStashResponse {
                success: true,
                stash: Some(Stash {
                    index: 0,
                    message: message.unwrap_or_else(|| "WIP".to_string()),
                    branch,
                    date: chrono::Utc::now().to_rfc3339(),
                }),
                error: None,
            })
        }
        Err(e) => {
            if e.contains("No local changes") {
                return Ok(CreateStashResponse {
                    success: false,
                    stash: None,
                    error: Some("NOTHING_TO_STASH".to_string()),
                });
            }
            Ok(CreateStashResponse {
                success: false,
                stash: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Apply a stash
#[tauri::command]
pub async fn apply_stash(
    project_path: String,
    index: Option<i32>,
    pop: Option<bool>,
) -> Result<ApplyStashResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(ApplyStashResponse {
            success: false,
            has_conflicts: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let index = index.unwrap_or(0);
    let pop = pop.unwrap_or(false);
    let stash_ref = format!("stash@{{{}}}", index);

    let command = if pop { "pop" } else { "apply" };

    match exec_git(path, &["stash", command, &stash_ref]) {
        Ok(output) => {
            let has_conflicts = output.contains("CONFLICT");
            Ok(ApplyStashResponse {
                success: true,
                has_conflicts: Some(has_conflicts),
                error: None,
            })
        }
        Err(e) => {
            if e.contains("CONFLICT") {
                return Ok(ApplyStashResponse {
                    success: false,
                    has_conflicts: Some(true),
                    error: Some("STASH_CONFLICT".to_string()),
                });
            }
            if e.contains("does not exist") || e.contains("No stash") {
                return Ok(ApplyStashResponse {
                    success: false,
                    has_conflicts: None,
                    error: Some("STASH_NOT_FOUND".to_string()),
                });
            }
            Ok(ApplyStashResponse {
                success: false,
                has_conflicts: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Drop a stash
#[tauri::command]
pub async fn drop_stash(
    project_path: String,
    index: Option<i32>,
) -> Result<DropStashResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(DropStashResponse {
            success: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let index = index.unwrap_or(0);
    let stash_ref = format!("stash@{{{}}}", index);

    match exec_git(path, &["stash", "drop", &stash_ref]) {
        Ok(_) => Ok(DropStashResponse {
            success: true,
            error: None,
        }),
        Err(e) => {
            if e.contains("does not exist") || e.contains("No stash") {
                return Ok(DropStashResponse {
                    success: false,
                    error: Some("STASH_NOT_FOUND".to_string()),
                });
            }
            Ok(DropStashResponse {
                success: false,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

// ============================================================================
// Remote Management Commands
// ============================================================================

/// Get list of remotes
#[tauri::command]
pub async fn get_remotes(project_path: String) -> Result<GetRemotesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GetRemotesResponse {
            success: false,
            remotes: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Get remotes with verbose output
    match exec_git(path, &["remote", "-v"]) {
        Ok(output) => {
            let mut remotes: Vec<GitRemote> = Vec::new();
            let mut seen_names: std::collections::HashSet<String> =
                std::collections::HashSet::new();

            for line in output.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let name = parts[0].to_string();
                    let url = parts[1].to_string();
                    let is_push = parts.get(2).map(|s| s.contains("push")).unwrap_or(false);

                    if !seen_names.contains(&name) {
                        seen_names.insert(name.clone());
                        remotes.push(GitRemote {
                            name,
                            url,
                            push_url: None,
                        });
                    } else if is_push {
                        // Update push_url for existing remote
                        if let Some(remote) = remotes.iter_mut().find(|r| r.name == name) {
                            if remote.url != url {
                                remote.push_url = Some(url);
                            }
                        }
                    }
                }
            }

            Ok(GetRemotesResponse {
                success: true,
                remotes: Some(remotes),
                error: None,
            })
        }
        Err(e) => Ok(GetRemotesResponse {
            success: false,
            remotes: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

/// Add a new remote
#[tauri::command]
pub async fn add_remote(
    project_path: String,
    name: String,
    url: String,
) -> Result<AddRemoteResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(AddRemoteResponse {
            success: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Validate remote name
    if name.is_empty() {
        return Ok(AddRemoteResponse {
            success: false,
            error: Some("INVALID_REMOTE_NAME".to_string()),
        });
    }

    // Validate URL
    if url.is_empty() {
        return Ok(AddRemoteResponse {
            success: false,
            error: Some("INVALID_REMOTE_URL".to_string()),
        });
    }

    match exec_git(path, &["remote", "add", &name, &url]) {
        Ok(_) => Ok(AddRemoteResponse {
            success: true,
            error: None,
        }),
        Err(e) => {
            if e.contains("already exists") {
                return Ok(AddRemoteResponse {
                    success: false,
                    error: Some("REMOTE_EXISTS".to_string()),
                });
            }
            Ok(AddRemoteResponse {
                success: false,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Remove a remote
#[tauri::command]
pub async fn remove_remote(
    project_path: String,
    name: String,
) -> Result<RemoveRemoteResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(RemoveRemoteResponse {
            success: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    match exec_git(path, &["remote", "remove", &name]) {
        Ok(_) => Ok(RemoveRemoteResponse {
            success: true,
            error: None,
        }),
        Err(e) => {
            if e.contains("No such remote") || e.contains("does not exist") {
                return Ok(RemoveRemoteResponse {
                    success: false,
                    error: Some("REMOTE_NOT_FOUND".to_string()),
                });
            }
            Ok(RemoveRemoteResponse {
                success: false,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

// ============================================================================
// Fetch Command
// ============================================================================

/// Fetch from remote
#[tauri::command]
pub async fn git_fetch(
    project_path: String,
    remote: Option<String>,
    all_remotes: Option<bool>,
    prune: Option<bool>,
) -> Result<GitFetchResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GitFetchResponse {
            success: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let all_remotes = all_remotes.unwrap_or(false);
    let prune = prune.unwrap_or(false);

    // Build fetch args
    let mut args = vec!["fetch"];

    if all_remotes {
        args.push("--all");
    } else if let Some(ref remote_name) = remote {
        args.push(remote_name);
    }

    if prune {
        args.push("--prune");
    }

    match exec_git(path, &args) {
        Ok(_) => Ok(GitFetchResponse {
            success: true,
            error: None,
        }),
        Err(e) => {
            let error = if e.contains("Could not resolve host") || e.contains("Connection refused")
            {
                "NETWORK_ERROR".to_string()
            } else if e.contains("Authentication") || e.contains("permission denied") {
                "AUTH_FAILED".to_string()
            } else if e.contains("does not appear to be a git repository") {
                "INVALID_REMOTE".to_string()
            } else {
                format!("GIT_ERROR: {}", e)
            };

            Ok(GitFetchResponse {
                success: false,
                error: Some(error),
            })
        }
    }
}

// ============================================================================
// Rebase Commands
// ============================================================================

/// Rebase current branch onto another branch
#[tauri::command]
pub async fn git_rebase(
    project_path: String,
    onto: String,
    interactive: Option<bool>,
) -> Result<GitRebaseResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GitRebaseResponse {
            success: false,
            has_conflicts: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Note: Interactive rebase is not supported in non-interactive mode
    // We only support non-interactive rebase
    let interactive = interactive.unwrap_or(false);
    if interactive {
        return Ok(GitRebaseResponse {
            success: false,
            has_conflicts: None,
            error: Some("INTERACTIVE_NOT_SUPPORTED".to_string()),
        });
    }

    match exec_git(path, &["rebase", &onto]) {
        Ok(_) => Ok(GitRebaseResponse {
            success: true,
            has_conflicts: Some(false),
            error: None,
        }),
        Err(e) => {
            if e.contains("CONFLICT") || e.contains("could not apply") {
                return Ok(GitRebaseResponse {
                    success: false,
                    has_conflicts: Some(true),
                    error: Some("REBASE_CONFLICT".to_string()),
                });
            }
            if e.contains("uncommitted changes") || e.contains("dirty") {
                return Ok(GitRebaseResponse {
                    success: false,
                    has_conflicts: None,
                    error: Some("HAS_UNCOMMITTED_CHANGES".to_string()),
                });
            }
            Ok(GitRebaseResponse {
                success: false,
                has_conflicts: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Abort an ongoing rebase
#[tauri::command]
pub async fn git_rebase_abort(project_path: String) -> Result<GitRebaseResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GitRebaseResponse {
            success: false,
            has_conflicts: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    match exec_git(path, &["rebase", "--abort"]) {
        Ok(_) => Ok(GitRebaseResponse {
            success: true,
            has_conflicts: None,
            error: None,
        }),
        Err(e) => {
            if e.contains("No rebase in progress") {
                return Ok(GitRebaseResponse {
                    success: false,
                    has_conflicts: None,
                    error: Some("NO_REBASE_IN_PROGRESS".to_string()),
                });
            }
            Ok(GitRebaseResponse {
                success: false,
                has_conflicts: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Continue an ongoing rebase after resolving conflicts
#[tauri::command]
pub async fn git_rebase_continue(project_path: String) -> Result<GitRebaseResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(GitRebaseResponse {
            success: false,
            has_conflicts: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    match exec_git(path, &["rebase", "--continue"]) {
        Ok(_) => Ok(GitRebaseResponse {
            success: true,
            has_conflicts: Some(false),
            error: None,
        }),
        Err(e) => {
            if e.contains("CONFLICT") || e.contains("could not apply") {
                return Ok(GitRebaseResponse {
                    success: false,
                    has_conflicts: Some(true),
                    error: Some("REBASE_CONFLICT".to_string()),
                });
            }
            if e.contains("No rebase in progress") {
                return Ok(GitRebaseResponse {
                    success: false,
                    has_conflicts: None,
                    error: Some("NO_REBASE_IN_PROGRESS".to_string()),
                });
            }
            Ok(GitRebaseResponse {
                success: false,
                has_conflicts: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

// ============================================================================
// Git Authentication Commands
// ============================================================================

/// Get git authentication status
#[tauri::command]
pub async fn get_git_auth_status(project_path: String) -> Result<GetGitAuthStatusResponse, String> {
    let path = Path::new(&project_path);

    // Run SSH agent check in a blocking task with timeout
    let ssh_result = tokio::task::spawn_blocking(move || {
        // Use timeout for ssh-add command
        // Get SSH_AUTH_SOCK from our path resolver (handles macOS GUI app issues)
        let ssh_sock = path_resolver::get_ssh_auth_sock().unwrap_or_default();

        let ssh_output = path_resolver::create_command("ssh-add")
            .arg("-l")
            .env("SSH_AUTH_SOCK", &ssh_sock)
            .output();

        match ssh_output {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let identities: Vec<String> = stdout
                        .lines()
                        .filter(|line| !line.is_empty() && !line.contains("no identities"))
                        .map(|line| {
                            // Extract key comment (usually the file path or email)
                            let parts: Vec<&str> = line.split_whitespace().collect();
                            if parts.len() >= 3 {
                                parts[2..].join(" ")
                            } else {
                                line.to_string()
                            }
                        })
                        .collect();
                    (true, identities)
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    // Check if agent is not running vs no identities
                    if stderr.contains("Could not open") || stderr.contains("agent") {
                        (false, vec![])
                    } else {
                        (true, vec![]) // Agent running but no keys
                    }
                }
            }
            Err(_) => (false, vec![]),
        }
    })
    .await;

    let (ssh_agent_available, ssh_identities) = ssh_result.unwrap_or((false, vec![]));

    // Get git credential helper
    let credential_helper = exec_git(path, &["config", "--get", "credential.helper"]).ok();

    // Get git user name
    let user_name = exec_git(path, &["config", "--get", "user.name"]).ok();

    // Get git user email
    let user_email = exec_git(path, &["config", "--get", "user.email"]).ok();

    Ok(GetGitAuthStatusResponse {
        success: true,
        auth_status: Some(GitAuthStatus {
            ssh_agent_available,
            ssh_identities,
            credential_helper,
            user_name,
            user_email,
        }),
        error: None,
    })
}

/// Test connection to a remote
#[tauri::command]
pub async fn test_remote_connection(
    project_path: String,
    remote_name: String,
) -> Result<TestRemoteConnectionResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(TestRemoteConnectionResponse {
            success: false,
            can_connect: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Use tokio::process::Command with timeout for async execution
    let path_buf = path.to_path_buf();
    let remote = remote_name.clone();

    // Run git ls-remote with a 15 second timeout
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        tokio::task::spawn_blocking(move || {
            path_resolver::create_command("git")
                .args(&["ls-remote", "--exit-code", "--heads", &remote])
                .current_dir(&path_buf)
                .env("GIT_TERMINAL_PROMPT", "0")
                .env(
                    "GIT_SSH_COMMAND",
                    "ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new",
                )
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(output))) => {
            if output.status.success() {
                Ok(TestRemoteConnectionResponse {
                    success: true,
                    can_connect: true,
                    error: None,
                })
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let error = if stderr.contains("could not read Username")
                    || stderr.contains("Permission denied")
                    || stderr.contains("Host key verification failed")
                {
                    "AUTH_FAILED".to_string()
                } else if stderr.contains("Could not resolve host")
                    || stderr.contains("Connection refused")
                    || stderr.contains("Connection timed out")
                {
                    "NETWORK_ERROR".to_string()
                } else if stderr.contains("does not appear to be a git repository") {
                    "INVALID_REMOTE".to_string()
                } else {
                    stderr
                };

                Ok(TestRemoteConnectionResponse {
                    success: true,
                    can_connect: false,
                    error: Some(error),
                })
            }
        }
        Ok(Ok(Err(e))) => Ok(TestRemoteConnectionResponse {
            success: false,
            can_connect: false,
            error: Some(format!("Failed to execute git: {}", e)),
        }),
        Ok(Err(_)) => Ok(TestRemoteConnectionResponse {
            success: false,
            can_connect: false,
            error: Some("Task execution failed".to_string()),
        }),
        Err(_) => Ok(TestRemoteConnectionResponse {
            success: true,
            can_connect: false,
            error: Some("TIMEOUT".to_string()),
        }),
    }
}

// ============================================================================
// Discard Changes Commands
// ============================================================================

/// Discard changes to files (restore to last commit state)
#[tauri::command]
pub async fn discard_changes(
    project_path: String,
    files: Vec<String>,
) -> Result<DiscardChangesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(DiscardChangesResponse {
            success: false,
            discarded_files: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // If files is empty, discard all changes
    let result = if files.is_empty() {
        // Discard all tracked file changes
        exec_git(path, &["checkout", "--", "."])
    } else {
        // Discard specific files
        let mut args = vec!["checkout", "--"];
        let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
        args.extend(file_refs);
        exec_git(path, &args)
    };

    match result {
        Ok(_) => Ok(DiscardChangesResponse {
            success: true,
            discarded_files: Some(if files.is_empty() {
                vec!["*".to_string()]
            } else {
                files
            }),
            error: None,
        }),
        Err(e) => {
            if e.contains("did not match any file") || e.contains("pathspec") {
                return Ok(DiscardChangesResponse {
                    success: false,
                    discarded_files: None,
                    error: Some("FILE_NOT_FOUND".to_string()),
                });
            }
            Ok(DiscardChangesResponse {
                success: false,
                discarded_files: None,
                error: Some(format!("GIT_ERROR: {}", e)),
            })
        }
    }
}

/// Delete untracked files
#[tauri::command]
pub async fn clean_untracked(
    project_path: String,
    files: Vec<String>,
    include_directories: Option<bool>,
) -> Result<DiscardChangesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(path) {
        return Ok(DiscardChangesResponse {
            success: false,
            discarded_files: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let include_dirs = include_directories.unwrap_or(false);

    // If files is empty, clean all untracked files
    let result = if files.is_empty() {
        let mut args = vec!["clean", "-f"];
        if include_dirs {
            args.push("-d");
        }
        exec_git(path, &args)
    } else {
        // Clean specific untracked files
        let mut args = vec!["clean", "-f"];
        if include_dirs {
            args.push("-d");
        }
        args.push("--");
        let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
        args.extend(file_refs);
        exec_git(path, &args)
    };

    match result {
        Ok(output) => {
            // Parse cleaned files from output
            let cleaned: Vec<String> = output
                .lines()
                .filter(|line| line.starts_with("Removing "))
                .map(|line| line.strip_prefix("Removing ").unwrap_or(line).to_string())
                .collect();

            Ok(DiscardChangesResponse {
                success: true,
                discarded_files: Some(if cleaned.is_empty() && !files.is_empty() {
                    files
                } else {
                    cleaned
                }),
                error: None,
            })
        }
        Err(e) => Ok(DiscardChangesResponse {
            success: false,
            discarded_files: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

// ============================================================================
// Diff Commands (Feature 010-git-diff-viewer)
// ============================================================================

/// Detect programming language from file extension
fn detect_language(file_path: &str) -> Option<String> {
    let extension = file_path.rsplit('.').next()?;
    match extension.to_lowercase().as_str() {
        "ts" | "tsx" => Some("typescript".to_string()),
        "js" | "jsx" => Some("javascript".to_string()),
        "rs" => Some("rust".to_string()),
        "py" => Some("python".to_string()),
        "json" => Some("json".to_string()),
        "md" | "markdown" => Some("markdown".to_string()),
        "css" => Some("css".to_string()),
        "scss" | "sass" => Some("scss".to_string()),
        "html" | "htm" => Some("html".to_string()),
        "yml" | "yaml" => Some("yaml".to_string()),
        "toml" => Some("toml".to_string()),
        "xml" => Some("xml".to_string()),
        "sh" | "bash" => Some("bash".to_string()),
        "sql" => Some("sql".to_string()),
        "go" => Some("go".to_string()),
        "java" => Some("java".to_string()),
        "c" | "h" => Some("c".to_string()),
        "cpp" | "cc" | "cxx" | "hpp" => Some("cpp".to_string()),
        "swift" => Some("swift".to_string()),
        "kt" | "kts" => Some("kotlin".to_string()),
        "rb" => Some("ruby".to_string()),
        "php" => Some("php".to_string()),
        _ => None,
    }
}

/// Parse git diff output into FileDiff structure
fn parse_diff_output(diff_output: &str, file_path: &str, status: FileDiffStatus) -> FileDiff {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut additions = 0;
    let mut deletions = 0;
    let mut is_binary = false;
    let mut old_path: Option<String> = None;

    // Check for binary file
    if diff_output.contains("Binary files") || diff_output.contains("GIT binary patch") {
        is_binary = true;
        return FileDiff {
            path: file_path.to_string(),
            old_path,
            status,
            is_binary: true,
            language: detect_language(file_path),
            hunks: Vec::new(),
            additions: 0,
            deletions: 0,
        };
    }

    let mut current_hunk: Option<DiffHunk> = None;
    let mut hunk_index = 0;
    let mut old_line_num = 0;
    let mut new_line_num = 0;
    let mut line_index = 0;

    for line in diff_output.lines() {
        // Check for rename header
        if line.starts_with("rename from ") {
            old_path = Some(line.strip_prefix("rename from ").unwrap_or("").to_string());
            continue;
        }

        // Hunk header: @@ -start,count +start,count @@ optional header
        if line.starts_with("@@") {
            // Save previous hunk
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }

            // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@ header
            let parts: Vec<&str> = line.split("@@").collect();
            if parts.len() >= 2 {
                let range_part = parts[1].trim();
                let header = if parts.len() >= 3 && !parts[2].trim().is_empty() {
                    Some(parts[2].trim().to_string())
                } else {
                    None
                };

                // Parse -old_start,old_count +new_start,new_count
                let ranges: Vec<&str> = range_part.split_whitespace().collect();
                let (old_start, old_count) = if !ranges.is_empty() && ranges[0].starts_with('-') {
                    parse_range(ranges[0].trim_start_matches('-'))
                } else {
                    (1, 0)
                };
                let (new_start, new_count) = if ranges.len() > 1 && ranges[1].starts_with('+') {
                    parse_range(ranges[1].trim_start_matches('+'))
                } else {
                    (1, 0)
                };

                old_line_num = old_start;
                new_line_num = new_start;
                line_index = 0;

                current_hunk = Some(DiffHunk {
                    index: hunk_index,
                    old_start,
                    old_count,
                    new_start,
                    new_count,
                    header,
                    lines: Vec::new(),
                });
                hunk_index += 1;
            }
            continue;
        }

        // Skip diff header lines
        if line.starts_with("diff --git")
            || line.starts_with("index ")
            || line.starts_with("---")
            || line.starts_with("+++")
            || line.starts_with("new file mode")
            || line.starts_with("deleted file mode")
            || line.starts_with("old mode")
            || line.starts_with("new mode")
            || line.starts_with("similarity index")
            || line.starts_with("rename from")
            || line.starts_with("rename to")
        {
            continue;
        }

        // Content lines
        if let Some(ref mut hunk) = current_hunk {
            let (line_type, content, old_ln, new_ln) =
                if let Some(stripped) = line.strip_prefix('+') {
                    additions += 1;
                    let ln = new_line_num;
                    new_line_num += 1;
                    (DiffLineType::Addition, stripped.to_string(), None, Some(ln))
                } else if let Some(stripped) = line.strip_prefix('-') {
                    deletions += 1;
                    let ln = old_line_num;
                    old_line_num += 1;
                    (DiffLineType::Deletion, stripped.to_string(), Some(ln), None)
                } else if let Some(stripped) = line.strip_prefix(' ') {
                    let old_ln = old_line_num;
                    let new_ln = new_line_num;
                    old_line_num += 1;
                    new_line_num += 1;
                    (
                        DiffLineType::Context,
                        stripped.to_string(),
                        Some(old_ln),
                        Some(new_ln),
                    )
                } else if line.starts_with('\\') {
                    // "\ No newline at end of file" - skip
                    continue;
                } else {
                    // Treat as context line without prefix
                    let old_ln = old_line_num;
                    let new_ln = new_line_num;
                    old_line_num += 1;
                    new_line_num += 1;
                    (
                        DiffLineType::Context,
                        line.to_string(),
                        Some(old_ln),
                        Some(new_ln),
                    )
                };

            hunk.lines.push(DiffLine {
                index: line_index,
                line_type,
                content,
                old_line_number: old_ln,
                new_line_number: new_ln,
            });
            line_index += 1;
        }
    }

    // Don't forget the last hunk
    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    FileDiff {
        path: file_path.to_string(),
        old_path,
        status,
        is_binary,
        language: detect_language(file_path),
        hunks,
        additions,
        deletions,
    }
}

/// Parse range string like "10,5" into (start, count)
fn parse_range(range: &str) -> (i32, i32) {
    let parts: Vec<&str> = range.split(',').collect();
    let start = parts.first().and_then(|s| s.parse().ok()).unwrap_or(1);
    let count = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
    (start, count)
}

/// Get file diff for a specific file
#[tauri::command]
pub async fn get_file_diff(
    project_path: String,
    file_path: String,
    staged: bool,
) -> Result<GetFileDiffResponse, String> {
    let path = Path::new(&project_path);

    if !is_git_repo(path) {
        return Ok(GetFileDiffResponse {
            success: false,
            diff: None,
            error: Some("NOT_GIT_REPO: Not a git repository".to_string()),
        });
    }

    // Determine file status first
    let status_result = exec_git(path, &["status", "--porcelain", "--", &file_path]);
    let (file_status, is_untracked) = match &status_result {
        Ok(output) if !output.is_empty() => {
            let first_char = output.chars().next().unwrap_or(' ');
            let second_char = output.chars().nth(1).unwrap_or(' ');
            let is_untracked = first_char == '?' && second_char == '?';
            let status_char = if staged { first_char } else { second_char };
            let status = match status_char {
                'A' | '?' => FileDiffStatus::Added,
                'D' => FileDiffStatus::Deleted,
                'R' => FileDiffStatus::Renamed,
                _ => FileDiffStatus::Modified,
            };
            (status, is_untracked)
        }
        _ => (FileDiffStatus::Modified, false),
    };

    // For untracked files, we need special handling since git diff won't show anything
    if is_untracked && !staged {
        return get_untracked_file_diff(path, &file_path);
    }

    // For deleted files that are not staged, we need to show the original content
    // git diff won't show anything for unstaged deletions, need to use git diff HEAD
    let is_deleted = file_status == FileDiffStatus::Deleted;

    // Get the diff
    let args = if staged {
        vec!["diff", "--cached", "--", &file_path]
    } else if is_deleted {
        // For unstaged deleted files, compare with HEAD to show what was deleted
        vec!["diff", "HEAD", "--", &file_path]
    } else {
        vec!["diff", "--", &file_path]
    };

    match exec_git(path, &args) {
        Ok(diff_output) => {
            if diff_output.is_empty() {
                // If still empty for deleted files, try to get content from last commit
                if is_deleted && !staged {
                    return get_deleted_file_diff(path, &file_path);
                }
                // No changes for this diff type
                return Ok(GetFileDiffResponse {
                    success: true,
                    diff: None,
                    error: None,
                });
            }

            let diff = parse_diff_output(&diff_output, &file_path, file_status);
            Ok(GetFileDiffResponse {
                success: true,
                diff: Some(diff),
                error: None,
            })
        }
        Err(e) => Ok(GetFileDiffResponse {
            success: false,
            diff: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

/// Get diff for an untracked file by reading its content
fn get_untracked_file_diff(
    repo_path: &Path,
    file_path: &str,
) -> Result<GetFileDiffResponse, String> {
    let full_path = repo_path.join(file_path);

    // Check if it's a directory
    if full_path.is_dir() {
        // For directories, list files inside
        let mut all_lines = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&full_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let file_type = if entry.path().is_dir() { "dir" } else { "file" };
                all_lines.push(format!("{} {}", file_type, name));
            }
        }

        let line_count = all_lines.len() as i32;
        let lines: Vec<DiffLine> = all_lines
            .into_iter()
            .enumerate()
            .map(|(i, content)| DiffLine {
                index: i as i32,
                line_type: DiffLineType::Addition,
                content,
                old_line_number: None,
                new_line_number: Some(i as i32 + 1),
            })
            .collect();

        let hunk = DiffHunk {
            index: 0,
            header: Some(format!("@@ -0,0 +1,{} @@ (directory contents)", line_count)),
            old_start: 0,
            old_count: 0,
            new_start: 1,
            new_count: line_count,
            lines,
        };

        // Detect language from file extension
        let language = detect_language(file_path);

        return Ok(GetFileDiffResponse {
            success: true,
            diff: Some(FileDiff {
                path: file_path.to_string(),
                old_path: None,
                status: FileDiffStatus::Added,
                is_binary: false,
                language,
                hunks: vec![hunk],
                additions: line_count,
                deletions: 0,
            }),
            error: None,
        });
    }

    // Read file content
    match std::fs::read(&full_path) {
        Ok(content) => {
            // Check if binary
            let is_binary = content.iter().take(8000).any(|&b| b == 0);

            // Detect language from file extension
            let language = detect_language(file_path);

            if is_binary {
                return Ok(GetFileDiffResponse {
                    success: true,
                    diff: Some(FileDiff {
                        path: file_path.to_string(),
                        old_path: None,
                        status: FileDiffStatus::Added,
                        is_binary: true,
                        language: None,
                        hunks: vec![],
                        additions: 0,
                        deletions: 0,
                    }),
                    error: None,
                });
            }

            // Parse as text
            let text = String::from_utf8_lossy(&content);
            let file_lines: Vec<&str> = text.lines().collect();
            let line_count = file_lines.len() as i32;

            let lines: Vec<DiffLine> = file_lines
                .into_iter()
                .enumerate()
                .map(|(i, content)| DiffLine {
                    index: i as i32,
                    line_type: DiffLineType::Addition,
                    content: content.to_string(),
                    old_line_number: None,
                    new_line_number: Some(i as i32 + 1),
                })
                .collect();

            let hunk = DiffHunk {
                index: 0,
                header: Some(format!("@@ -0,0 +1,{} @@ (new file)", line_count)),
                old_start: 0,
                old_count: 0,
                new_start: 1,
                new_count: line_count,
                lines,
            };

            Ok(GetFileDiffResponse {
                success: true,
                diff: Some(FileDiff {
                    path: file_path.to_string(),
                    old_path: None,
                    status: FileDiffStatus::Added,
                    is_binary: false,
                    language,
                    hunks: vec![hunk],
                    additions: line_count,
                    deletions: 0,
                }),
                error: None,
            })
        }
        Err(e) => Ok(GetFileDiffResponse {
            success: false,
            diff: None,
            error: Some(format!("Failed to read file: {}", e)),
        }),
    }
}

/// Get diff for a deleted file by reading its content from the last commit
fn get_deleted_file_diff(repo_path: &Path, file_path: &str) -> Result<GetFileDiffResponse, String> {
    // Get the file content from HEAD
    let show_result = exec_git(repo_path, &["show", &format!("HEAD:{}", file_path)]);

    match show_result {
        Ok(content) => {
            // Check if binary (contains null bytes)
            let is_binary = content.as_bytes().iter().take(8000).any(|&b| b == 0);

            // Detect language from file extension
            let language = detect_language(file_path);

            if is_binary {
                return Ok(GetFileDiffResponse {
                    success: true,
                    diff: Some(FileDiff {
                        path: file_path.to_string(),
                        old_path: None,
                        status: FileDiffStatus::Deleted,
                        is_binary: true,
                        language: None,
                        hunks: vec![],
                        additions: 0,
                        deletions: 0,
                    }),
                    error: None,
                });
            }

            // Parse as text - all lines are deletions
            let file_lines: Vec<&str> = content.lines().collect();
            let line_count = file_lines.len() as i32;

            let lines: Vec<DiffLine> = file_lines
                .into_iter()
                .enumerate()
                .map(|(i, line_content)| DiffLine {
                    index: i as i32,
                    line_type: DiffLineType::Deletion,
                    content: line_content.to_string(),
                    old_line_number: Some(i as i32 + 1),
                    new_line_number: None,
                })
                .collect();

            let hunk = DiffHunk {
                index: 0,
                header: Some(format!("@@ -1,{} +0,0 @@ (deleted file)", line_count)),
                old_start: 1,
                old_count: line_count,
                new_start: 0,
                new_count: 0,
                lines,
            };

            Ok(GetFileDiffResponse {
                success: true,
                diff: Some(FileDiff {
                    path: file_path.to_string(),
                    old_path: None,
                    status: FileDiffStatus::Deleted,
                    is_binary: false,
                    language,
                    hunks: vec![hunk],
                    additions: 0,
                    deletions: line_count,
                }),
                error: None,
            })
        }
        Err(e) => Ok(GetFileDiffResponse {
            success: false,
            diff: None,
            error: Some(format!("Failed to get deleted file content: {}", e)),
        }),
    }
}
