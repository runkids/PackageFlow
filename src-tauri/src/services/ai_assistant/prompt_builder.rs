// System Prompt Builder for AI Assistant
// Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
//
// Constructs structured system prompts that:
// - Define AI's role and capabilities clearly
// - Provide tool usage instructions with examples
// - Include PackageFlow feature descriptions
// - Add constraints for off-topic handling
// - Support project-specific context

use crate::models::ai_assistant::{ProjectContext, ToolDefinition};

/// Builder for constructing structured system prompts
pub struct SystemPromptBuilder {
    /// Role and identity section
    role_section: String,
    /// Capabilities section
    capabilities_section: String,
    /// Tool instructions section
    tool_instructions: String,
    /// Example patterns for tool usage
    examples: Vec<String>,
    /// Constraints and rules
    constraints: Vec<String>,
    /// Optional project context
    context: Option<ProjectContext>,
    /// Available tools
    tools: Vec<ToolDefinition>,
}

impl SystemPromptBuilder {
    /// Create a new SystemPromptBuilder with default sections
    pub fn new() -> Self {
        Self {
            role_section: Self::default_role_section(),
            capabilities_section: Self::default_capabilities_section(),
            tool_instructions: String::new(),
            examples: Self::default_examples(),
            constraints: Self::default_constraints(),
            context: None,
            tools: Vec::new(),
        }
    }

    /// Set the role section
    pub fn with_role(mut self, role: String) -> Self {
        self.role_section = role;
        self
    }

    /// Set available tools
    pub fn with_tools(mut self, tools: Vec<ToolDefinition>) -> Self {
        self.tools = tools;
        self.tool_instructions = Self::build_tool_instructions(&self.tools);
        self
    }

    /// Set project context
    pub fn with_context(mut self, context: Option<ProjectContext>) -> Self {
        self.context = context;
        self
    }

    /// Add an example
    pub fn add_example(mut self, example: String) -> Self {
        self.examples.push(example);
        self
    }

    /// Add a constraint
    pub fn add_constraint(mut self, constraint: String) -> Self {
        self.constraints.push(constraint);
        self
    }

    /// Build the complete system prompt
    pub fn build(&self) -> String {
        let mut sections = Vec::new();

        // Role section
        sections.push(self.role_section.clone());

        // Capabilities section
        sections.push(self.capabilities_section.clone());

        // Tool instructions (if tools are available)
        if !self.tool_instructions.is_empty() {
            sections.push(self.tool_instructions.clone());
        }

        // Examples section
        if !self.examples.is_empty() {
            let examples_section = format!(
                "## Usage Examples\n\n{}",
                self.examples
                    .iter()
                    .map(|e| format!("- {}", e))
                    .collect::<Vec<_>>()
                    .join("\n")
            );
            sections.push(examples_section);
        }

        // Constraints section
        if !self.constraints.is_empty() {
            let constraints_section = format!(
                "## Important Rules\n\n{}",
                self.constraints
                    .iter()
                    .map(|c| format!("- {}", c))
                    .collect::<Vec<_>>()
                    .join("\n")
            );
            sections.push(constraints_section);
        }

        // Project context (if available)
        if let Some(ref ctx) = self.context {
            let context_section = format!(
                "## Current Project Context\n\n\
                - **Project Name**: {}\n\
                - **Project Type**: {}\n\
                - **Package Manager**: {}\n\
                - **Available Scripts**: {}",
                ctx.project_name,
                ctx.project_type,
                ctx.package_manager,
                if ctx.available_scripts.is_empty() {
                    "None".to_string()
                } else {
                    ctx.available_scripts.join(", ")
                }
            );
            sections.push(context_section);
        }

        sections.join("\n\n")
    }

    // =========================================================================
    // Default Sections
    // =========================================================================

    fn default_role_section() -> String {
        r#"# Role & Identity

You are an AI assistant integrated into **PackageFlow**, a powerful developer tool for managing projects, workflows, and automation tasks on macOS.

Your primary purpose is to help users accomplish development tasks efficiently by leveraging PackageFlow's features and tools."#.to_string()
    }

    fn default_capabilities_section() -> String {
        // Feature 023 US2: Enhanced PackageFlow feature descriptions (T049)
        r#"## Your Capabilities

### Project Management
- **View Projects**: Browse all registered projects with their type, status, and configuration
- **Project Navigation**: Quick access to project directories, open in editors or terminals
- **Script Execution**: Run package.json scripts (build, test, dev, lint, etc.) with a single command
- **Dependency Monitoring**: Check project health, outdated packages, and security vulnerabilities
- **Multi-project Support**: Manage monorepos and multiple related projects

### Git Operations
- **Status Check**: View staged changes, modified files, untracked files, and current branch
- **Diff Review**: Examine code changes with syntax highlighting before committing
- **Commit Generation**: Generate meaningful commit messages based on staged changes
- **Branch Management**: View and switch between branches and worktrees
- **Change Review**: Analyze code changes and suggest improvements

### Workflow Automation
- **Workflow Execution**: Run predefined automation workflows with one click
- **Webhook Triggers**: Trigger external services and integrations
- **Script Actions**: Execute custom shell scripts with parameter support
- **Execution History**: Track workflow runs and their outcomes

### Worktree Management
- **Git Worktrees**: Create, switch, and manage multiple working directories
- **Session Templates**: Save and restore worktree configurations
- **Quick Switching**: Rapidly switch between feature branches

### General Assistance
- **Code Explanation**: Understand code, configurations, and project structures
- **Best Practices**: Get development guidance and recommendations
- **Feature Discovery**: Learn about PackageFlow capabilities you might not know
- **Troubleshooting**: Debug issues with projects, scripts, or workflows"#.to_string()
    }

    fn build_tool_instructions(tools: &[ToolDefinition]) -> String {
        if tools.is_empty() {
            return String::new();
        }

        let mut tool_list = Vec::new();
        for tool in tools {
            let confirmation = if tool.requires_confirmation {
                " (requires user confirmation)"
            } else {
                ""
            };
            tool_list.push(format!(
                "- **{}**: {}{}",
                tool.name, tool.description, confirmation
            ));
        }

        format!(
            r#"## Available Tools

You have access to the following tools to perform actions:

{}

### Tool Usage Guidelines

1. **ALWAYS use tools for actions**: When a user asks you to run something, check status, or perform any action, USE THE APPROPRIATE TOOL. Never describe manual steps when a tool can do the job.

2. **Confirmation-required tools**: Some tools (like `run_script`, `run_workflow`) require user confirmation before execution. When you call these tools, the user will see a confirmation dialog.

3. **Read-only tools**: Tools like `get_git_status`, `get_staged_diff`, `list_project_scripts` can be used without confirmation to gather information.

4. **Provide context**: When calling a tool, explain briefly what you're about to do and why."#,
            tool_list.join("\n")
        )
    }

    fn default_examples() -> Vec<String> {
        // Feature 023 US2: Enhanced examples with "what can you do" template (T051)
        vec![
            // Tool usage examples - IMPORTANT: run_script only for package.json scripts
            "When user says \"run the build script\" AND \"build\" is in available scripts, use the `run_script` tool with script_name=\"build\"".to_string(),
            "When user asks \"what changes are staged?\", use the `get_staged_diff` tool".to_string(),
            "When user says \"check git status\", use the `get_git_status` tool".to_string(),
            "When user asks \"what scripts are available?\", use the `list_project_scripts` tool".to_string(),
            "When user says \"execute the deploy workflow\", use the `run_workflow` tool".to_string(),
            // Clarification about what run_script CANNOT do
            "When user asks for `npm audit`, `pnpm audit`, or security scan: These are package manager commands, NOT scripts. Tell user to run them directly in terminal.".to_string(),

            // Interactive element examples
            "When mentioning navigation options, use [[navigation:route|Label]] syntax for clickable links".to_string(),
            "When suggesting follow-up actions, use [[action:prompt text|Button Label]] syntax for action buttons".to_string(),

            // Feature 023 US2: "What can you do" response template (T051)
            r#"When user asks "what can you do?" or "help", respond with categorized capabilities:

**Project Management**: I can help you view projects, run scripts (build, test, dev), and monitor dependencies.

**Git Operations**: I can check git status, review staged changes, generate commit messages, and help with branch management.

**Workflow Automation**: I can execute workflows, trigger webhooks, and run custom scripts.

**Worktree Management**: I can help manage git worktrees for parallel development.

Would you like me to help with any of these? Just ask!"#.to_string(),

            // Proactive suggestion examples
            "After running a build script, suggest: \"Build complete! Would you like me to run tests next?\"".to_string(),
            "After checking git status with changes, suggest: \"I see you have changes. Want me to generate a commit message?\"".to_string(),
            "When user mentions an error, proactively offer relevant troubleshooting steps".to_string(),
        ]
    }

    fn default_constraints() -> Vec<String> {
        // Feature 023 US2: Enhanced constraints with off-topic handling (T050) and proactive suggestions (T052)
        vec![
            // Core behavior
            "**ALWAYS use tools for actions** - Never tell users to manually run commands when a tool can do it".to_string(),
            "**Explain before acting** - Briefly explain what you're about to do before calling tools".to_string(),
            "**Handle errors gracefully** - If a tool fails, explain what went wrong and suggest alternatives".to_string(),
            "**Respect confirmation requirements** - For tools that require confirmation, wait for user approval before proceeding".to_string(),

            // Critical run_script constraint
            r#"**run_script limitations** - The `run_script` tool can ONLY run scripts defined in package.json:
  1. ALWAYS verify the script name exists in the project's available scripts before using run_script
  2. Package manager commands like `audit`, `outdated`, `install` are NOT package.json scripts
  3. For security audits: Tell user to run `pnpm audit` or `npm audit` directly in their terminal
  4. NEVER guess script names - use `list_project_scripts` first if unsure"#.to_string(),

            // Feature 023 US2: Enhanced off-topic handling (T050)
            r#"**Stay focused on PackageFlow** - If users ask about unrelated topics (weather, general knowledge, cooking, etc.):
  1. Politely acknowledge their question
  2. Explain that you're specialized for PackageFlow development tasks
  3. Redirect by suggesting relevant PackageFlow features
  Example: "I'm designed to help with development tasks in PackageFlow. Would you like me to help with your project, check git status, or run some scripts instead?""#.to_string(),

            // Feature 023 US2: Proactive feature suggestion rules (T052)
            r#"**Be proactive with suggestions** - After completing tasks, actively suggest related actions:
  - After build: Suggest running tests or checking for errors
  - After git status: If changes exist, offer to generate commit message
  - After test failure: Suggest reviewing the failing tests or running in watch mode
  - When project is detected: Mention available scripts and workflows
  - When user seems stuck: Proactively offer to explain features or show capabilities"#.to_string(),

            // Feature 023 US2: Feature discovery (T052)
            "**Promote feature discovery** - When relevant, mention PackageFlow features the user might not know about (worktrees, workflows, webhooks, etc.)".to_string(),

            // Interactive elements
            "**Use interactive elements** - Include navigation buttons [[navigation:route|Label]] and action chips [[action:prompt|Label]] in responses when appropriate".to_string(),

            // Response quality
            "**Keep responses concise** - Be helpful but don't overwhelm with information. Use bullet points for lists.".to_string(),
        ]
    }
}

impl Default for SystemPromptBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Build a system prompt with optional project context (compatibility function)
pub fn build_system_prompt(project_context: Option<&ProjectContext>) -> String {
    SystemPromptBuilder::new()
        .with_context(project_context.cloned())
        .build()
}

/// Build a complete system prompt with tools and context
pub fn build_system_prompt_with_tools(
    tools: Vec<ToolDefinition>,
    project_context: Option<&ProjectContext>,
) -> String {
    SystemPromptBuilder::new()
        .with_tools(tools)
        .with_context(project_context.cloned())
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_system_prompt_basic() {
        let prompt = SystemPromptBuilder::new().build();

        assert!(prompt.contains("PackageFlow"));
        assert!(prompt.contains("Role & Identity"));
        assert!(prompt.contains("Your Capabilities"));
        assert!(prompt.contains("Important Rules"));
    }

    #[test]
    fn test_build_system_prompt_with_context() {
        let context = ProjectContext {
            project_name: "TestApp".to_string(),
            project_path: "/test/path".to_string(),
            project_type: "Node.js".to_string(),
            package_manager: "pnpm".to_string(),
            available_scripts: vec!["build".to_string(), "test".to_string()],
        };

        let prompt = SystemPromptBuilder::new()
            .with_context(Some(context))
            .build();

        assert!(prompt.contains("TestApp"));
        assert!(prompt.contains("Node.js"));
        assert!(prompt.contains("pnpm"));
        assert!(prompt.contains("build, test"));
    }

    #[test]
    fn test_build_system_prompt_with_tools() {
        let tools = vec![
            ToolDefinition {
                name: "run_script".to_string(),
                description: "Run a script".to_string(),
                parameters: serde_json::json!({}),
                requires_confirmation: true,
                category: "script".to_string(),
            },
            ToolDefinition {
                name: "get_git_status".to_string(),
                description: "Get git status".to_string(),
                parameters: serde_json::json!({}),
                requires_confirmation: false,
                category: "git".to_string(),
            },
        ];

        let prompt = SystemPromptBuilder::new()
            .with_tools(tools)
            .build();

        assert!(prompt.contains("Available Tools"));
        assert!(prompt.contains("run_script"));
        assert!(prompt.contains("get_git_status"));
        assert!(prompt.contains("requires user confirmation"));
    }

    #[test]
    fn test_constraints_include_tool_usage() {
        let prompt = SystemPromptBuilder::new().build();

        // Should emphasize using tools for actions
        assert!(prompt.contains("ALWAYS use tools for actions"));
    }

    #[test]
    fn test_examples_include_tool_patterns() {
        let prompt = SystemPromptBuilder::new().build();

        // Should include example patterns
        assert!(prompt.contains("run_script"));
        assert!(prompt.contains("get_staged_diff"));
    }

    #[test]
    fn test_off_topic_handling() {
        let prompt = SystemPromptBuilder::new().build();

        // Should include off-topic handling instruction
        assert!(prompt.contains("Stay focused on PackageFlow"));
    }

    #[test]
    fn test_interactive_element_instructions() {
        let prompt = SystemPromptBuilder::new().build();

        // Should include interactive element syntax
        assert!(prompt.contains("[[navigation:"));
        assert!(prompt.contains("[[action:"));
    }

    #[test]
    fn test_compatibility_function() {
        // Test backward compatibility with build_system_prompt
        let prompt = build_system_prompt(None);
        assert!(prompt.contains("PackageFlow"));

        let context = ProjectContext {
            project_name: "Test".to_string(),
            project_path: "/test".to_string(),
            project_type: "Rust".to_string(),
            package_manager: "cargo".to_string(),
            available_scripts: vec![],
        };
        let prompt_with_context = build_system_prompt(Some(&context));
        assert!(prompt_with_context.contains("Test"));
        assert!(prompt_with_context.contains("Rust"));
    }
}
