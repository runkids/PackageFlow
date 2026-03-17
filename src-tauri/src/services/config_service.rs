// Global configuration service for SpecForge
// Handles loading/saving config from XDG-compliant paths via the `dirs` crate

use crate::local_models::config::SpecForgeConfig;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "specforge";
const CONFIG_FILE_NAME: &str = "config.toml";

/// Returns the platform-specific config directory for SpecForge.
///
/// - macOS: `~/Library/Application Support/specforge/`
/// - Linux: `$XDG_CONFIG_HOME/specforge/` or `~/.config/specforge/`
/// - Windows: `%APPDATA%\specforge\`
pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR_NAME)
}

/// Returns the platform-specific data directory for SpecForge.
///
/// - macOS: `~/Library/Application Support/specforge/`
/// - Linux: `$XDG_DATA_HOME/specforge/` or `~/.local/share/specforge/`
/// - Windows: `%LOCALAPPDATA%\specforge\`
pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR_NAME)
}

/// Returns the platform-specific cache directory for SpecForge.
///
/// - macOS: `~/Library/Caches/specforge/`
/// - Linux: `$XDG_CACHE_HOME/specforge/` or `~/.cache/specforge/`
/// - Windows: `%LOCALAPPDATA%\specforge\cache\`
pub fn cache_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR_NAME)
}

/// Load the global config from `config_dir()/config.toml`.
/// Returns the default config if the file doesn't exist or can't be parsed.
pub fn load_config() -> SpecForgeConfig {
    let config_path = config_dir().join(CONFIG_FILE_NAME);

    match std::fs::read_to_string(&config_path) {
        Ok(contents) => toml::from_str(&contents).unwrap_or_else(|e| {
            log::warn!(
                "Failed to parse config at {}: {}. Using defaults.",
                config_path.display(),
                e
            );
            SpecForgeConfig::default()
        }),
        Err(_) => SpecForgeConfig::default(),
    }
}

/// Save the global config to `config_dir()/config.toml`.
/// Creates the config directory if it doesn't exist.
pub fn save_config(config: &SpecForgeConfig) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create config directory {}: {}", dir.display(), e))?;

    let config_path = dir.join(CONFIG_FILE_NAME);
    let toml_str = toml::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&config_path, toml_str)
        .map_err(|e| format!("Failed to write config to {}: {}", config_path.display(), e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_dir_returns_valid_path() {
        let dir = config_dir();
        // Should end with "specforge"
        assert_eq!(
            dir.file_name().and_then(|n| n.to_str()),
            Some(APP_DIR_NAME)
        );
    }

    #[test]
    fn test_data_dir_returns_valid_path() {
        let dir = data_dir();
        assert_eq!(
            dir.file_name().and_then(|n| n.to_str()),
            Some(APP_DIR_NAME)
        );
    }

    #[test]
    fn test_cache_dir_returns_valid_path() {
        let dir = cache_dir();
        assert_eq!(
            dir.file_name().and_then(|n| n.to_str()),
            Some(APP_DIR_NAME)
        );
    }

    #[test]
    fn test_save_and_load_config_roundtrip() {
        use crate::local_models::config::AgentConfig;

        // Use a temp directory to avoid polluting real config
        let tmp = tempfile::tempdir().expect("create temp dir");
        let config_path = tmp.path().join(CONFIG_FILE_NAME);

        let config = SpecForgeConfig {
            agent: AgentConfig {
                command: "test-agent".to_string(),
                args: vec!["--test".to_string()],
                max_concurrent_agents: 7,
            },
        };

        // Write config to temp file
        let toml_str = toml::to_string_pretty(&config).expect("serialize");
        std::fs::write(&config_path, &toml_str).expect("write");

        // Read it back
        let contents = std::fs::read_to_string(&config_path).expect("read");
        let loaded: SpecForgeConfig = toml::from_str(&contents).expect("deserialize");

        assert_eq!(loaded.agent.command, "test-agent");
        assert_eq!(loaded.agent.max_concurrent_agents, 7);
        assert_eq!(loaded.agent.args, vec!["--test"]);
    }

    #[test]
    fn test_load_config_returns_default_when_missing() {
        // load_config gracefully returns defaults when file doesn't exist
        let config = load_config();
        assert_eq!(config.agent.command, "claude");
    }
}
