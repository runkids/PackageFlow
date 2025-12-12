// Keyboard shortcuts commands
// Provides commands for managing keyboard shortcuts settings and global shortcuts

use crate::utils::store::{KeyboardShortcutsSettings, STORE_FILE};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

/// Load keyboard shortcuts settings
#[tauri::command]
pub async fn load_keyboard_shortcuts(app: AppHandle) -> Result<KeyboardShortcutsSettings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let settings = store
        .get("settings")
        .and_then(|v| serde_json::from_value::<serde_json::Value>(v.clone()).ok())
        .and_then(|v| v.get("keyboardShortcuts").cloned())
        .and_then(|v| serde_json::from_value::<KeyboardShortcutsSettings>(v).ok())
        .unwrap_or_default();

    Ok(settings)
}

/// Save keyboard shortcuts settings
#[tauri::command]
pub async fn save_keyboard_shortcuts(
    app: AppHandle,
    settings: KeyboardShortcutsSettings,
) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Get current settings
    let mut app_settings = store
        .get("settings")
        .and_then(|v| serde_json::from_value::<serde_json::Value>(v.clone()).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    // Update keyboard shortcuts
    if let Some(obj) = app_settings.as_object_mut() {
        obj.insert(
            "keyboardShortcuts".to_string(),
            serde_json::to_value(&settings).map_err(|e| e.to_string())?,
        );
    }

    // Save back
    store.set("settings", app_settings);
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Convert internal shortcut format to tauri-plugin-global-shortcut format
/// e.g., "cmd+shift+p" -> "CommandOrControl+Shift+P"
fn convert_shortcut_format(shortcut: &str) -> String {
    let parts: Vec<&str> = shortcut.split('+').collect();
    let mut result = Vec::new();

    for part in parts {
        let lowercase = part.to_lowercase();
        let converted = match lowercase.as_str() {
            "cmd" | "meta" => "CommandOrControl".to_string(),
            "ctrl" => "Control".to_string(),
            "shift" => "Shift".to_string(),
            "alt" | "option" => "Alt".to_string(),
            key => {
                // Capitalize the key
                let mut chars = key.chars();
                match chars.next() {
                    None => key.to_string(),
                    Some(c) => format!("{}{}", c.to_uppercase(), chars.collect::<String>()),
                }
            }
        };
        result.push(converted);
    }

    result.join("+")
}

/// Register global shortcut for toggling window visibility
#[tauri::command]
pub async fn register_global_toggle_shortcut(
    app: AppHandle,
    shortcut_key: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let global_shortcut = app.global_shortcut();

        // Unregister any existing shortcuts first
        let _ = global_shortcut.unregister_all();

        // Convert shortcut format
        let formatted_shortcut = convert_shortcut_format(&shortcut_key);

        // Parse the shortcut string
        let shortcut: Shortcut = formatted_shortcut
            .parse()
            .map_err(|e| format!("Invalid shortcut format: {:?}", e))?;

        // Clone app handle for the closure
        let app_handle = app.clone();

        // Register the new shortcut
        global_shortcut
            .on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // Toggle window visibility
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if let Ok(is_visible) = window.is_visible() {
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    // Emit event to frontend
                    let _ = app_handle.emit("global-shortcut-triggered", "toggle-visibility");
                }
            })
            .map_err(|e| {
                let error_msg = e.to_string().to_lowercase();
                if error_msg.contains("already") || error_msg.contains("occupied") || error_msg.contains("use") {
                    format!("CONFLICT: This shortcut ({}) may already be used by another application. Try a different combination.", shortcut_key)
                } else {
                    format!("Failed to register shortcut: {}", e)
                }
            })?;

        log::info!(
            "[shortcuts] Registered global shortcut: {}",
            formatted_shortcut
        );
    }

    Ok(())
}

/// Unregister all global shortcuts
#[tauri::command]
pub async fn unregister_global_shortcuts(app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let global_shortcut = app.global_shortcut();
        global_shortcut
            .unregister_all()
            .map_err(|e| format!("Failed to unregister shortcuts: {}", e))?;

        log::info!("[shortcuts] Unregistered all global shortcuts");
    }

    Ok(())
}

/// Toggle window visibility (called from frontend or global shortcut)
#[tauri::command]
pub async fn toggle_window_visibility(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;

        if is_visible {
            window.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("Main window not found".to_string())
    }
}

/// Get all registered global shortcuts
#[tauri::command]
pub async fn get_registered_shortcuts(app: AppHandle) -> Result<Vec<String>, String> {
    #[cfg(desktop)]
    {
        // Note: The plugin doesn't expose a way to list all registered shortcuts
        // We'll return an empty list for now; the frontend tracks registered shortcuts
        let _ = app.global_shortcut();
        Ok(vec![])
    }

    #[cfg(not(desktop))]
    {
        Ok(vec![])
    }
}

/// Check if a shortcut is registered
#[tauri::command]
pub async fn is_shortcut_registered(app: AppHandle, shortcut_key: String) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        let global_shortcut = app.global_shortcut();
        let formatted_shortcut = convert_shortcut_format(&shortcut_key);

        // Parse the shortcut string
        let shortcut: Shortcut = match formatted_shortcut.parse() {
            Ok(s) => s,
            Err(_) => return Ok(false),
        };

        Ok(global_shortcut.is_registered(shortcut))
    }

    #[cfg(not(desktop))]
    {
        Ok(false)
    }
}
