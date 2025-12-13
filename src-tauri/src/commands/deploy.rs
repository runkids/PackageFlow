// Deploy commands
// One-Click Deploy feature (015-one-click-deploy)
// Extended with Multi Deploy Accounts (016-multi-deploy-accounts)

use crate::models::deploy::{
    ConnectedPlatform, DeployAccount, DeployPreferences, Deployment, DeploymentConfig,
    DeploymentStatus, DeploymentStatusEvent, OAuthFlowResult, PlatformType, RemoveAccountResult,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

// OAuth client configuration
//
// These values are intentionally loaded from environment variables so we don't
// hardcode credentials in the repo.
const ENV_NETLIFY_CLIENT_ID: &str = "PACKAGEFLOW_NETLIFY_CLIENT_ID";

/// OAuth success page HTML - displayed after successful authorization
const OAUTH_SUCCESS_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authorization Successful - PackageFlow</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #e4e4e7;
        }
        .card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            max-width: 420px;
            animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .logo {
            width: 72px;
            height: 72px;
            margin: 0 auto 28px;
            border-radius: 16px;
            overflow: hidden;
            animation: scaleIn 0.3s ease-out 0.1s both;
        }
        .logo svg {
            width: 100%;
            height: 100%;
        }
        .success-icon {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            animation: scaleIn 0.3s ease-out 0.3s both;
        }
        @keyframes scaleIn {
            from { transform: scale(0); }
            to { transform: scale(1); }
        }
        .success-icon svg {
            width: 32px;
            height: 32px;
            stroke: white;
            stroke-width: 3;
            fill: none;
        }
        .success-icon svg path {
            stroke-dasharray: 50;
            stroke-dashoffset: 50;
            animation: checkmark 0.4s ease-out 0.6s forwards;
        }
        @keyframes checkmark {
            to { stroke-dashoffset: 0; }
        }
        h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #f4f4f5;
        }
        p {
            font-size: 15px;
            color: #a1a1aa;
            line-height: 1.6;
        }
        .brand {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 13px;
            color: #71717a;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .brand-logo {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            overflow: hidden;
        }
        .brand span {
            color: #a1a1aa;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#4db6ac"/>
                        <stop offset="100%" style="stop-color:#26a69a"/>
                    </linearGradient>
                </defs>
                <rect width="100" height="100" rx="20" fill="url(#bg)"/>
                <text x="50" y="42" font-family="-apple-system, sans-serif" font-size="32" font-weight="300" fill="rgba(255,255,255,0.7)" text-anchor="middle">&lt;/&gt;</text>
                <rect x="22" y="55" width="24" height="22" rx="3" fill="white"/>
                <rect x="26" y="62" width="10" height="2" rx="1" fill="#4db6ac"/>
                <rect x="26" y="67" width="14" height="2" rx="1" fill="#4db6ac"/>
                <rect x="54" y="55" width="24" height="22" rx="3" fill="white"/>
            </svg>
        </div>
        <div class="success-icon">
            <svg viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7"/>
            </svg>
        </div>
        <h1>Authorization Successful</h1>
        <p>Your account has been connected successfully. You can now close this window and return to PackageFlow.</p>
        <div class="brand">
            <div class="brand-logo">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#4db6ac"/>
                            <stop offset="100%" style="stop-color:#26a69a"/>
                        </linearGradient>
                    </defs>
                    <rect width="100" height="100" rx="20" fill="url(#bg2)"/>
                    <text x="50" y="42" font-family="-apple-system, sans-serif" font-size="32" font-weight="300" fill="rgba(255,255,255,0.7)" text-anchor="middle">&lt;/&gt;</text>
                    <rect x="22" y="55" width="24" height="22" rx="3" fill="white"/>
                    <rect x="54" y="55" width="24" height="22" rx="3" fill="white"/>
                </svg>
            </div>
            <span>PackageFlow</span>
        </div>
    </div>
</body>
</html>"##;

enum OAuthClientConfig {
    Netlify { client_id: String },
}

fn read_env_trimmed(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn get_oauth_client_config(platform: &PlatformType) -> Result<OAuthClientConfig, String> {
    match platform {
        PlatformType::GithubPages => {
            Err("GitHub Pages does not require OAuth. It uses git credentials.".to_string())
        }
        PlatformType::Netlify => {
            let client_id = read_env_trimmed(ENV_NETLIFY_CLIENT_ID).ok_or_else(|| {
                format!(
                    "Netlify OAuth is not configured. Set {}.",
                    ENV_NETLIFY_CLIENT_ID
                )
            })?;
            Ok(OAuthClientConfig::Netlify { client_id })
        }
    }
}

// API endpoints
const NETLIFY_AUTH_URL: &str = "https://app.netlify.com/authorize";
const NETLIFY_USER_URL: &str = "https://api.netlify.com/api/v1/user";
const NETLIFY_SITES_URL: &str = "https://api.netlify.com/api/v1/sites";

// Store keys
const STORE_CONNECTED_PLATFORMS: &str = "connected_platforms";
const STORE_DEPLOYMENT_CONFIGS: &str = "deployment_configs";
const STORE_DEPLOYMENT_HISTORY: &str = "deployment_history";
// T008: Deploy preferences store key (016-multi-deploy-accounts)
const STORE_DEPLOY_PREFERENCES: &str = "deploy_preferences";

// History limit per project
const MAX_HISTORY_PER_PROJECT: usize = 50;
// T015: Maximum accounts per platform
const MAX_ACCOUNTS_PER_PLATFORM: usize = 5;

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the store instance
fn get_store(app: &AppHandle) -> Result<Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    app.store("packageflow.json")
        .map_err(|e| format!("Failed to access store: {}", e))
}

/// Get connected platforms from store
fn get_platforms_from_store(app: &AppHandle) -> Result<Vec<ConnectedPlatform>, String> {
    let store = get_store(app)?;
    let platforms: Vec<ConnectedPlatform> = store
        .get(STORE_CONNECTED_PLATFORMS)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(platforms)
}

/// Save connected platforms to store
fn save_platforms_to_store(app: &AppHandle, platforms: &[ConnectedPlatform]) -> Result<(), String> {
    let store = get_store(app)?;
    store.set(
        STORE_CONNECTED_PLATFORMS,
        serde_json::to_value(platforms).map_err(|e| e.to_string())?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

// ============================================================================
// T006, T007: Deploy Account Helper Functions (016-multi-deploy-accounts)
// ============================================================================

/// Get deploy accounts from store with automatic migration from legacy ConnectedPlatform
fn get_accounts_from_store(app: &AppHandle) -> Result<Vec<DeployAccount>, String> {
    let store = get_store(app)?;

    // First try to load as DeployAccount
    if let Some(value) = store.get(STORE_CONNECTED_PLATFORMS) {
        // Try parsing as Vec<DeployAccount> first
        if let Ok(accounts) = serde_json::from_value::<Vec<DeployAccount>>(value.clone()) {
            // Check if migration is needed (accounts without id field)
            let needs_migration = accounts.iter().any(|a| a.id.is_empty());
            if !needs_migration {
                return Ok(accounts);
            }
        }

        // Try parsing as legacy Vec<ConnectedPlatform> and migrate
        if let Ok(legacy_platforms) =
            serde_json::from_value::<Vec<ConnectedPlatform>>(value.clone())
        {
            let migrated: Vec<DeployAccount> = legacy_platforms
                .into_iter()
                .map(DeployAccount::from_connected_platform)
                .collect();

            // Save migrated data back to store
            if !migrated.is_empty() {
                let _ = save_accounts_to_store(app, &migrated);
            }
            return Ok(migrated);
        }
    }

    Ok(Vec::new())
}

/// Save deploy accounts to store
fn save_accounts_to_store(app: &AppHandle, accounts: &[DeployAccount]) -> Result<(), String> {
    let store = get_store(app)?;
    store.set(
        STORE_CONNECTED_PLATFORMS,
        serde_json::to_value(accounts).map_err(|e| e.to_string())?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

/// T008: Get deploy preferences from store
fn get_preferences_from_store(app: &AppHandle) -> Result<DeployPreferences, String> {
    let store = get_store(app)?;
    let prefs: DeployPreferences = store
        .get(STORE_DEPLOY_PREFERENCES)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(prefs)
}

/// T008: Save deploy preferences to store
fn save_preferences_to_store(app: &AppHandle, prefs: &DeployPreferences) -> Result<(), String> {
    let store = get_store(app)?;
    store.set(
        STORE_DEPLOY_PREFERENCES,
        serde_json::to_value(prefs).map_err(|e| e.to_string())?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

/// Find account by ID
fn find_account_by_id(accounts: &[DeployAccount], account_id: &str) -> Option<DeployAccount> {
    accounts.iter().find(|a| a.id == account_id).cloned()
}

/// T037: Find projects using a specific account
fn find_projects_using_account(
    app: &AppHandle,
    account_id: &str,
) -> Result<Vec<String>, String> {
    let configs = get_configs_from_store(app)?;
    let affected: Vec<String> = configs
        .values()
        .filter(|c| c.account_id.as_deref() == Some(account_id))
        .map(|c| c.project_id.clone())
        .collect();
    Ok(affected)
}

/// Clear account_id from all configs that reference the given account
fn clear_account_from_configs(app: &AppHandle, account_id: &str) -> Result<(), String> {
    let mut configs = get_configs_from_store(app)?;
    let mut modified = false;

    for config in configs.values_mut() {
        if config.account_id.as_deref() == Some(account_id) {
            config.account_id = None;
            modified = true;
        }
    }

    if modified {
        save_configs_to_store(app, &configs)?;
    }
    Ok(())
}

/// T031: Get access token for deployment with priority:
/// 1. Bound account (config.account_id)
/// 2. Default account for the platform
/// 3. Legacy connected platform (backward compatibility)
fn get_deployment_access_token(
    app: &AppHandle,
    config: &DeploymentConfig,
) -> Result<String, String> {
    let accounts = get_accounts_from_store(app)?;
    let prefs = get_preferences_from_store(app)?;

    // 1. Try bound account
    if let Some(account_id) = &config.account_id {
        if let Some(account) = find_account_by_id(&accounts, account_id) {
            if !account.access_token.is_empty() {
                return Ok(account.access_token);
            }
        }
    }

    // 2. Try default account for platform
    if let Some(default_id) = prefs.get_default_account_id(&config.platform) {
        if let Some(account) = find_account_by_id(&accounts, default_id) {
            if !account.access_token.is_empty() {
                return Ok(account.access_token);
            }
        }
    }

    // 3. Try any account for the platform
    if let Some(account) = accounts
        .iter()
        .find(|a| a.platform == config.platform && !a.access_token.is_empty())
    {
        return Ok(account.access_token.clone());
    }

    // 4. Fall back to legacy connected platform
    let connected = check_platform_connected(app, &config.platform)?;
    Ok(connected.access_token)
}

/// Get deployment configs from store
fn get_configs_from_store(
    app: &AppHandle,
) -> Result<std::collections::HashMap<String, DeploymentConfig>, String> {
    let store = get_store(app)?;
    let configs: std::collections::HashMap<String, DeploymentConfig> = store
        .get(STORE_DEPLOYMENT_CONFIGS)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(configs)
}

/// Save deployment configs to store
fn save_configs_to_store(
    app: &AppHandle,
    configs: &std::collections::HashMap<String, DeploymentConfig>,
) -> Result<(), String> {
    let store = get_store(app)?;
    store.set(
        STORE_DEPLOYMENT_CONFIGS,
        serde_json::to_value(configs).map_err(|e| e.to_string())?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

/// Get deployment history from store
fn get_history_from_store(
    app: &AppHandle,
) -> Result<std::collections::HashMap<String, Vec<Deployment>>, String> {
    let store = get_store(app)?;
    let history: std::collections::HashMap<String, Vec<Deployment>> = store
        .get(STORE_DEPLOYMENT_HISTORY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(history)
}

/// Save deployment history to store
fn save_history_to_store(
    app: &AppHandle,
    history: &std::collections::HashMap<String, Vec<Deployment>>,
) -> Result<(), String> {
    let store = get_store(app)?;
    store.set(
        STORE_DEPLOYMENT_HISTORY,
        serde_json::to_value(history).map_err(|e| e.to_string())?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

/// Save a single deployment to history
fn save_deployment_to_history(app: &AppHandle, deployment: &Deployment) -> Result<(), String> {
    let mut history = get_history_from_store(app)?;
    let project_history = history.entry(deployment.project_id.clone()).or_default();

    // Insert at the beginning (newest first)
    project_history.insert(0, deployment.clone());

    // Trim to max history limit
    if project_history.len() > MAX_HISTORY_PER_PROJECT {
        project_history.truncate(MAX_HISTORY_PER_PROJECT);
    }

    save_history_to_store(app, &history)
}

/// Check if a platform is connected
fn check_platform_connected(
    app: &AppHandle,
    platform: &PlatformType,
) -> Result<ConnectedPlatform, String> {
    let platforms = get_platforms_from_store(app)?;
    platforms
        .into_iter()
        .find(|p| &p.platform == platform)
        .ok_or_else(|| format!("Platform {} not connected", platform))
}

/// Build Netlify OAuth authorization URL (implicit grant)
fn build_netlify_auth_url(client_id: &str, redirect_uri: &str, state: &str) -> String {
    format!(
        "{}?client_id={}&response_type=token&redirect_uri={}&state={}",
        NETLIFY_AUTH_URL,
        urlencoding::encode(client_id),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(state)
    )
}

// ============================================================================
// OAuth Commands
// ============================================================================

/// Start OAuth flow for a platform
#[tauri::command]
pub async fn start_oauth_flow(
    app: AppHandle,
    platform: PlatformType,
) -> Result<OAuthFlowResult, String> {
    use uuid::Uuid;

    let oauth_config = match get_oauth_client_config(&platform) {
        Ok(config) => config,
        Err(error) => {
            return Ok(OAuthFlowResult {
                success: false,
                platform: None,
                error: Some(error),
            });
        }
    };

    // Generate state for CSRF protection
    let state = Uuid::new_v4().to_string();
    let state_clone = state.clone();

    // Channel to receive the callback URL
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    // Start local OAuth server with callback on fixed port
    let config = tauri_plugin_oauth::OauthConfig {
        ports: Some(vec![8766, 8767, 8768]), // Try these ports in order
        response: Some(OAUTH_SUCCESS_HTML.into()),
    };
    let port = tauri_plugin_oauth::start_with_config(config, move |url| {
        let tx = tx.clone();
        // Send the URL through the channel
        tauri::async_runtime::spawn(async move {
            if let Some(sender) = tx.lock().await.take() {
                let _ = sender.send(url);
            }
        });
    })
    .map_err(|e| format!("Failed to start OAuth server: {}", e))?;

    let redirect_uri = format!("http://localhost:{}/callback", port);

    // Build authorization URL based on platform
    let auth_url = match &oauth_config {
        OAuthClientConfig::Netlify { client_id } => {
            build_netlify_auth_url(client_id, &redirect_uri, &state)
        }
    };

    // Open browser for authorization
    if let Err(e) = opener::open_browser(&auth_url) {
        let _ = tauri_plugin_oauth::cancel(port);
        return Ok(OAuthFlowResult {
            success: false,
            platform: None,
            error: Some(format!("Failed to open browser: {}", e)),
        });
    }

    // Wait for callback with timeout (60 seconds)
    let callback_result = tokio::time::timeout(std::time::Duration::from_secs(60), rx).await;

    // Cancel the OAuth server
    let _ = tauri_plugin_oauth::cancel(port);

    let callback_url = match callback_result {
        Ok(Ok(url)) => url,
        Ok(Err(_)) => {
            return Ok(OAuthFlowResult {
                success: false,
                platform: None,
                error: Some("OAuth callback channel closed".to_string()),
            });
        }
        Err(_) => {
            return Ok(OAuthFlowResult {
                success: false,
                platform: None,
                error: Some("OAuth flow timed out".to_string()),
            });
        }
    };

    // Parse callback URL and exchange for token
    let connected_platform = match oauth_config {
        OAuthClientConfig::Netlify { .. } => extract_netlify_token(&callback_url, &state_clone).await?,
    };

    // Save connected platform
    let mut platforms = get_platforms_from_store(&app)?;
    platforms.retain(|p| p.platform != platform);
    platforms.push(connected_platform.clone());
    save_platforms_to_store(&app, &platforms)?;

    Ok(OAuthFlowResult {
        success: true,
        platform: Some(connected_platform.sanitized()),
        error: None,
    })
}

/// Extract Netlify token from redirect URL (implicit grant)
async fn extract_netlify_token(
    callback_url: &str,
    expected_state: &str,
) -> Result<ConnectedPlatform, String> {
    // Netlify uses hash fragment for implicit grant
    // URL format: http://localhost:PORT#access_token=XXX&token_type=Bearer&state=YYY
    let url = url::Url::parse(callback_url).map_err(|e| format!("Invalid callback URL: {}", e))?;

    let fragment = url.fragment().ok_or("Missing URL fragment")?;
    let params: std::collections::HashMap<String, String> = fragment
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            Some((parts.next()?.to_string(), parts.next()?.to_string()))
        })
        .collect();

    let access_token = params
        .get("access_token")
        .ok_or("Missing access_token in fragment")?
        .to_string();
    let state = params
        .get("state")
        .ok_or("Missing state in fragment")?
        .to_string();

    // Verify state
    if state != expected_state {
        return Err("State mismatch - possible CSRF attack".to_string());
    }

    // Fetch user info
    let client = reqwest::Client::new();
    let user_response = client
        .get(NETLIFY_USER_URL)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {}", e))?;

    if !user_response.status().is_success() {
        return Err("Failed to fetch Netlify user info".to_string());
    }

    let user_data: serde_json::Value = user_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse user response: {}", e))?;

    let user_id = user_data["id"].as_str().unwrap_or("").to_string();
    let username = user_data["full_name"]
        .as_str()
        .or_else(|| user_data["email"].as_str())
        .unwrap_or("Unknown")
        .to_string();
    let avatar_url = user_data["avatar_url"].as_str().map(|s| s.to_string());

    Ok(ConnectedPlatform {
        platform: PlatformType::Netlify,
        access_token,
        user_id,
        username,
        avatar_url,
        connected_at: chrono::Utc::now(),
        expires_at: None,
    })
}

/// Get all connected platforms (sanitized - no tokens)
#[tauri::command]
pub async fn get_connected_platforms(app: AppHandle) -> Result<Vec<ConnectedPlatform>, String> {
    let platforms = get_platforms_from_store(&app)?;
    Ok(platforms.into_iter().map(|p| p.sanitized()).collect())
}

/// Disconnect a platform
#[tauri::command]
pub async fn disconnect_platform(app: AppHandle, platform: PlatformType) -> Result<(), String> {
    let mut platforms = get_platforms_from_store(&app)?;
    platforms.retain(|p| p.platform != platform);
    save_platforms_to_store(&app, &platforms)
}

// ============================================================================
// Deployment Commands
// ============================================================================

/// Start a new deployment
/// T031: Updated to use bound account or fall back to default account
#[tauri::command]
pub async fn start_deployment(
    app: AppHandle,
    project_id: String,
    project_path: String,
    config: DeploymentConfig,
) -> Result<Deployment, String> {
    // T031: Get access token from bound account, default account, or legacy connected platform
    let access_token = get_deployment_access_token(&app, &config)?;

    // Create deployment record
    let deployment = Deployment::new(project_id.clone(), config.platform.clone());

    // Save initial deployment to history
    save_deployment_to_history(&app, &deployment)?;

    // Clone values for async task
    let app_clone = app.clone();
    let deployment_id = deployment.id.clone();
    let access_token_clone = access_token.clone();
    let config_clone = config.clone();
    let project_path_clone = project_path.clone();

    // Start deployment in background
    tauri::async_runtime::spawn(async move {
        let result =
            execute_deployment(&app_clone, &deployment_id, &access_token_clone, &config_clone, &project_path_clone).await;

        // Update deployment status based on result
        let mut history = get_history_from_store(&app_clone).unwrap_or_default();
        if let Some(project_history) = history.get_mut(&config_clone.project_id) {
            if let Some(dep) = project_history.iter_mut().find(|d| d.id == deployment_id) {
                match result {
                    Ok((url, _)) => {
                        dep.status = DeploymentStatus::Ready;
                        dep.url = Some(url.clone());
                        dep.completed_at = Some(chrono::Utc::now());

                        // Emit success event
                        let _ = app_clone.emit(
                            "deployment:status",
                            DeploymentStatusEvent {
                                deployment_id: deployment_id.clone(),
                                status: DeploymentStatus::Ready,
                                url: Some(url),
                                error_message: None,
                            },
                        );
                    }
                    Err(error) => {
                        dep.status = DeploymentStatus::Failed;
                        dep.error_message = Some(error.clone());
                        dep.completed_at = Some(chrono::Utc::now());

                        // Emit failure event
                        let _ = app_clone.emit(
                            "deployment:status",
                            DeploymentStatusEvent {
                                deployment_id: deployment_id.clone(),
                                status: DeploymentStatus::Failed,
                                url: None,
                                error_message: Some(error),
                            },
                        );
                    }
                }
                let _ = save_history_to_store(&app_clone, &history);
            }
        }
    });

    // Return initial deployment record
    Ok(deployment)
}

/// Execute the actual deployment
async fn execute_deployment(
    app: &AppHandle,
    deployment_id: &str,
    access_token: &str,
    config: &DeploymentConfig,
    project_path: &str,
) -> Result<(String, String), String> {
    // Emit building status
    let _ = app.emit(
        "deployment:status",
        DeploymentStatusEvent {
            deployment_id: deployment_id.to_string(),
            status: DeploymentStatus::Building,
            url: None,
            error_message: None,
        },
    );

    // Determine build output directory: custom > framework preset > default
    let build_dir = config
        .output_directory
        .clone()
        .unwrap_or_else(|| get_build_output_dir(config.framework_preset.as_deref()));
    let full_build_path = std::path::Path::new(project_path).join(&build_dir);

    // Run build command
    run_build_command(project_path, config).await?;

    // Verify build output exists
    if !full_build_path.exists() {
        return Err(format!(
            "Build output directory not found: {}. Please check your build command and output directory settings.",
            full_build_path.display()
        ));
    }

    match config.platform {
        PlatformType::GithubPages => deploy_to_github_pages(app, deployment_id, project_path, config, &full_build_path).await,
        PlatformType::Netlify => deploy_to_netlify(app, deployment_id, access_token, config, &full_build_path).await,
    }
}

/// Get the build output directory based on framework preset
fn get_build_output_dir(framework: Option<&str>) -> String {
    match framework {
        Some("nextjs") => ".next".to_string(),
        Some("react") | Some("create-react-app") => "build".to_string(),
        Some("vue") | Some("vue3") | Some("vite") => "dist".to_string(),
        Some("nuxtjs") => ".output/public".to_string(),
        Some("svelte") | Some("sveltekit") => "build".to_string(),
        Some("gatsby") => "public".to_string(),
        Some("astro") => "dist".to_string(),
        Some("remix") => "public".to_string(),
        _ => "dist".to_string(),
    }
}

/// Run the build command for the project
async fn run_build_command(project_path: &str, config: &DeploymentConfig) -> Result<(), String> {
    use std::process::Stdio;
    use tokio::process::Command;

    // Use custom build command if set, otherwise default to "npm run build"
    let build_cmd = config.build_command.as_deref().unwrap_or("npm run build");

    // Split command for execution
    let output = Command::new("sh")
        .arg("-c")
        .arg(build_cmd)
        .current_dir(project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run build command '{}': {}", build_cmd, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Build command '{}' failed:\n{}\n{}",
            build_cmd, stdout, stderr
        ));
    }

    Ok(())
}

/// Collect all files from a directory for upload
fn collect_files_for_upload(build_path: &std::path::Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    use std::fs;

    let mut files = Vec::new();

    fn collect_recursive(
        base: &std::path::Path,
        current: &std::path::Path,
        files: &mut Vec<(String, Vec<u8>)>,
    ) -> Result<(), String> {
        for entry in fs::read_dir(current).map_err(|e| format!("Failed to read directory: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                collect_recursive(base, &path, files)?;
            } else {
                let relative = path.strip_prefix(base)
                    .map_err(|e| format!("Failed to get relative path: {}", e))?
                    .to_string_lossy()
                    .to_string();
                let content = fs::read(&path)
                    .map_err(|e| format!("Failed to read file {}: {}", path.display(), e))?;
                files.push((relative, content));
            }
        }
        Ok(())
    }

    collect_recursive(build_path, build_path, &mut files)?;
    Ok(files)
}

/// Calculate SHA1 hash of content (hex string)
fn calculate_sha1(content: &[u8]) -> String {
    use sha1::{Sha1, Digest};
    let mut hasher = Sha1::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
}

/// Deploy to GitHub Pages by pushing to gh-pages branch
async fn deploy_to_github_pages(
    app: &AppHandle,
    deployment_id: &str,
    project_path: &str,
    config: &DeploymentConfig,
    build_path: &std::path::Path,
) -> Result<(String, String), String> {
    use std::process::Stdio;
    use tokio::process::Command;

    // Emit deploying status
    let _ = app.emit(
        "deployment:status",
        DeploymentStatusEvent {
            deployment_id: deployment_id.to_string(),
            status: DeploymentStatus::Deploying,
            url: None,
            error_message: None,
        },
    );

    // Get git remote URL to determine GitHub Pages URL
    let remote_output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to get git remote: {}", e))?;

    if !remote_output.status.success() {
        return Err("No git remote 'origin' found. Please configure git remote first.".to_string());
    }

    let remote_url = String::from_utf8_lossy(&remote_output.stdout).trim().to_string();

    // Parse GitHub username and repo from remote URL
    let (username, repo) = parse_github_remote(&remote_url)?;

    // Create a temporary directory for gh-pages branch
    let temp_dir = std::env::temp_dir().join(format!("packageflow-gh-pages-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Clone the gh-pages branch (or create it)
    let clone_result = Command::new("git")
        .args(["clone", "--branch", "gh-pages", "--single-branch", "--depth", "1", &remote_url, "."])
        .current_dir(&temp_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    let is_new_branch = match clone_result {
        Ok(output) if output.status.success() => false,
        _ => {
            // gh-pages branch doesn't exist, initialize a new orphan branch
            Command::new("git")
                .args(["init"])
                .current_dir(&temp_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("Failed to init git: {}", e))?;

            Command::new("git")
                .args(["checkout", "--orphan", "gh-pages"])
                .current_dir(&temp_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("Failed to create orphan branch: {}", e))?;

            Command::new("git")
                .args(["remote", "add", "origin", &remote_url])
                .current_dir(&temp_dir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("Failed to add remote: {}", e))?;

            true
        }
    };

    // Clear existing files (except .git)
    for entry in std::fs::read_dir(&temp_dir).map_err(|e| format!("Failed to read temp dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.file_name().map(|n| n != ".git").unwrap_or(false) {
            if path.is_dir() {
                std::fs::remove_dir_all(&path).ok();
            } else {
                std::fs::remove_file(&path).ok();
            }
        }
    }

    // Copy build files to temp directory
    copy_dir_contents(build_path, &temp_dir)?;

    // Add .nojekyll file to prevent Jekyll processing
    std::fs::write(temp_dir.join(".nojekyll"), "")
        .map_err(|e| format!("Failed to create .nojekyll: {}", e))?;

    // Git add all files
    Command::new("git")
        .args(["add", "-A"])
        .current_dir(&temp_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to git add: {}", e))?;

    // Git commit
    let commit_msg = format!("Deploy from PackageFlow - {}", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"));
    let commit_output = Command::new("git")
        .args(["commit", "-m", &commit_msg])
        .current_dir(&temp_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to git commit: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        // If no changes to commit, that's OK
        if !stderr.contains("nothing to commit") {
            return Err(format!("Git commit failed: {}", stderr));
        }
    }

    // Git push
    let push_args = if is_new_branch {
        vec!["push", "-u", "origin", "gh-pages"]
    } else {
        vec!["push", "origin", "gh-pages"]
    };

    let push_output = Command::new("git")
        .args(&push_args)
        .current_dir(&temp_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to git push: {}", e))?;

    // Clean up temp directory
    let _ = std::fs::remove_dir_all(&temp_dir);

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        return Err(format!("Git push failed: {}", stderr));
    }

    // Construct GitHub Pages URL
    let pages_url = format!("https://{}.github.io/{}/", username, repo);

    Ok((pages_url, deployment_id.to_string()))
}

/// Parse GitHub username and repo from remote URL
fn parse_github_remote(url: &str) -> Result<(String, String), String> {
    // Handle SSH format: git@github.com:username/repo.git
    if url.starts_with("git@github.com:") {
        let path = url.strip_prefix("git@github.com:").unwrap();
        let path = path.strip_suffix(".git").unwrap_or(path);
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }

    // Handle HTTPS format: https://github.com/username/repo.git
    if url.contains("github.com") {
        let url = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
        let path = url.path().trim_start_matches('/');
        let path = path.strip_suffix(".git").unwrap_or(path);
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }

    Err("Could not parse GitHub remote URL. Expected format: git@github.com:user/repo.git or https://github.com/user/repo.git".to_string())
}

/// Copy directory contents recursively
fn copy_dir_contents(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    use std::fs;

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read source dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            fs::create_dir_all(&dst_path)
                .map_err(|e| format!("Failed to create dir {}: {}", dst_path.display(), e))?;
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy file {}: {}", src_path.display(), e))?;
        }
    }
    Ok(())
}

/// Deploy to Netlify using file digest API
async fn deploy_to_netlify(
    app: &AppHandle,
    deployment_id: &str,
    access_token: &str,
    config: &DeploymentConfig,
    build_path: &std::path::Path,
) -> Result<(String, String), String> {
    let client = reqwest::Client::new();

    // Step 1: Get or create site
    let site_id = get_or_create_netlify_site(&client, access_token, config).await?;

    // Emit deploying status
    let _ = app.emit(
        "deployment:status",
        DeploymentStatusEvent {
            deployment_id: deployment_id.to_string(),
            status: DeploymentStatus::Deploying,
            url: None,
            error_message: None,
        },
    );

    // Step 2: Collect files and create digest map
    let files = collect_files_for_upload(build_path)?;

    // Build file digest map (path -> sha1)
    let mut file_digests = std::collections::HashMap::new();
    for (path, content) in &files {
        let sha = calculate_sha1(content);
        // Netlify expects paths starting with /
        file_digests.insert(format!("/{}", path), sha);
    }

    // Step 3: Create a deploy with file digests
    let deploy_url = format!("{}/{}/deploys", NETLIFY_SITES_URL, site_id);
    let payload = serde_json::json!({
        "files": file_digests,
    });

    let response = client
        .post(&deploy_url)
        .bearer_auth(access_token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Netlify deploy request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Netlify deployment failed: {}", error_text));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Netlify deploy response: {}", e))?;

    let netlify_deploy_id = result["id"].as_str().unwrap_or("").to_string();

    // Step 4: Upload required files
    if let Some(required) = result["required"].as_array() {
        for sha in required {
            if let Some(sha_str) = sha.as_str() {
                // Find file with matching SHA
                for (path, content) in &files {
                    if calculate_sha1(content) == sha_str {
                        upload_file_to_netlify(&client, access_token, &netlify_deploy_id, &format!("/{}", path), content).await?;
                        break;
                    }
                }
            }
        }
    }

    // Step 5: Poll for deployment status
    let url = poll_netlify_deployment(app, deployment_id, access_token, &site_id, &netlify_deploy_id).await?;

    Ok((url, netlify_deploy_id))
}

/// Upload a single file to Netlify deploy
async fn upload_file_to_netlify(
    client: &reqwest::Client,
    access_token: &str,
    deploy_id: &str,
    file_path: &str,
    content: &[u8],
) -> Result<(), String> {
    let url = format!("https://api.netlify.com/api/v1/deploys/{}/files{}", deploy_id, file_path);

    let response = client
        .put(&url)
        .bearer_auth(access_token)
        .header("Content-Type", "application/octet-stream")
        .body(content.to_vec())
        .send()
        .await
        .map_err(|e| format!("Failed to upload file {}: {}", file_path, e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to upload {}: {}", file_path, error_text));
    }

    Ok(())
}

/// Get or create a Netlify site for the project
async fn get_or_create_netlify_site(
    client: &reqwest::Client,
    access_token: &str,
    config: &DeploymentConfig,
) -> Result<String, String> {
    // First, try to find an existing site with matching name
    let response = client
        .get(NETLIFY_SITES_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to list Netlify sites: {}", e))?;

    if response.status().is_success() {
        let sites: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Netlify sites: {}", e))?;

        // Look for a site matching the project name
        let site_name = sanitize_site_name(&config.project_id);
        if let Some(site) = sites.iter().find(|s| {
            s["name"].as_str().map(|n| n == site_name).unwrap_or(false)
        }) {
            if let Some(site_id) = site["id"].as_str() {
                return Ok(site_id.to_string());
            }
        }
    }

    // Create a new site if not found
    let create_payload = serde_json::json!({
        "name": sanitize_site_name(&config.project_id),
    });

    let create_response = client
        .post(NETLIFY_SITES_URL)
        .bearer_auth(access_token)
        .json(&create_payload)
        .send()
        .await
        .map_err(|e| format!("Failed to create Netlify site: {}", e))?;

    if !create_response.status().is_success() {
        let error_text = create_response.text().await.unwrap_or_default();
        return Err(format!("Failed to create Netlify site: {}", error_text));
    }

    let site: serde_json::Value = create_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Netlify site response: {}", e))?;

    site["id"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No site ID in Netlify response".to_string())
}

/// Sanitize project name for Netlify site name (lowercase, alphanumeric, hyphens only)
fn sanitize_site_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Poll Netlify deployment status and return the deployment URL
async fn poll_netlify_deployment(
    app: &AppHandle,
    deployment_id: &str,
    access_token: &str,
    site_id: &str,
    netlify_deploy_id: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/{}/deploys/{}", NETLIFY_SITES_URL, site_id, netlify_deploy_id);

    for _ in 0..60 {
        // Max 5 minutes polling
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        let response = client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| format!("Failed to check Netlify deployment status: {}", e))?;

        if !response.status().is_success() {
            continue;
        }

        let status: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Netlify status response: {}", e))?;

        match status["state"].as_str() {
            Some("ready") => {
                let deploy_url = status["ssl_url"]
                    .as_str()
                    .or_else(|| status["url"].as_str())
                    .unwrap_or("")
                    .to_string();
                return Ok(deploy_url);
            }
            Some("error") => {
                let error = status["error_message"]
                    .as_str()
                    .unwrap_or("Deployment failed")
                    .to_string();
                return Err(error);
            }
            Some("building") => {
                let _ = app.emit(
                    "deployment:status",
                    DeploymentStatusEvent {
                        deployment_id: deployment_id.to_string(),
                        status: DeploymentStatus::Building,
                        url: None,
                        error_message: None,
                    },
                );
            }
            Some("uploading") | Some("uploaded") | Some("processing") => {
                let _ = app.emit(
                    "deployment:status",
                    DeploymentStatusEvent {
                        deployment_id: deployment_id.to_string(),
                        status: DeploymentStatus::Deploying,
                        url: None,
                        error_message: None,
                    },
                );
            }
            _ => {}
        }
    }

    Err("Netlify deployment timed out".to_string())
}

/// Get deployment history for a project
#[tauri::command]
pub async fn get_deployment_history(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<Deployment>, String> {
    let history = get_history_from_store(&app)?;
    Ok(history.get(&project_id).cloned().unwrap_or_default())
}

/// Get deployment config for a project
#[tauri::command]
pub async fn get_deployment_config(
    app: AppHandle,
    project_id: String,
) -> Result<Option<DeploymentConfig>, String> {
    let configs = get_configs_from_store(&app)?;
    Ok(configs.get(&project_id).cloned())
}

/// Save deployment config for a project
#[tauri::command]
pub async fn save_deployment_config(
    app: AppHandle,
    config: DeploymentConfig,
) -> Result<(), String> {
    let mut configs = get_configs_from_store(&app)?;
    configs.insert(config.project_id.clone(), config);
    save_configs_to_store(&app, &configs)
}

/// Detect framework from project path
#[tauri::command]
pub async fn detect_framework(project_path: String) -> Result<Option<String>, String> {
    let package_json_path = std::path::Path::new(&project_path).join("package.json");

    if !package_json_path.exists() {
        return Ok(Some("static".to_string()));
    }

    let content = std::fs::read_to_string(&package_json_path)
        .map_err(|e| format!("Failed to read package.json: {}", e))?;

    let package: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse package.json: {}", e))?;

    let deps = package["dependencies"].as_object();
    let dev_deps = package["devDependencies"].as_object();

    let has_dep = |name: &str| -> bool {
        deps.map(|d| d.contains_key(name)).unwrap_or(false)
            || dev_deps.map(|d| d.contains_key(name)).unwrap_or(false)
    };

    // Detection order matters - more specific frameworks first
    let framework = if has_dep("next") {
        "nextjs"
    } else if has_dep("nuxt") {
        "nuxtjs"
    } else if has_dep("@remix-run/react") {
        "remix"
    } else if has_dep("gatsby") {
        "gatsby"
    } else if has_dep("@sveltejs/kit") {
        "sveltekit"
    } else if has_dep("astro") {
        "astro"
    } else if has_dep("vite") {
        "vite"
    } else if has_dep("react") {
        "create-react-app"
    } else if has_dep("vue") {
        "vue"
    } else {
        "static"
    };

    Ok(Some(framework.to_string()))
}

/// Redeploy using last deployment config
#[tauri::command]
pub async fn redeploy(app: AppHandle, project_id: String, project_path: String) -> Result<Deployment, String> {
    // Get last deployment config
    let config = get_deployment_config(app.clone(), project_id.clone())
        .await?
        .ok_or("No previous deployment config found")?;

    // Start new deployment with same config
    start_deployment(app, project_id, project_path, config).await
}

// ============================================================================
// Multi Deploy Accounts Commands (016-multi-deploy-accounts)
// ============================================================================

/// T009: Get all deploy accounts (sanitized - no tokens)
#[tauri::command]
pub async fn get_deploy_accounts(app: AppHandle) -> Result<Vec<DeployAccount>, String> {
    let accounts = get_accounts_from_store(&app)?;
    Ok(accounts.into_iter().map(|a| a.sanitized()).collect())
}

/// T010: Get accounts filtered by platform
#[tauri::command]
pub async fn get_accounts_by_platform(
    app: AppHandle,
    platform: PlatformType,
) -> Result<Vec<DeployAccount>, String> {
    let accounts = get_accounts_from_store(&app)?;
    Ok(accounts
        .into_iter()
        .filter(|a| a.platform == platform)
        .map(|a| a.sanitized())
        .collect())
}

/// T015: Add a new deploy account via OAuth
#[tauri::command]
pub async fn add_deploy_account(
    app: AppHandle,
    platform: PlatformType,
) -> Result<OAuthFlowResult, String> {
    use uuid::Uuid;

    // Check max accounts limit
    let accounts = get_accounts_from_store(&app)?;
    let platform_count = accounts.iter().filter(|a| a.platform == platform).count();
    if platform_count >= MAX_ACCOUNTS_PER_PLATFORM {
        return Ok(OAuthFlowResult {
            success: false,
            platform: None,
            error: Some(format!(
                "Maximum of {} accounts per platform reached",
                MAX_ACCOUNTS_PER_PLATFORM
            )),
        });
    }

    let oauth_config = match get_oauth_client_config(&platform) {
        Ok(config) => config,
        Err(error) => {
            return Ok(OAuthFlowResult {
                success: false,
                platform: None,
                error: Some(error),
            });
        }
    };

    // Generate state for CSRF protection
    let state = Uuid::new_v4().to_string();
    let state_clone = state.clone();

    // Channel to receive the callback URL
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    // Start local OAuth server with callback on fixed port
    let config = tauri_plugin_oauth::OauthConfig {
        ports: Some(vec![8766, 8767, 8768]), // Try these ports in order
        response: Some(OAUTH_SUCCESS_HTML.into()),
    };
    let port = tauri_plugin_oauth::start_with_config(config, move |url| {
        let tx = tx.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(sender) = tx.lock().await.take() {
                let _ = sender.send(url);
            }
        });
    })
    .map_err(|e| format!("Failed to start OAuth server: {}", e))?;

    let redirect_uri = format!("http://localhost:{}/callback", port);

    // Build authorization URL based on platform
    let auth_url = match &oauth_config {
        OAuthClientConfig::Netlify { client_id } => {
            build_netlify_auth_url(client_id, &redirect_uri, &state)
        }
    };

    // Open browser for authorization
    if let Err(e) = opener::open_browser(&auth_url) {
        let _ = tauri_plugin_oauth::cancel(port);
        return Ok(OAuthFlowResult {
            success: false,
            platform: None,
            error: Some(format!("Failed to open browser: {}", e)),
        });
    }

    // Wait for callback with timeout (60 seconds)
    let callback_result = tokio::time::timeout(std::time::Duration::from_secs(60), rx).await;

    // Cancel the OAuth server
    let _ = tauri_plugin_oauth::cancel(port);

    let callback_url = match callback_result {
        Ok(Ok(url)) => url,
        Ok(Err(_)) => {
            return Ok(OAuthFlowResult {
                success: false,
                platform: None,
                error: Some("OAuth callback channel closed".to_string()),
            });
        }
        Err(_) => {
            return Ok(OAuthFlowResult {
                success: false,
                platform: None,
                error: Some("OAuth flow timed out".to_string()),
            });
        }
    };

    // Parse callback URL and exchange for token
    let connected_platform = match oauth_config {
        OAuthClientConfig::Netlify { .. } => {
            extract_netlify_token(&callback_url, &state_clone).await?
        }
    };

    // Convert to DeployAccount
    let new_account = DeployAccount::from_connected_platform(connected_platform.clone());

    // Check for duplicate account (same platform + platform_user_id)
    let mut accounts = get_accounts_from_store(&app)?;
    if accounts
        .iter()
        .any(|a| a.platform == platform && a.platform_user_id == new_account.platform_user_id)
    {
        return Ok(OAuthFlowResult {
            success: false,
            platform: None,
            error: Some("This account is already connected".to_string()),
        });
    }

    // Add new account
    accounts.push(new_account.clone());
    save_accounts_to_store(&app, &accounts)?;

    Ok(OAuthFlowResult {
        success: true,
        platform: Some(connected_platform.sanitized()),
        error: None,
    })
}

/// T016: Remove a deploy account
#[tauri::command]
pub async fn remove_deploy_account(
    app: AppHandle,
    account_id: String,
    force: Option<bool>,
) -> Result<RemoveAccountResult, String> {
    let force = force.unwrap_or(false);

    // Check for affected projects
    let affected_projects = find_projects_using_account(&app, &account_id)?;

    if !affected_projects.is_empty() && !force {
        return Ok(RemoveAccountResult {
            success: false,
            affected_projects,
        });
    }

    // If force, clear the account from all configs
    if force && !affected_projects.is_empty() {
        clear_account_from_configs(&app, &account_id)?;
    }

    // T049: Clear default preference if this account was default
    let mut prefs = get_preferences_from_store(&app)?;
    prefs.clear_if_matches(&account_id);
    save_preferences_to_store(&app, &prefs)?;

    // Remove the account
    let mut accounts = get_accounts_from_store(&app)?;
    accounts.retain(|a| a.id != account_id);
    save_accounts_to_store(&app, &accounts)?;

    Ok(RemoveAccountResult {
        success: true,
        affected_projects,
    })
}

/// T022: Update deploy account (display name)
#[tauri::command]
pub async fn update_deploy_account(
    app: AppHandle,
    account_id: String,
    display_name: Option<String>,
) -> Result<DeployAccount, String> {
    let mut accounts = get_accounts_from_store(&app)?;

    let account = accounts
        .iter_mut()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    account.display_name = display_name;
    let updated = account.clone();

    save_accounts_to_store(&app, &accounts)?;
    Ok(updated.sanitized())
}

/// T028: Bind a project to a specific deploy account
#[tauri::command]
pub async fn bind_project_account(
    app: AppHandle,
    project_id: String,
    account_id: String,
) -> Result<DeploymentConfig, String> {
    // Verify account exists
    let accounts = get_accounts_from_store(&app)?;
    let account = find_account_by_id(&accounts, &account_id).ok_or("Account not found")?;

    // Get or create deployment config
    let mut configs = get_configs_from_store(&app)?;
    let config = configs.entry(project_id.clone()).or_insert(DeploymentConfig {
        project_id: project_id.clone(),
        platform: account.platform.clone(),
        account_id: None,
        environment: crate::models::deploy::DeploymentEnvironment::Production,
        framework_preset: None,
        env_variables: Vec::new(),
        root_directory: None,
        build_command: None,
        output_directory: None,
    });

    // Verify platform matches
    if config.platform != account.platform {
        return Err("Account platform does not match project's deploy platform".to_string());
    }

    config.account_id = Some(account_id);
    let updated = config.clone();

    save_configs_to_store(&app, &configs)?;
    Ok(updated)
}

/// T029: Unbind a project from its deploy account
#[tauri::command]
pub async fn unbind_project_account(
    app: AppHandle,
    project_id: String,
) -> Result<DeploymentConfig, String> {
    let mut configs = get_configs_from_store(&app)?;

    let config = configs
        .get_mut(&project_id)
        .ok_or("Deployment config not found")?;

    config.account_id = None;
    let updated = config.clone();

    save_configs_to_store(&app, &configs)?;
    Ok(updated)
}

/// T030: Get the account bound to a project
#[tauri::command]
pub async fn get_project_binding(
    app: AppHandle,
    project_id: String,
) -> Result<Option<DeployAccount>, String> {
    let configs = get_configs_from_store(&app)?;
    let config = match configs.get(&project_id) {
        Some(c) => c,
        None => return Ok(None),
    };

    let account_id = match &config.account_id {
        Some(id) => id,
        None => return Ok(None),
    };

    let accounts = get_accounts_from_store(&app)?;
    Ok(find_account_by_id(&accounts, account_id).map(|a| a.sanitized()))
}

/// T042: Get deploy preferences
#[tauri::command]
pub async fn get_deploy_preferences(app: AppHandle) -> Result<DeployPreferences, String> {
    get_preferences_from_store(&app)
}

/// T043: Set default account for a platform
#[tauri::command]
pub async fn set_default_account(
    app: AppHandle,
    platform: PlatformType,
    account_id: Option<String>,
) -> Result<DeployPreferences, String> {
    // If setting a default, verify account exists and matches platform
    if let Some(ref id) = account_id {
        let accounts = get_accounts_from_store(&app)?;
        let account = find_account_by_id(&accounts, id).ok_or("Account not found")?;
        if account.platform != platform {
            return Err("Account platform does not match".to_string());
        }
    }

    let mut prefs = get_preferences_from_store(&app)?;
    prefs.set_default_account_id(&platform, account_id);
    save_preferences_to_store(&app, &prefs)?;

    Ok(prefs)
}
