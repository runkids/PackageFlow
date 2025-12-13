// Git worktree commands
// Implements US5: Git Worktree Management

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::models::{EditorDefinition, Worktree, WorktreeStatus};
use crate::utils::path_resolver;
use std::collections::HashMap;

/// Response for list_worktrees command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWorktreesResponse {
    pub success: bool,
    pub worktrees: Option<Vec<Worktree>>,
    pub error: Option<String>,
}

/// Response for list_branches command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBranchesResponse {
    pub success: bool,
    pub branches: Option<Vec<String>>,
    pub error: Option<String>,
}

/// Response for add_worktree command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddWorktreeResponse {
    pub success: bool,
    pub worktree: Option<Worktree>,
    pub error: Option<String>,
}

/// Response for get_merged_worktrees command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetMergedWorktreesResponse {
    pub success: bool,
    pub merged_worktrees: Option<Vec<Worktree>>,
    pub base_branch: Option<String>,
    pub error: Option<String>,
}

/// Commit info for sync assistant
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

/// Response for get_behind_commits command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetBehindCommitsResponse {
    pub success: bool,
    pub behind_count: i32,
    pub commits: Option<Vec<CommitInfo>>,
    pub base_branch: Option<String>,
    pub error: Option<String>,
}

/// Response for sync_worktree command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncWorktreeResponse {
    pub success: bool,
    pub method: Option<String>, // "rebase" or "merge"
    pub has_conflicts: bool,
    pub error: Option<String>,
}

/// Response for remove_worktree command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveWorktreeResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for get_worktree_status command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetWorktreeStatusResponse {
    pub success: bool,
    pub status: Option<WorktreeStatus>,
    pub error: Option<String>,
}

/// Response for get_all_worktree_statuses command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAllWorktreeStatusesResponse {
    pub success: bool,
    pub statuses: Option<HashMap<String, WorktreeStatus>>,
    pub error: Option<String>,
}

/// Response for open_in_editor command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenInEditorResponse {
    pub success: bool,
    pub editor: Option<String>,
    pub error: Option<String>,
}

/// Response for get_available_editors command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAvailableEditorsResponse {
    pub success: bool,
    pub editors: Option<Vec<EditorDefinition>>,
    pub default_editor: Option<String>,
    pub error: Option<String>,
}

/// Response for execute_script_in_worktree command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteScriptInWorktreeResponse {
    pub success: bool,
    pub execution_id: Option<String>,
    pub error: Option<String>,
}

/// Execute a git command and return the output
fn exec_git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = path_resolver::create_command("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Parse git worktree list --porcelain output
fn parse_worktree_list_output(output: &str) -> Vec<Worktree> {
    let mut worktrees = Vec::new();
    let entries: Vec<&str> = output.split("\n\n").filter(|s| !s.is_empty()).collect();

    for (index, entry) in entries.iter().enumerate() {
        let lines: Vec<&str> = entry.lines().filter(|s| !s.is_empty()).collect();
        let mut path = String::new();
        let mut head = String::new();
        let mut branch: Option<String> = None;
        let mut is_bare = false;
        let mut is_detached = false;

        for line in lines {
            if let Some(p) = line.strip_prefix("worktree ") {
                path = p.to_string();
            } else if let Some(h) = line.strip_prefix("HEAD ") {
                head = h.to_string();
            } else if let Some(b) = line.strip_prefix("branch ") {
                // refs/heads/main -> main
                branch = Some(b.replace("refs/heads/", ""));
            } else if line == "bare" {
                is_bare = true;
            } else if line == "detached" {
                is_detached = true;
            }
        }

        if !path.is_empty() {
            worktrees.push(Worktree {
                path,
                head,
                branch,
                is_main: index == 0, // First one is main worktree
                is_bare: Some(is_bare),
                is_detached: Some(is_detached),
            });
        }
    }

    worktrees
}

/// Check if a directory is a git repository
#[tauri::command]
pub async fn is_git_repo(project_path: String) -> Result<bool, String> {
    let path = Path::new(&project_path);

    if !path.exists() {
        return Ok(false);
    }

    match exec_git(path, &["rev-parse", "--is-inside-work-tree"]) {
        Ok(output) => Ok(output == "true"),
        Err(_) => Ok(false),
    }
}

/// List local branches
#[tauri::command]
pub async fn list_branches(project_path: String) -> Result<ListBranchesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(ListBranchesResponse {
            success: false,
            branches: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    match exec_git(path, &["branch", "--format=%(refname:short)"]) {
        Ok(output) => {
            let branches: Vec<String> = output
                .lines()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();

            Ok(ListBranchesResponse {
                success: true,
                branches: Some(branches),
                error: None,
            })
        }
        Err(e) => Ok(ListBranchesResponse {
            success: false,
            branches: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

/// List all worktrees
#[tauri::command]
pub async fn list_worktrees(project_path: String) -> Result<ListWorktreesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(ListWorktreesResponse {
            success: false,
            worktrees: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    match exec_git(path, &["worktree", "list", "--porcelain"]) {
        Ok(output) => {
            let worktrees = parse_worktree_list_output(&output);
            Ok(ListWorktreesResponse {
                success: true,
                worktrees: Some(worktrees),
                error: None,
            })
        }
        Err(e) => Ok(ListWorktreesResponse {
            success: false,
            worktrees: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

/// Get worktrees whose branches have been merged into the base branch
#[tauri::command]
pub async fn get_merged_worktrees(
    project_path: String,
    base_branch: Option<String>,
) -> Result<GetMergedWorktreesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(GetMergedWorktreesResponse {
            success: false,
            merged_worktrees: None,
            base_branch: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Determine base branch (main or master)
    let base = base_branch.unwrap_or_else(|| {
        // Check if main exists
        if exec_git(path, &["rev-parse", "--verify", "main"]).is_ok() {
            "main".to_string()
        } else if exec_git(path, &["rev-parse", "--verify", "master"]).is_ok() {
            "master".to_string()
        } else {
            "main".to_string() // Default to main
        }
    });

    // Get list of merged branches
    let merged_output = match exec_git(
        path,
        &["branch", "--merged", &base, "--format=%(refname:short)"],
    ) {
        Ok(output) => output,
        Err(e) => {
            return Ok(GetMergedWorktreesResponse {
                success: false,
                merged_worktrees: None,
                base_branch: Some(base),
                error: Some(format!("GIT_ERROR: {}", e)),
            });
        }
    };

    let merged_branches: Vec<String> = merged_output
        .lines()
        .filter(|s| !s.is_empty())
        .map(|s| s.trim().to_string())
        .collect();

    // Get all worktrees
    let list_result = list_worktrees(project_path).await?;
    if !list_result.success {
        return Ok(GetMergedWorktreesResponse {
            success: false,
            merged_worktrees: None,
            base_branch: Some(base),
            error: list_result.error,
        });
    }

    let worktrees = list_result.worktrees.unwrap_or_default();

    // Filter worktrees whose branches are merged (excluding main worktree and base branch itself)
    let merged_worktrees: Vec<Worktree> = worktrees
        .into_iter()
        .filter(|w| {
            // Skip main worktree
            if w.is_main {
                return false;
            }
            // Skip if no branch (detached HEAD)
            let branch = match &w.branch {
                Some(b) => b,
                None => return false,
            };
            // Skip base branch itself
            if branch == &base {
                return false;
            }
            // Check if branch is in merged list
            merged_branches.contains(branch)
        })
        .collect();

    Ok(GetMergedWorktreesResponse {
        success: true,
        merged_worktrees: Some(merged_worktrees),
        base_branch: Some(base),
        error: None,
    })
}

/// Get commits that the worktree is behind compared to base branch
#[tauri::command]
pub async fn get_behind_commits(
    worktree_path: String,
    base_branch: Option<String>,
    limit: Option<i32>,
) -> Result<GetBehindCommitsResponse, String> {
    let path = Path::new(&worktree_path);

    // Check if path exists
    if !path.exists() {
        return Ok(GetBehindCommitsResponse {
            success: false,
            behind_count: 0,
            commits: None,
            base_branch: None,
            error: Some("PATH_NOT_FOUND".to_string()),
        });
    }

    // Check if it's a valid git worktree
    if exec_git(path, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(GetBehindCommitsResponse {
            success: false,
            behind_count: 0,
            commits: None,
            base_branch: None,
            error: Some("NOT_A_WORKTREE".to_string()),
        });
    }

    // Determine base branch (main or master)
    let base = base_branch.unwrap_or_else(|| {
        // Try to get the default branch from remote
        if let Ok(output) = exec_git(path, &["symbolic-ref", "refs/remotes/origin/HEAD"]) {
            if let Some(branch) = output.strip_prefix("refs/remotes/origin/") {
                return branch.to_string();
            }
        }
        // Fallback: check if main or master exists
        if exec_git(path, &["rev-parse", "--verify", "origin/main"]).is_ok() {
            "origin/main".to_string()
        } else if exec_git(path, &["rev-parse", "--verify", "origin/master"]).is_ok() {
            "origin/master".to_string()
        } else if exec_git(path, &["rev-parse", "--verify", "main"]).is_ok() {
            "main".to_string()
        } else {
            "master".to_string()
        }
    });

    // Get the count of commits behind
    let behind_count = match exec_git(path, &["rev-list", "--count", &format!("HEAD..{}", base)]) {
        Ok(output) => output.trim().parse().unwrap_or(0),
        Err(_) => 0,
    };

    if behind_count == 0 {
        return Ok(GetBehindCommitsResponse {
            success: true,
            behind_count: 0,
            commits: Some(vec![]),
            base_branch: Some(base),
            error: None,
        });
    }

    // Get the actual commits (limited)
    let max_commits = limit.unwrap_or(10).min(50);
    let format = "--format=%H|%h|%s|%an|%ci";
    let range = format!("HEAD..{}", base);

    let commits = match exec_git(path, &["log", format, &format!("-{}", max_commits), &range]) {
        Ok(output) => output
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.splitn(5, '|').collect();
                CommitInfo {
                    hash: parts.get(0).unwrap_or(&"").to_string(),
                    short_hash: parts.get(1).unwrap_or(&"").to_string(),
                    message: parts.get(2).unwrap_or(&"").to_string(),
                    author: parts.get(3).unwrap_or(&"").to_string(),
                    date: parts.get(4).unwrap_or(&"").to_string(),
                }
            })
            .collect(),
        Err(e) => {
            return Ok(GetBehindCommitsResponse {
                success: false,
                behind_count,
                commits: None,
                base_branch: Some(base),
                error: Some(format!("GIT_ERROR: {}", e)),
            });
        }
    };

    Ok(GetBehindCommitsResponse {
        success: true,
        behind_count,
        commits: Some(commits),
        base_branch: Some(base),
        error: None,
    })
}

/// Sync worktree with base branch using rebase or merge
#[tauri::command]
pub async fn sync_worktree(
    worktree_path: String,
    base_branch: String,
    method: String, // "rebase" or "merge"
) -> Result<SyncWorktreeResponse, String> {
    let path = Path::new(&worktree_path);

    // Check if path exists
    if !path.exists() {
        return Ok(SyncWorktreeResponse {
            success: false,
            method: Some(method),
            has_conflicts: false,
            error: Some("PATH_NOT_FOUND".to_string()),
        });
    }

    // Check if it's a valid git worktree
    if exec_git(path, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(SyncWorktreeResponse {
            success: false,
            method: Some(method),
            has_conflicts: false,
            error: Some("NOT_A_WORKTREE".to_string()),
        });
    }

    // Check for uncommitted changes
    if let Ok(status) = exec_git(path, &["status", "--porcelain"]) {
        if !status.is_empty() {
            return Ok(SyncWorktreeResponse {
                success: false,
                method: Some(method),
                has_conflicts: false,
                error: Some("HAS_UNCOMMITTED_CHANGES".to_string()),
            });
        }
    }

    // Perform the sync operation
    let result = match method.as_str() {
        "rebase" => exec_git(path, &["rebase", &base_branch]),
        "merge" => exec_git(path, &["merge", &base_branch, "--no-edit"]),
        _ => {
            return Ok(SyncWorktreeResponse {
                success: false,
                method: Some(method),
                has_conflicts: false,
                error: Some("INVALID_METHOD".to_string()),
            });
        }
    };

    match result {
        Ok(_) => Ok(SyncWorktreeResponse {
            success: true,
            method: Some(method),
            has_conflicts: false,
            error: None,
        }),
        Err(e) => {
            // Check if it's a conflict
            let has_conflicts = e.contains("CONFLICT") || e.contains("conflict");

            // If there are conflicts, abort the operation
            if has_conflicts {
                match method.as_str() {
                    "rebase" => {
                        let _ = exec_git(path, &["rebase", "--abort"]);
                    }
                    "merge" => {
                        let _ = exec_git(path, &["merge", "--abort"]);
                    }
                    _ => {}
                }
            }

            Ok(SyncWorktreeResponse {
                success: false,
                method: Some(method),
                has_conflicts,
                error: Some(if has_conflicts {
                    "CONFLICT".to_string()
                } else {
                    format!("GIT_ERROR: {}", e)
                }),
            })
        }
    }
}

/// Add a new worktree
#[tauri::command]
pub async fn add_worktree(
    project_path: String,
    worktree_path: String,
    branch: String,
    create_branch: bool,
) -> Result<AddWorktreeResponse, String> {
    let path = Path::new(&project_path);
    let wt_path = Path::new(&worktree_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(AddWorktreeResponse {
            success: false,
            worktree: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Check if worktree path already exists
    if wt_path.exists() {
        return Ok(AddWorktreeResponse {
            success: false,
            worktree: None,
            error: Some("PATH_EXISTS".to_string()),
        });
    }

    // Validate branch
    if create_branch {
        // Check if branch already exists (should not exist for new branch)
        if exec_git(path, &["rev-parse", "--verify", &branch]).is_ok() {
            return Ok(AddWorktreeResponse {
                success: false,
                worktree: None,
                error: Some("BRANCH_EXISTS".to_string()),
            });
        }
    } else {
        // Check if branch exists (should exist for existing branch)
        if exec_git(path, &["rev-parse", "--verify", &branch]).is_err() {
            return Ok(AddWorktreeResponse {
                success: false,
                worktree: None,
                error: Some("BRANCH_NOT_FOUND".to_string()),
            });
        }
    }

    // Build git worktree add command
    let result = if create_branch {
        exec_git(path, &["worktree", "add", "-b", &branch, &worktree_path])
    } else {
        exec_git(path, &["worktree", "add", &worktree_path, &branch])
    };

    match result {
        Ok(_) => {
            // Get the newly created worktree info
            let list_result = list_worktrees(project_path).await?;
            if let Some(worktrees) = list_result.worktrees {
                // Find the new worktree by path
                let resolved_path = wt_path
                    .canonicalize()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| worktree_path.clone());

                let new_worktree = worktrees
                    .into_iter()
                    .find(|w| w.path == worktree_path || w.path == resolved_path);

                if let Some(wt) = new_worktree {
                    return Ok(AddWorktreeResponse {
                        success: true,
                        worktree: Some(wt),
                        error: None,
                    });
                }
            }

            // Fallback: return basic info
            Ok(AddWorktreeResponse {
                success: true,
                worktree: Some(Worktree {
                    path: worktree_path,
                    branch: Some(branch),
                    head: String::new(),
                    is_main: false,
                    is_bare: Some(false),
                    is_detached: Some(false),
                }),
                error: None,
            })
        }
        Err(e) => Ok(AddWorktreeResponse {
            success: false,
            worktree: None,
            error: Some(format!("GIT_ERROR: {}", e)),
        }),
    }
}

/// Remove a worktree
#[tauri::command]
pub async fn remove_worktree(
    project_path: String,
    worktree_path: String,
    force: bool,
    delete_branch: Option<bool>,
) -> Result<RemoveWorktreeResponse, String> {
    let path = Path::new(&project_path);
    let wt_path = Path::new(&worktree_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(RemoveWorktreeResponse {
            success: false,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Get list of worktrees to validate
    let list_result = list_worktrees(project_path.clone()).await?;
    if !list_result.success {
        return Ok(RemoveWorktreeResponse {
            success: false,
            error: Some("GIT_ERROR".to_string()),
        });
    }

    let worktrees = list_result.worktrees.unwrap_or_default();

    // Find the worktree to remove
    let resolved_path = wt_path
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| worktree_path.clone());

    let worktree = worktrees
        .iter()
        .find(|w| w.path == worktree_path || w.path == resolved_path);

    match worktree {
        None => Ok(RemoveWorktreeResponse {
            success: false,
            error: Some("WORKTREE_NOT_FOUND".to_string()),
        }),
        Some(wt) if wt.is_main => Ok(RemoveWorktreeResponse {
            success: false,
            error: Some("CANNOT_REMOVE_MAIN".to_string()),
        }),
        Some(wt) => {
            // Store branch name before removing worktree (if we need to delete it)
            let branch_to_delete = if delete_branch.unwrap_or(false) {
                wt.branch.clone()
            } else {
                None
            };

            // Build git worktree remove command
            let result = if force {
                exec_git(path, &["worktree", "remove", "--force", &worktree_path])
            } else {
                exec_git(path, &["worktree", "remove", &worktree_path])
            };

            match result {
                Ok(_) => {
                    // If worktree removed successfully and delete_branch is true, delete the branch
                    if let Some(branch) = branch_to_delete {
                        // Use -D to force delete (branch might not be fully merged)
                        let delete_result = exec_git(path, &["branch", "-D", &branch]);
                        if let Err(e) = delete_result {
                            // Log but don't fail - worktree was already removed
                            eprintln!("Warning: Failed to delete branch '{}': {}", branch, e);
                        }
                    }
                    Ok(RemoveWorktreeResponse {
                        success: true,
                        error: None,
                    })
                }
                Err(e) => {
                    // Check for uncommitted changes error
                    if e.contains("modified or untracked files") {
                        Ok(RemoveWorktreeResponse {
                            success: false,
                            error: Some("HAS_UNCOMMITTED_CHANGES".to_string()),
                        })
                    } else {
                        Ok(RemoveWorktreeResponse {
                            success: false,
                            error: Some(format!("GIT_ERROR: {}", e)),
                        })
                    }
                }
            }
        }
    }
}

// ============================================================================
// Enhanced Worktree Management (001-worktree-enhancements)
// ============================================================================

/// T006: Get count of uncommitted changes in a worktree
fn get_uncommitted_count(path: &Path) -> Result<i32, String> {
    match exec_git(path, &["status", "--porcelain"]) {
        Ok(output) => {
            let count = output.lines().filter(|s| !s.is_empty()).count() as i32;
            Ok(count)
        }
        Err(e) => Err(format!("GIT_ERROR: {}", e)),
    }
}

/// T007: Get ahead/behind commits compared to tracking branch
fn get_ahead_behind(path: &Path) -> Result<(i32, i32, bool), String> {
    // First check if tracking branch exists
    let has_tracking = exec_git(path, &["rev-parse", "--verify", "@{u}"]).is_ok();

    if !has_tracking {
        return Ok((0, 0, false));
    }

    match exec_git(
        path,
        &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
    ) {
        Ok(output) => {
            let parts: Vec<&str> = output.split('\t').collect();
            if parts.len() == 2 {
                let behind = parts[0].trim().parse().unwrap_or(0);
                let ahead = parts[1].trim().parse().unwrap_or(0);
                Ok((ahead, behind, true))
            } else {
                Ok((0, 0, true))
            }
        }
        Err(_) => Ok((0, 0, false)),
    }
}

/// T008: Get last commit information
fn get_last_commit_info(path: &Path) -> Result<(Option<String>, Option<String>), String> {
    // Check if HEAD exists
    if exec_git(path, &["rev-parse", "HEAD"]).is_err() {
        return Ok((None, None));
    }

    let time = exec_git(path, &["log", "-1", "--format=%cI", "HEAD"]).ok();
    let message = exec_git(path, &["log", "-1", "--format=%s", "HEAD"])
        .ok()
        .map(|s| {
            // Truncate message if too long
            if s.len() > 50 {
                format!("{}...", &s[..47])
            } else {
                s
            }
        });

    Ok((time, message))
}

/// T009: Get status for a single worktree
#[tauri::command]
pub async fn get_worktree_status(
    worktree_path: String,
) -> Result<GetWorktreeStatusResponse, String> {
    let path = Path::new(&worktree_path);

    // Check if path exists
    if !path.exists() {
        return Ok(GetWorktreeStatusResponse {
            success: false,
            status: None,
            error: Some("PATH_NOT_FOUND".to_string()),
        });
    }

    // Check if it's a valid git worktree
    if exec_git(path, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(GetWorktreeStatusResponse {
            success: false,
            status: None,
            error: Some("NOT_A_WORKTREE".to_string()),
        });
    }

    // Get status information
    let uncommitted_count = get_uncommitted_count(path).unwrap_or(0);
    let (ahead, behind, has_tracking_branch) = get_ahead_behind(path).unwrap_or((0, 0, false));
    let (last_commit_time, last_commit_message) =
        get_last_commit_info(path).unwrap_or((None, None));

    Ok(GetWorktreeStatusResponse {
        success: true,
        status: Some(WorktreeStatus {
            uncommitted_count,
            ahead,
            behind,
            has_tracking_branch,
            last_commit_time,
            last_commit_message,
            has_running_process: false, // This will be determined by frontend
        }),
        error: None,
    })
}

/// T010: Get status for all worktrees in a project
#[tauri::command]
pub async fn get_all_worktree_statuses(
    project_path: String,
) -> Result<GetAllWorktreeStatusesResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(GetAllWorktreeStatusesResponse {
            success: false,
            statuses: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Get all worktrees
    let list_result = list_worktrees(project_path).await?;
    if !list_result.success {
        return Ok(GetAllWorktreeStatusesResponse {
            success: false,
            statuses: None,
            error: list_result.error,
        });
    }

    let worktrees = list_result.worktrees.unwrap_or_default();
    let mut statuses: HashMap<String, WorktreeStatus> = HashMap::new();

    for worktree in worktrees {
        let wt_path = Path::new(&worktree.path);

        if wt_path.exists() {
            let uncommitted_count = get_uncommitted_count(wt_path).unwrap_or(0);
            let (ahead, behind, has_tracking_branch) =
                get_ahead_behind(wt_path).unwrap_or((0, 0, false));
            let (last_commit_time, last_commit_message) =
                get_last_commit_info(wt_path).unwrap_or((None, None));

            statuses.insert(
                worktree.path.clone(),
                WorktreeStatus {
                    uncommitted_count,
                    ahead,
                    behind,
                    has_tracking_branch,
                    last_commit_time,
                    last_commit_message,
                    has_running_process: false,
                },
            );
        }
    }

    Ok(GetAllWorktreeStatusesResponse {
        success: true,
        statuses: Some(statuses),
        error: None,
    })
}

/// T014: Execute a script in a specific worktree context
/// Note: This leverages the existing script execution infrastructure
/// by simply changing the working directory
#[tauri::command]
pub async fn execute_script_in_worktree(
    worktree_path: String,
    script_name: String,
    package_manager: String,
) -> Result<ExecuteScriptInWorktreeResponse, String> {
    let path = Path::new(&worktree_path);

    // Validate worktree path exists
    if !path.exists() {
        return Ok(ExecuteScriptInWorktreeResponse {
            success: false,
            execution_id: None,
            error: Some("PATH_NOT_FOUND".to_string()),
        });
    }

    // Check if it's a valid git worktree
    if exec_git(path, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(ExecuteScriptInWorktreeResponse {
            success: false,
            execution_id: None,
            error: Some("NOT_A_WORKTREE".to_string()),
        });
    }

    // Check if package.json exists
    let package_json = path.join("package.json");
    if !package_json.exists() {
        return Ok(ExecuteScriptInWorktreeResponse {
            success: false,
            execution_id: None,
            error: Some("NO_PACKAGE_JSON".to_string()),
        });
    }

    // Generate a unique execution ID
    let execution_id = uuid::Uuid::new_v4().to_string();

    // Note: The actual script execution will be handled by the existing
    // execute_script command. This command just validates and prepares
    // the execution context. The frontend will call execute_script with
    // the worktree path as the cwd.

    Ok(ExecuteScriptInWorktreeResponse {
        success: true,
        execution_id: Some(execution_id),
        error: None,
    })
}

// ============================================================================
// Editor Integration Commands (US3)
// ============================================================================

/// T031: Check if an editor command is available on the system
fn check_editor_available(command: &str) -> bool {
    // Use path_resolver to find the command (handles macOS GUI app PATH issues)
    if path_resolver::find_tool(command).is_some() {
        return true;
    }

    // On macOS, also check for .app bundles in /Applications
    #[cfg(target_os = "macos")]
    {
        // Map CLI commands to app bundle names
        let app_name = match command {
            "code" => Some("Visual Studio Code.app"),
            "code-insiders" => Some("Visual Studio Code - Insiders.app"),
            "cursor" => Some("Cursor.app"),
            "zed" => Some("Zed.app"),
            "subl" => Some("Sublime Text.app"),
            "webstorm" => Some("WebStorm.app"),
            "idea" => Some("IntelliJ IDEA.app"),
            "pycharm" => Some("PyCharm.app"),
            "goland" => Some("GoLand.app"),
            "rustrover" => Some("RustRover.app"),
            "fleet" => Some("Fleet.app"),
            "studio" => Some("Android Studio.app"),
            "nova" => Some("Nova.app"),
            "bbedit" => Some("BBEdit.app"),
            "mate" => Some("TextMate.app"),
            "windsurf" => Some("Windsurf.app"),
            "positron" => Some("Positron.app"),
            _ => None,
        };

        if let Some(name) = app_name {
            let app_paths = [
                format!("/Applications/{}", name),
                format!(
                    "{}/Applications/{}",
                    path_resolver::get_home_dir().unwrap_or_default(),
                    name
                ),
            ];
            for path in &app_paths {
                if std::path::Path::new(path).exists() {
                    return true;
                }
            }
        }

        // Check for JetBrains Toolbox managed apps
        if matches!(
            command,
            "webstorm" | "idea" | "pycharm" | "goland" | "rustrover" | "fleet"
        ) {
            let toolbox_base = format!(
                "{}/Library/Application Support/JetBrains/Toolbox/apps",
                path_resolver::get_home_dir().unwrap_or_default()
            );
            if std::path::Path::new(&toolbox_base).exists() {
                // Check if any version of the app exists
                let app_folder = match command {
                    "webstorm" => "WebStorm",
                    "idea" => "IDEA-U", // Ultimate, also check IDEA-C for Community
                    "pycharm" => "PyCharm-P", // Professional, also check PyCharm-C for Community
                    "goland" => "GoLand",
                    "rustrover" => "RustRover",
                    "fleet" => "Fleet",
                    _ => return false,
                };
                let app_path = format!("{}/{}", toolbox_base, app_folder);
                if std::path::Path::new(&app_path).exists() {
                    return true;
                }
                // Also check Community editions
                if command == "idea" {
                    let community_path = format!("{}/IDEA-C", toolbox_base);
                    if std::path::Path::new(&community_path).exists() {
                        return true;
                    }
                }
                if command == "pycharm" {
                    let community_path = format!("{}/PyCharm-C", toolbox_base);
                    if std::path::Path::new(&community_path).exists() {
                        return true;
                    }
                }
            }
        }
    }

    false
}

/// Get editor CLI command and app bundle name for an editor ID
fn get_editor_info(editor_id: &str) -> Option<(&'static str, Option<&'static str>)> {
    // Returns (cli_command, optional_app_bundle_name)
    match editor_id {
        "vscode" => Some(("code", Some("Visual Studio Code"))),
        "vscode-insiders" => Some(("code-insiders", Some("Visual Studio Code - Insiders"))),
        "cursor" => Some(("cursor", Some("Cursor"))),
        "zed" => Some(("zed", Some("Zed"))),
        "sublime" => Some(("subl", Some("Sublime Text"))),
        "webstorm" => Some(("webstorm", Some("WebStorm"))),
        "intellij" => Some(("idea", Some("IntelliJ IDEA"))),
        "pycharm" => Some(("pycharm", Some("PyCharm"))),
        "goland" => Some(("goland", Some("GoLand"))),
        "rustrover" => Some(("rustrover", Some("RustRover"))),
        "fleet" => Some(("fleet", Some("Fleet"))),
        "neovim" => Some(("nvim", None)),
        "vim" => Some(("vim", None)),
        "emacs" => Some(("emacs", None)),
        "android-studio" => Some(("studio", Some("Android Studio"))),
        "xcode" => Some(("xed", Some("Xcode"))),
        "nova" => Some(("nova", Some("Nova"))),
        "bbedit" => Some(("bbedit", Some("BBEdit"))),
        "textmate" => Some(("mate", Some("TextMate"))),
        "windsurf" => Some(("windsurf", Some("Windsurf"))),
        "positron" => Some(("positron", Some("Positron"))),
        _ => None,
    }
}

/// T032: Open a directory in the specified editor
#[tauri::command]
pub async fn open_in_editor(
    worktree_path: String,
    editor_id: Option<String>,
) -> Result<OpenInEditorResponse, String> {
    let path = Path::new(&worktree_path);

    // Validate path exists
    if !path.exists() {
        return Ok(OpenInEditorResponse {
            success: false,
            editor: None,
            error: Some("PATH_NOT_FOUND".to_string()),
        });
    }

    // Determine which editor to use
    let editor = editor_id.unwrap_or_else(|| "vscode".to_string());

    // Get editor info
    let (command, app_name) = match get_editor_info(&editor) {
        Some(info) => info,
        None => {
            return Ok(OpenInEditorResponse {
                success: false,
                editor: Some(editor),
                error: Some("UNKNOWN_EDITOR".to_string()),
            });
        }
    };

    // Check if editor is available
    if !check_editor_available(command) {
        return Ok(OpenInEditorResponse {
            success: false,
            editor: Some(editor),
            error: Some("EDITOR_NOT_FOUND".to_string()),
        });
    }

    // Try CLI command first
    if path_resolver::find_tool(command).is_some() {
        match path_resolver::create_command(command)
            .arg(&worktree_path)
            .spawn()
        {
            Ok(_) => {
                return Ok(OpenInEditorResponse {
                    success: true,
                    editor: Some(editor),
                    error: None,
                });
            }
            Err(_) => {
                // Fall through to try macOS open command
            }
        }
    }

    // On macOS, try using `open -a` for apps without CLI
    #[cfg(target_os = "macos")]
    if let Some(name) = app_name {
        match std::process::Command::new("open")
            .args(["-a", name, &worktree_path])
            .spawn()
        {
            Ok(_) => {
                return Ok(OpenInEditorResponse {
                    success: true,
                    editor: Some(editor),
                    error: None,
                });
            }
            Err(e) => {
                return Ok(OpenInEditorResponse {
                    success: false,
                    editor: Some(editor),
                    error: Some(format!("Failed to open editor: {}", e)),
                });
            }
        }
    }

    Ok(OpenInEditorResponse {
        success: false,
        editor: Some(editor),
        error: Some("Failed to open editor".to_string()),
    })
}

/// T033: Get list of available editors on the system
#[tauri::command]
pub async fn get_available_editors() -> Result<GetAvailableEditorsResponse, String> {
    let mut editors: Vec<EditorDefinition> = Vec::new();
    let mut default_editor: Option<String> = None;

    // Check VS Code
    let mut vscode = EditorDefinition::vscode();
    vscode.is_available = check_editor_available("code");
    if vscode.is_available && default_editor.is_none() {
        default_editor = Some(vscode.id.clone());
    }
    editors.push(vscode);

    // Check Cursor
    let mut cursor = EditorDefinition::cursor();
    cursor.is_available = check_editor_available("cursor");
    if cursor.is_available && default_editor.is_none() {
        default_editor = Some(cursor.id.clone());
    }
    editors.push(cursor);

    // Check VS Code Insiders
    let mut vscode_insiders = EditorDefinition::vscode_insiders();
    vscode_insiders.is_available = check_editor_available("code-insiders");
    editors.push(vscode_insiders);

    // Check Zed
    let mut zed = EditorDefinition {
        id: "zed".to_string(),
        name: "Zed".to_string(),
        command: "zed".to_string(),
        args: vec![],
        is_available: check_editor_available("zed"),
    };
    editors.push(zed);

    // Check Sublime Text
    let mut sublime = EditorDefinition {
        id: "sublime".to_string(),
        name: "Sublime Text".to_string(),
        command: "subl".to_string(),
        args: vec![],
        is_available: check_editor_available("subl"),
    };
    editors.push(sublime);

    // Check WebStorm
    let mut webstorm = EditorDefinition {
        id: "webstorm".to_string(),
        name: "WebStorm".to_string(),
        command: "webstorm".to_string(),
        args: vec![],
        is_available: check_editor_available("webstorm"),
    };
    editors.push(webstorm);

    // Check IntelliJ IDEA
    let intellij = EditorDefinition {
        id: "intellij".to_string(),
        name: "IntelliJ IDEA".to_string(),
        command: "idea".to_string(),
        args: vec![],
        is_available: check_editor_available("idea"),
    };
    editors.push(intellij);

    // Check PyCharm
    let pycharm = EditorDefinition {
        id: "pycharm".to_string(),
        name: "PyCharm".to_string(),
        command: "pycharm".to_string(),
        args: vec![],
        is_available: check_editor_available("pycharm"),
    };
    editors.push(pycharm);

    // Check GoLand
    let goland = EditorDefinition {
        id: "goland".to_string(),
        name: "GoLand".to_string(),
        command: "goland".to_string(),
        args: vec![],
        is_available: check_editor_available("goland"),
    };
    editors.push(goland);

    // Check RustRover
    let rustrover = EditorDefinition {
        id: "rustrover".to_string(),
        name: "RustRover".to_string(),
        command: "rustrover".to_string(),
        args: vec![],
        is_available: check_editor_available("rustrover"),
    };
    editors.push(rustrover);

    // Check Fleet (JetBrains)
    let fleet = EditorDefinition {
        id: "fleet".to_string(),
        name: "Fleet".to_string(),
        command: "fleet".to_string(),
        args: vec![],
        is_available: check_editor_available("fleet"),
    };
    editors.push(fleet);

    // Check Neovim
    let neovim = EditorDefinition {
        id: "neovim".to_string(),
        name: "Neovim".to_string(),
        command: "nvim".to_string(),
        args: vec![],
        is_available: check_editor_available("nvim"),
    };
    editors.push(neovim);

    // Check Vim
    let vim = EditorDefinition {
        id: "vim".to_string(),
        name: "Vim".to_string(),
        command: "vim".to_string(),
        args: vec![],
        is_available: check_editor_available("vim"),
    };
    editors.push(vim);

    // Check Emacs
    let emacs = EditorDefinition {
        id: "emacs".to_string(),
        name: "Emacs".to_string(),
        command: "emacs".to_string(),
        args: vec![],
        is_available: check_editor_available("emacs"),
    };
    editors.push(emacs);

    // Check Android Studio
    let android_studio = EditorDefinition {
        id: "android-studio".to_string(),
        name: "Android Studio".to_string(),
        command: "studio".to_string(),
        args: vec![],
        is_available: check_editor_available("studio"),
    };
    editors.push(android_studio);

    // macOS specific editors
    #[cfg(target_os = "macos")]
    {
        // Check Xcode
        let xcode = EditorDefinition {
            id: "xcode".to_string(),
            name: "Xcode".to_string(),
            command: "xed".to_string(),
            args: vec![],
            is_available: check_editor_available("xed"),
        };
        editors.push(xcode);

        // Check Nova (Panic)
        let nova = EditorDefinition {
            id: "nova".to_string(),
            name: "Nova".to_string(),
            command: "nova".to_string(),
            args: vec![],
            is_available: check_editor_available("nova"),
        };
        editors.push(nova);

        // Check BBEdit
        let bbedit = EditorDefinition {
            id: "bbedit".to_string(),
            name: "BBEdit".to_string(),
            command: "bbedit".to_string(),
            args: vec![],
            is_available: check_editor_available("bbedit"),
        };
        editors.push(bbedit);

        // Check TextMate
        let textmate = EditorDefinition {
            id: "textmate".to_string(),
            name: "TextMate".to_string(),
            command: "mate".to_string(),
            args: vec![],
            is_available: check_editor_available("mate"),
        };
        editors.push(textmate);
    }

    // Check Windsurf (Codeium)
    let windsurf = EditorDefinition {
        id: "windsurf".to_string(),
        name: "Windsurf".to_string(),
        command: "windsurf".to_string(),
        args: vec![],
        is_available: check_editor_available("windsurf"),
    };
    editors.push(windsurf);

    // Check Positron (Posit)
    let positron = EditorDefinition {
        id: "positron".to_string(),
        name: "Positron".to_string(),
        command: "positron".to_string(),
        args: vec![],
        is_available: check_editor_available("positron"),
    };
    editors.push(positron);

    Ok(GetAvailableEditorsResponse {
        success: true,
        editors: Some(editors),
        default_editor,
        error: None,
    })
}

// ============================================================================
// Worktree Template Commands (US5)
// ============================================================================

use crate::models::WorktreeTemplate;
use tauri_plugin_store::StoreExt;

/// Response for template save operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTemplateResponse {
    pub success: bool,
    pub template: Option<WorktreeTemplate>,
    pub error: Option<String>,
}

/// Response for template delete operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTemplateResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Response for list templates operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTemplatesResponse {
    pub success: bool,
    pub templates: Option<Vec<WorktreeTemplate>>,
    pub error: Option<String>,
}

/// Response for create worktree from template
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreeFromTemplateResponse {
    pub success: bool,
    pub worktree: Option<Worktree>,
    pub executed_scripts: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_file_path: Option<String>,
    pub error: Option<String>,
}

const TEMPLATES_STORE_KEY: &str = "worktree_templates";

/// T049: Save a worktree template
#[tauri::command]
pub async fn save_worktree_template(
    app: tauri::AppHandle,
    template: WorktreeTemplate,
) -> Result<SaveTemplateResponse, String> {
    let store = app
        .store("store.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    // Load existing templates
    let mut templates: Vec<WorktreeTemplate> = store
        .get(TEMPLATES_STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Update or add template
    let mut updated_template = template.clone();
    if let Some(existing) = templates.iter_mut().find(|t| t.id == template.id) {
        updated_template.updated_at = Some(chrono::Utc::now().to_rfc3339());
        *existing = updated_template.clone();
    } else {
        templates.push(updated_template.clone());
    }

    // Save back to store
    store.set(
        TEMPLATES_STORE_KEY.to_string(),
        serde_json::to_value(&templates).map_err(|e| format!("Serialization error: {}", e))?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(SaveTemplateResponse {
        success: true,
        template: Some(updated_template),
        error: None,
    })
}

/// T049: Delete a worktree template
#[tauri::command]
pub async fn delete_worktree_template(
    app: tauri::AppHandle,
    template_id: String,
) -> Result<DeleteTemplateResponse, String> {
    let store = app
        .store("store.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    // Load existing templates
    let mut templates: Vec<WorktreeTemplate> = store
        .get(TEMPLATES_STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Find and remove template
    let initial_len = templates.len();
    templates.retain(|t| t.id != template_id);

    if templates.len() == initial_len {
        return Ok(DeleteTemplateResponse {
            success: false,
            error: Some("TEMPLATE_NOT_FOUND".to_string()),
        });
    }

    // Save back to store
    store.set(
        TEMPLATES_STORE_KEY.to_string(),
        serde_json::to_value(&templates).map_err(|e| format!("Serialization error: {}", e))?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(DeleteTemplateResponse {
        success: true,
        error: None,
    })
}

/// T049: List all saved worktree templates
#[tauri::command]
pub async fn list_worktree_templates(
    app: tauri::AppHandle,
) -> Result<ListTemplatesResponse, String> {
    let store = app
        .store("store.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let templates: Vec<WorktreeTemplate> = store
        .get(TEMPLATES_STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(ListTemplatesResponse {
        success: true,
        templates: Some(templates),
        error: None,
    })
}

/// Get default template presets
#[tauri::command]
pub async fn get_default_worktree_templates() -> Result<ListTemplatesResponse, String> {
    let templates = vec![
        WorktreeTemplate::feature_template(),
        WorktreeTemplate::bugfix_template(),
        WorktreeTemplate::release_template(),
        WorktreeTemplate::speckit_feature_template(),
    ];

    Ok(ListTemplatesResponse {
        success: true,
        templates: Some(templates),
        error: None,
    })
}

fn extract_feature_number(candidate: &str) -> Option<u32> {
    let leaf = candidate.rsplit('/').next().unwrap_or(candidate).trim();
    if leaf.len() < 4 {
        return None;
    }
    let bytes = leaf.as_bytes();
    if !bytes[0].is_ascii_digit()
        || !bytes[1].is_ascii_digit()
        || !bytes[2].is_ascii_digit()
        || bytes[3] != b'-'
    {
        return None;
    }
    let num_str = &leaf[0..3];
    num_str.parse::<u32>().ok()
}

fn get_highest_feature_number_from_specs(specs_dir: &Path) -> u32 {
    let mut highest = 0u32;
    let entries = match std::fs::read_dir(specs_dir) {
        Ok(entries) => entries,
        Err(_) => return 0,
    };

    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else {
            continue;
        };
        if let Some(num) = extract_feature_number(name_str) {
            highest = highest.max(num);
        }
    }

    highest
}

fn compute_next_feature_number(repo_path: &Path) -> u32 {
    let mut highest = 0u32;

    if let Ok(output) = exec_git(repo_path, &["branch", "-a", "--format=%(refname:short)"]) {
        for line in output.lines() {
            if let Some(num) = extract_feature_number(line) {
                highest = highest.max(num);
            }
        }
    }

    let specs_dir = repo_path.join("specs");
    if specs_dir.exists() {
        highest = highest.max(get_highest_feature_number_from_specs(&specs_dir));
    }

    highest + 1
}

/// Response for get_next_feature_number command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetNextFeatureNumberResponse {
    pub success: bool,
    pub feature_number: Option<String>,
    pub error: Option<String>,
}

/// Get the next available SpecKit-style feature number (e.g. "015")
#[tauri::command]
pub async fn get_next_feature_number(
    project_path: String,
) -> Result<GetNextFeatureNumberResponse, String> {
    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(GetNextFeatureNumberResponse {
            success: false,
            feature_number: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    let next = compute_next_feature_number(path);
    Ok(GetNextFeatureNumberResponse {
        success: true,
        feature_number: Some(format!("{:03}", next)),
        error: None,
    })
}

// ============================================================================
// Gitignore Management Commands
// ============================================================================

/// Response for check_gitignore_has_worktrees command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckGitignoreResponse {
    pub success: bool,
    pub has_worktrees_entry: bool,
    pub gitignore_exists: bool,
    pub error: Option<String>,
}

/// Response for add_worktrees_to_gitignore command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddToGitignoreResponse {
    pub success: bool,
    pub created_file: bool,
    pub error: Option<String>,
}

/// Check if .gitignore contains .worktrees/ entry
#[tauri::command]
pub async fn check_gitignore_has_worktrees(
    project_path: String,
) -> Result<CheckGitignoreResponse, String> {
    let path = Path::new(&project_path);
    let gitignore_path = path.join(".gitignore");

    // Check if .gitignore exists
    if !gitignore_path.exists() {
        return Ok(CheckGitignoreResponse {
            success: true,
            has_worktrees_entry: false,
            gitignore_exists: false,
            error: None,
        });
    }

    // Read .gitignore content
    let content = std::fs::read_to_string(&gitignore_path)
        .map_err(|e| format!("Failed to read .gitignore: {}", e))?;

    // Check for .worktrees/ entry (various patterns)
    let has_entry = content.lines().any(|line| {
        let trimmed = line.trim();
        trimmed == ".worktrees"
            || trimmed == ".worktrees/"
            || trimmed == ".worktrees/*"
            || trimmed == "/.worktrees"
            || trimmed == "/.worktrees/"
    });

    Ok(CheckGitignoreResponse {
        success: true,
        has_worktrees_entry: has_entry,
        gitignore_exists: true,
        error: None,
    })
}

/// Add .worktrees/ to .gitignore
#[tauri::command]
pub async fn add_worktrees_to_gitignore(
    project_path: String,
) -> Result<AddToGitignoreResponse, String> {
    let path = Path::new(&project_path);
    let gitignore_path = path.join(".gitignore");

    let (content, created_file) = if gitignore_path.exists() {
        let existing = std::fs::read_to_string(&gitignore_path)
            .map_err(|e| format!("Failed to read .gitignore: {}", e))?;
        (existing, false)
    } else {
        (String::new(), true)
    };

    // Check if already has entry
    let has_entry = content.lines().any(|line| {
        let trimmed = line.trim();
        trimmed == ".worktrees"
            || trimmed == ".worktrees/"
            || trimmed == ".worktrees/*"
            || trimmed == "/.worktrees"
            || trimmed == "/.worktrees/"
    });

    if has_entry {
        return Ok(AddToGitignoreResponse {
            success: true,
            created_file: false,
            error: None,
        });
    }

    // Add .worktrees/ to the end of .gitignore
    let new_content = if content.is_empty() {
        "# Worktrees directory\n.worktrees/\n".to_string()
    } else if content.ends_with('\n') {
        format!("{}\n# Worktrees directory\n.worktrees/\n", content)
    } else {
        format!("{}\n\n# Worktrees directory\n.worktrees/\n", content)
    };

    std::fs::write(&gitignore_path, new_content)
        .map_err(|e| format!("Failed to write .gitignore: {}", e))?;

    Ok(AddToGitignoreResponse {
        success: true,
        created_file,
        error: None,
    })
}

/// T050: Create a worktree from a template
#[tauri::command]
pub async fn create_worktree_from_template(
    app: tauri::AppHandle,
    project_path: String,
    template_id: String,
    name: String,
    custom_base_branch: Option<String>,
) -> Result<CreateWorktreeFromTemplateResponse, String> {
    fn clean_branch_suffix(input: &str) -> String {
        let trimmed = input.trim();
        let stripped = if trimmed.len() >= 4 {
            let bytes = trimmed.as_bytes();
            if bytes[0].is_ascii_digit()
                && bytes[1].is_ascii_digit()
                && bytes[2].is_ascii_digit()
                && bytes[3] == b'-'
            {
                &trimmed[4..]
            } else {
                trimmed
            }
        } else {
            trimmed
        };

        let lower = stripped.to_lowercase();
        let mut out = String::with_capacity(lower.len());
        let mut prev_dash = false;
        for ch in lower.chars() {
            let is_alnum = ch.is_ascii_alphanumeric();
            if is_alnum {
                out.push(ch);
                prev_dash = false;
            } else if !prev_dash {
                out.push('-');
                prev_dash = true;
            }
        }
        out.trim_matches('-').to_string()
    }

    fn scaffold_speckit_spec(
        worktree_root: &Path,
        branch_name: &str,
        raw_name: &str,
    ) -> Option<String> {
        let specs_dir = worktree_root.join("specs").join(branch_name);
        if std::fs::create_dir_all(&specs_dir).is_err() {
            return None;
        }

        let spec_file = specs_dir.join("spec.md");
        if spec_file.exists() {
            return Some(spec_file.to_string_lossy().to_string());
        }

        let template_path = worktree_root.join(".specify/templates/spec-template.md");
        let created_date = chrono::Utc::now().format("%Y-%m-%d").to_string();

        let content = match std::fs::read_to_string(&template_path) {
            Ok(template) => template
                .replace("[FEATURE NAME]", raw_name)
                .replace("[###-feature-name]", branch_name)
                .replace("[DATE]", &created_date)
                .replace("$ARGUMENTS", raw_name),
            Err(_) => format!(
                "# Feature Specification: {}\n\n**Feature Branch**: `{}`  \n**Created**: {}  \n**Status**: Draft  \n**Input**: User description: \"{}\"\n",
                raw_name, branch_name, created_date, raw_name
            ),
        };

        if std::fs::write(&spec_file, content).is_err() {
            return None;
        }

        Some(spec_file.to_string_lossy().to_string())
    }

    let path = Path::new(&project_path);

    // Check if git repo
    if !is_git_repo(project_path.clone()).await? {
        return Ok(CreateWorktreeFromTemplateResponse {
            success: false,
            worktree: None,
            executed_scripts: None,
            spec_file_path: None,
            error: Some("NOT_GIT_REPO".to_string()),
        });
    }

    // Load templates (both saved and defaults)
    let store = app
        .store("store.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let mut templates: Vec<WorktreeTemplate> = store
        .get(TEMPLATES_STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Add defaults if not found
    let default_templates = vec![
        WorktreeTemplate::feature_template(),
        WorktreeTemplate::bugfix_template(),
        WorktreeTemplate::release_template(),
        WorktreeTemplate::speckit_feature_template(),
    ];

    for default in default_templates {
        if !templates.iter().any(|t| t.id == default.id) {
            templates.push(default);
        }
    }

    // Find the template
    let template = templates.iter().find(|t| t.id == template_id);
    let template = match template {
        Some(t) => t.clone(),
        None => {
            return Ok(CreateWorktreeFromTemplateResponse {
                success: false,
                worktree: None,
                executed_scripts: None,
                spec_file_path: None,
                error: Some("TEMPLATE_NOT_FOUND".to_string()),
            });
        }
    };

    let is_speckit_template = template.id.starts_with("speckit-");
    let raw_name = name.trim();
    if raw_name.is_empty() {
        return Ok(CreateWorktreeFromTemplateResponse {
            success: false,
            worktree: None,
            executed_scripts: None,
            spec_file_path: None,
            error: Some("INVALID_NAME".to_string()),
        });
    }
    let cleaned_name = if is_speckit_template {
        clean_branch_suffix(raw_name)
    } else {
        raw_name.to_string()
    };
    if cleaned_name.is_empty() {
        return Ok(CreateWorktreeFromTemplateResponse {
            success: false,
            worktree: None,
            executed_scripts: None,
            spec_file_path: None,
            error: Some("INVALID_NAME".to_string()),
        });
    }

    // Get repo name for pattern substitution
    let repo_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("repo")
        .to_string();

    // Apply patterns
    let feature_num =
        if template.branch_pattern.contains("{num}") || template.path_pattern.contains("{num}") {
            Some(format!("{:03}", compute_next_feature_number(path)))
        } else {
            None
        };

    let branch_name =
        WorktreeTemplate::apply_pattern(&template.branch_pattern, &cleaned_name, &repo_name);
    let branch_name = match &feature_num {
        Some(n) => branch_name.replace("{num}", n),
        None => branch_name,
    };

    let worktree_path_pattern =
        WorktreeTemplate::apply_pattern(&template.path_pattern, &cleaned_name, &repo_name);
    let worktree_path_pattern = match &feature_num {
        Some(n) => worktree_path_pattern.replace("{num}", n),
        None => worktree_path_pattern,
    };

    // Resolve worktree path relative to project path
    let worktree_path = if worktree_path_pattern.starts_with("../") {
        path.parent()
            .unwrap_or(path)
            .join(&worktree_path_pattern[3..])
    } else if worktree_path_pattern.starts_with('/') {
        std::path::PathBuf::from(&worktree_path_pattern)
    } else {
        path.join(&worktree_path_pattern)
    };

    let worktree_path_str = worktree_path
        .to_str()
        .ok_or("Invalid worktree path")?
        .to_string();

    // Determine base branch
    let base_branch = custom_base_branch
        .or(template.base_branch.clone())
        .unwrap_or_else(|| "main".to_string());

    // Checkout the base branch first to ensure we're creating from it
    let _ = exec_git(path, &["checkout", &base_branch]);

    // Create the worktree
    let add_result = add_worktree(
        project_path.clone(),
        worktree_path_str.clone(),
        branch_name.clone(),
        true, // create_branch
    )
    .await?;

    if !add_result.success {
        return Ok(CreateWorktreeFromTemplateResponse {
            success: false,
            worktree: None,
            executed_scripts: None,
            spec_file_path: None,
            error: add_result.error,
        });
    }

    let spec_file_path = if is_speckit_template {
        scaffold_speckit_spec(Path::new(&worktree_path_str), &branch_name, raw_name)
    } else {
        None
    };

    // Execute post-create scripts if any
    let mut executed_scripts: Vec<String> = Vec::new();
    let wt_path = Path::new(&worktree_path_str);

    println!(
        "[Worktree] Template post_create_scripts: {:?}",
        template.post_create_scripts
    );
    println!("[Worktree] Worktree path: {}", worktree_path_str);
    println!(
        "[Worktree] package.json exists: {}",
        wt_path.join("package.json").exists()
    );

    for script in &template.post_create_scripts {
        // Check if package.json exists for npm scripts
        if wt_path.join("package.json").exists() {
            // Try to run the script (we'll just note that we attempted it)
            // Actual execution will be handled by the frontend
            println!("[Worktree] Adding script to execute: {}", script);
            executed_scripts.push(script.clone());
        }
    }

    println!("[Worktree] Final executed_scripts: {:?}", executed_scripts);

    // Open in editor if configured
    if template.open_in_editor {
        let editor_id = template.preferred_editor.clone();
        let _ = open_in_editor(worktree_path_str.clone(), editor_id).await;
    }

    Ok(CreateWorktreeFromTemplateResponse {
        success: true,
        worktree: add_result.worktree,
        executed_scripts: Some(executed_scripts),
        spec_file_path,
        error: None,
    })
}
