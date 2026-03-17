// Global configuration model for SpecForge
// Stores user-level settings like AI agent command preferences

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecForgeConfig {
    #[serde(default)]
    pub agent: AgentConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// The agent CLI command (e.g., "claude", "codex", "gemini")
    #[serde(default = "default_agent_command")]
    pub command: String,

    /// Arguments template. Use {prompt} as placeholder for the rendered prompt.
    #[serde(default = "default_agent_args")]
    pub args: Vec<String>,

    /// Maximum number of concurrent agent processes
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_agents: u32,
}

fn default_agent_command() -> String {
    "claude".to_string()
}

fn default_agent_args() -> Vec<String> {
    vec![
        "-p".to_string(),
        "{prompt}".to_string(),
        "--allowedTools".to_string(),
        "mcp__specforge__*".to_string(),
    ]
}

fn default_max_concurrent() -> u32 {
    3
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            command: default_agent_command(),
            args: default_agent_args(),
            max_concurrent_agents: default_max_concurrent(),
        }
    }
}

impl Default for SpecForgeConfig {
    fn default() -> Self {
        Self {
            agent: AgentConfig::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SpecForgeConfig::default();
        assert_eq!(config.agent.command, "claude");
        assert_eq!(config.agent.max_concurrent_agents, 3);
        assert_eq!(config.agent.args.len(), 4);
        assert_eq!(config.agent.args[0], "-p");
        assert_eq!(config.agent.args[1], "{prompt}");
    }

    #[test]
    fn test_config_roundtrip_toml() {
        let config = SpecForgeConfig {
            agent: AgentConfig {
                command: "codex".to_string(),
                args: vec!["--flag".to_string(), "{prompt}".to_string()],
                max_concurrent_agents: 5,
            },
        };

        let toml_str = toml::to_string_pretty(&config).expect("serialize");
        let deserialized: SpecForgeConfig = toml::from_str(&toml_str).expect("deserialize");

        assert_eq!(deserialized.agent.command, "codex");
        assert_eq!(deserialized.agent.max_concurrent_agents, 5);
        assert_eq!(deserialized.agent.args, vec!["--flag", "{prompt}"]);
    }

    #[test]
    fn test_deserialize_partial_config() {
        // Missing fields should use defaults
        let toml_str = r#"
[agent]
command = "gemini"
"#;
        let config: SpecForgeConfig = toml::from_str(toml_str).expect("deserialize");
        assert_eq!(config.agent.command, "gemini");
        // Defaults applied for missing fields
        assert_eq!(config.agent.max_concurrent_agents, 3);
        assert_eq!(config.agent.args[0], "-p");
    }

    #[test]
    fn test_deserialize_empty_config() {
        let toml_str = "";
        let config: SpecForgeConfig = toml::from_str(toml_str).expect("deserialize");
        assert_eq!(config.agent.command, "claude");
        assert_eq!(config.agent.max_concurrent_agents, 3);
    }
}
