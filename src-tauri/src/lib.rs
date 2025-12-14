// PackageFlow - Tauri Application
// Migrated from Electron version

mod commands;
mod models;
mod services;
mod utils;

// Re-export models for use in commands
pub use models::*;

use commands::script::ScriptExecutionState;
use commands::workflow::WorkflowExecutionState;
use commands::{
    apk, deploy, file_watcher, git, incoming_webhook, ipa, monorepo, project, script, security,
    settings, shortcuts, step_template, toolchain, version, webhook, workflow, worktree,
};
use services::{FileWatcherManager, IncomingWebhookManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file (for OAuth credentials)
    // Try project root first, then current dir
    let _ = dotenvy::from_filename("../.env").or_else(|_| dotenvy::dotenv());

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_pty::init()) // Feature 008: PTY for interactive terminals
        .plugin(tauri_plugin_notification::init()) // Feature 015: Webhook desktop notifications
        .plugin(tauri_plugin_global_shortcut::Builder::new().build()) // Keyboard shortcuts enhancement
        .plugin(tauri_plugin_oauth::init()) // OAuth for deploy feature
        // App state
        .manage(ScriptExecutionState::default())
        .manage(WorkflowExecutionState::default())
        .manage(IncomingWebhookManager::new())
        .manage(FileWatcherManager::new())
        // Register commands
        .invoke_handler(tauri::generate_handler![
            // Settings commands (US7)
            settings::load_settings,
            settings::save_settings,
            settings::load_projects,
            settings::save_projects,
            settings::load_workflows,
            settings::save_workflows,
            settings::load_store_data,
            // Store path management
            settings::get_store_path,
            settings::set_store_path,
            settings::reset_store_path,
            settings::open_store_location,
            // Project commands (US2)
            project::scan_project,
            project::save_project,
            project::remove_project,
            project::refresh_project,
            project::get_workspace_packages,
            project::trash_node_modules,
            // Script commands (US3)
            script::execute_script,
            script::execute_command,
            script::cancel_script,
            script::kill_all_node_processes,
            script::kill_ports,
            script::check_ports,
            script::get_running_scripts,
            // Feature 007: Terminal session reconnect
            script::get_script_output,
            // Feature 008: stdin interaction
            script::write_to_script,
            // Feature 008: PTY environment variables
            script::get_pty_env,
            // Volta-wrapped command for PTY execution
            script::get_volta_wrapped_command,
            // Workflow commands (US4)
            // Note: load_workflows is provided by settings module
            workflow::save_workflow,
            workflow::delete_workflow,
            workflow::execute_workflow,
            workflow::cancel_execution,
            workflow::continue_execution,
            workflow::get_running_executions,
            workflow::get_workflow_output,
            workflow::restore_running_executions,
            workflow::kill_process,
            workflow::get_available_workflows,
            // Feature 013: Cycle detection for workflow triggers
            workflow::detect_workflow_cycle,
            // Feature 013: Child execution query
            workflow::get_child_executions,
            // Execution history commands
            workflow::load_execution_history,
            workflow::load_all_execution_history,
            workflow::save_execution_history,
            workflow::delete_execution_history,
            workflow::clear_workflow_execution_history,
            workflow::update_execution_history_settings,
            // Worktree commands (US5)
            worktree::is_git_repo,
            worktree::list_branches,
            worktree::list_worktrees,
            worktree::add_worktree,
            worktree::remove_worktree,
            worktree::get_merged_worktrees,
            worktree::get_behind_commits,
            worktree::sync_worktree,
            // Enhanced worktree commands (001-worktree-enhancements)
            worktree::get_worktree_status,
            worktree::get_all_worktree_statuses,
            worktree::execute_script_in_worktree,
            // Editor integration commands (001-worktree-enhancements US3)
            worktree::open_in_editor,
            worktree::get_available_editors,
            // Worktree template commands (001-worktree-enhancements US5)
            worktree::save_worktree_template,
            worktree::delete_worktree_template,
            worktree::list_worktree_templates,
            worktree::get_default_worktree_templates,
            worktree::get_next_feature_number,
            worktree::create_worktree_from_template,
            // Terminal commands
            worktree::get_available_terminals,
            worktree::set_preferred_terminal,
            worktree::open_in_terminal,
            // Gitignore management commands
            worktree::check_gitignore_has_worktrees,
            worktree::add_worktrees_to_gitignore,
            // IPA commands (US6)
            ipa::check_has_ipa_files,
            ipa::scan_project_ipa,
            // APK commands
            apk::check_has_apk_files,
            apk::scan_project_apk,
            // Security commands (005-package-security-audit)
            security::detect_package_manager,
            security::check_cli_installed,
            security::run_security_audit,
            security::get_security_scan,
            security::get_all_security_scans,
            security::save_security_scan,
            security::snooze_scan_reminder,
            security::dismiss_scan_reminder,
            // Version management commands (006-node-package-manager)
            version::get_version_requirement,
            version::get_system_environment,
            version::check_version_compatibility,
            version::get_wrapped_command,
            // Monorepo commands (008-monorepo-support)
            monorepo::detect_monorepo_tools,
            monorepo::get_tool_version,
            monorepo::get_nx_targets,
            monorepo::run_nx_command,
            monorepo::get_turbo_pipelines,
            monorepo::run_turbo_command,
            monorepo::get_turbo_cache_status,
            monorepo::clear_turbo_cache,
            monorepo::get_nx_cache_status,
            monorepo::clear_nx_cache,
            monorepo::get_dependency_graph,
            monorepo::run_batch_scripts,
            // Git commands (009-git-integration)
            git::get_git_status,
            git::stage_files,
            git::unstage_files,
            git::create_commit,
            git::get_branches,
            git::create_branch,
            git::switch_branch,
            git::delete_branch,
            git::get_commit_history,
            git::git_push,
            git::git_pull,
            git::list_stashes,
            git::create_stash,
            git::apply_stash,
            git::drop_stash,
            // Git remote management
            git::get_remotes,
            git::add_remote,
            git::remove_remote,
            // Git discard changes
            git::discard_changes,
            git::clean_untracked,
            // Git fetch and rebase
            git::git_fetch,
            git::git_rebase,
            git::git_rebase_abort,
            git::git_rebase_continue,
            // Git authentication
            git::get_git_auth_status,
            git::test_remote_connection,
            // Git diff viewer (010-git-diff-viewer)
            git::get_file_diff,
            // Step template commands (011-workflow-step-templates)
            step_template::load_custom_step_templates,
            step_template::save_custom_step_template,
            step_template::delete_custom_step_template,
            // Webhook commands (012-workflow-webhook-support)
            webhook::test_webhook,
            webhook::validate_template_variables,
            // Incoming webhook commands (012-workflow-webhook-support)
            incoming_webhook::generate_incoming_webhook_token,
            incoming_webhook::get_incoming_webhook_status,
            incoming_webhook::get_incoming_webhook_settings,
            incoming_webhook::save_incoming_webhook_settings,
            incoming_webhook::create_incoming_webhook_config,
            incoming_webhook::regenerate_incoming_webhook_token,
            incoming_webhook::check_port_available,
            // Keyboard shortcuts commands
            shortcuts::load_keyboard_shortcuts,
            shortcuts::save_keyboard_shortcuts,
            shortcuts::register_global_toggle_shortcut,
            shortcuts::unregister_global_shortcuts,
            shortcuts::toggle_window_visibility,
            shortcuts::get_registered_shortcuts,
            shortcuts::is_shortcut_registered,
            // Deploy commands (015-one-click-deploy)
            deploy::start_oauth_flow,
            deploy::get_connected_platforms,
            deploy::disconnect_platform,
            deploy::start_deployment,
            deploy::get_deployment_history,
            deploy::delete_deployment_history_item,
            deploy::clear_deployment_history,
            deploy::get_deployment_config,
            deploy::save_deployment_config,
            deploy::detect_framework,
            deploy::redeploy,
            // Multi Deploy Accounts (016-multi-deploy-accounts)
            deploy::get_deploy_accounts,
            deploy::get_accounts_by_platform,
            deploy::add_deploy_account,
            deploy::remove_deploy_account,
            deploy::update_deploy_account,
            deploy::bind_project_account,
            deploy::unbind_project_account,
            deploy::get_project_binding,
            deploy::get_deploy_preferences,
            deploy::set_default_account,
            // GitHub Pages workflow generation
            deploy::generate_github_actions_workflow,
            // Cloudflare Pages integration
            deploy::validate_cloudflare_token,
            deploy::add_cloudflare_account,
            deploy::check_account_usage,
            // Secure backup commands
            deploy::export_deploy_backup,
            deploy::import_deploy_backup,
            // Deploy UI Enhancement (018-deploy-ui-enhancement)
            deploy::get_deployment_stats,
            deploy::get_platform_site_info,
            // File watcher commands (package.json monitoring)
            file_watcher::watch_project,
            file_watcher::unwatch_project,
            file_watcher::unwatch_all_projects,
            file_watcher::get_watched_projects,
            // Toolchain conflict detection (017-toolchain-conflict-detection)
            toolchain::detect_toolchain_conflict,
            toolchain::build_toolchain_command,
            toolchain::get_toolchain_preference,
            toolchain::set_toolchain_preference,
            toolchain::clear_toolchain_preference,
            toolchain::get_environment_diagnostics,
            toolchain::humanize_toolchain_error,
        ])
        // Setup hook - sync incoming webhook server on app start
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Small delay to ensure store is ready
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                if let Err(e) = incoming_webhook::sync_incoming_webhook_server(&handle).await {
                    log::warn!("[setup] Failed to sync incoming webhook server: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
