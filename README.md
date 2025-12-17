<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="120" height="120">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>The AI-Driven <code>package.json</code> Project Manager</strong><br/>
  <sub>Turn scripts, Git, workflows, deploys, and MCP tools into one-click actions.</sub>
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">
    <img src="https://img.shields.io/github/v/release/runkids/PackageFlow?style=for-the-badge&color=blue" alt="Release">
  </a>
  <a href="https://github.com/runkids/PackageFlow/stargazers">
    <img src="https://img.shields.io/github/stars/runkids/PackageFlow?style=for-the-badge&color=yellow" alt="Stars">
  </a>
  <a href="https://github.com/runkids/PackageFlow/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/runkids/PackageFlow?style=for-the-badge" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey?style=for-the-badge&logo=apple" alt="macOS">
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=rust,tauri,react,ts,tailwind" alt="Tech Stack" />
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases"><strong>📥 Download</strong></a> •
  <a href="#-features"><strong>✨ Features</strong></a> •
  <a href="#-ai--mcp-integration"><strong>🤖 AI & MCP</strong></a> •
  <a href="#-documentation"><strong>📚 Docs</strong></a> •
  <a href="#-screenshots"><strong>📸 Screenshots</strong></a> •
  <a href="#-faq"><strong>❓ FAQ</strong></a>
</p>

<p align="center">
  <a href="./README.zh-TW.md">繁體中文</a> •
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="720" alt="PackageFlow Hero" />
</p>

<!-- TODO: Add a 20–40s product demo video link (YouTube/X) and/or a thumbnail image here. -->

---

## Why PackageFlow?

> **"Claude, deploy my feature branch."**
> **"Run tests and fix any failures."**
> **"Switch to the main branch and start the dev server."**

**PackageFlow is an AI-driven <code>package.json</code> project management tool — a single control center for how you build, ship, and automate.**

| Before PackageFlow | With PackageFlow |
|-------------------|------------------|
| Terminal juggling | One-click scripts |
| Manual deployments | Instant preview links |
| Command memorization | Visual workflows |
| AI can't touch your tools | **MCP Server lets AI control everything** |

Powered by **Tauri + Rust** — lightweight, fast startup, local-first by design.

## 🎬 Quick Start

```bash
# Install via Homebrew
brew tap runkids/tap && brew install --cask packageflow
```

Or [download directly](https://github.com/runkids/PackageFlow/releases) → Drag a project folder → Start clicking.

> 💡 Press <kbd>Cmd</kbd> + <kbd>K</kbd> for instant worktree switching

### Try It in 60 Seconds

1. Import a project (drag a folder with `package.json`)
2. Click a script card like `dev` / `build` / `test`
3. Create a workflow for your repetitive tasks (dev → test → deploy)
4. (Optional) Enable MCP so your AI tool can run actions for you

### Common Use Cases

- One-click “dev / build / test” across many repos
- Worktree switching without losing context
- Repeatable release pipelines (test → build → deploy)
- Fast security audits with AI explanations
- “AI as teammate” via MCP tool calls (safe + permissioned)

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎯 One-Click Everything
Run scripts, workflows, deploys — no commands to memorize.

### ⚡ Visual Workflow Builder
Drag-and-drop automation with conditional steps.

### 🚀 Instant Deploy
One click → live preview link on Netlify or Cloudflare.

### 📦 Monorepo-Native
Nx, Turborepo, Lerna — auto-detected and ready.

</td>
<td width="50%">

### 🔀 Git Without CLI
Commit, branch, stash, diff — all visual, all easy.

### 🌳 Worktree Superpowers
See all worktrees, switch instantly, resume sessions.

### 🛡️ Security Scanner
Visual npm audit with AI-powered analysis.

### 🔧 Toolchain Detective
Auto-detect Volta, Corepack, nvm conflicts.

</td>
</tr>
</table>

---

## 🤖 AI & MCP Integration

<p align="center">
  <img src="docs/screenshots/commit-message-generated-by-AI.gif" width="720" alt="AI Commit Message" />
  <br/>
  <em>AI generates commit messages from your diffs</em>
</p>

### Multi-Provider AI Support

| Provider | Type | Use Case |
|----------|------|----------|
| **OpenAI** | Cloud | Complex analysis |
| **Anthropic** | Cloud | Claude for intelligent commits |
| **Google** | Cloud | Gemini for fast responses |
| **Ollama** | Local | Privacy-first, unlimited |
| **LM Studio** | Local | Custom models, no API costs |

### MCP Server — Let AI Control Your Dev Environment

PackageFlow exposes a **Model Context Protocol (MCP) server** that AI assistants can use:

```
"Claude, deploy my feature branch to staging."
"Run tests for all projects and report failures."
"Switch to the payment-fix worktree and start the dev server."
```

**Works with:**
- Claude Code
- Codex CLI
- Gemini CLI
- Any MCP-compatible AI tool

### What AI Actually Does (MCP Tool Chains)

PackageFlow is “AI-driven” because the AI can call real tools (not just generate text). Example flows:

**1) Understand a project**
- You: “List my projects and show scripts for the frontend repo”
- Tools: `list_projects` → `get_project`

**2) Run a script with context**
- You: “Run tests for the `packages/web` project and summarize failures”
- Tools: `get_project` → `run_npm_script`

**3) Generate a commit message from staged changes**
- You: “Write a conventional commit message for what I staged”
- Tools: `get_git_diff` → (AI drafts message)

### MCP Setup (Copy/Paste)

PackageFlow ships a companion MCP server binary: `packageflow-mcp` (stdio transport).

In PackageFlow, open **Settings → MCP → MCP Integration** and copy the generated config for:
- **Claude Code / VS Code** (JSON)
- **Codex CLI** (TOML)

Then your AI tool can call actions like `list_projects`, `run_npm_script`, `run_workflow`, and more.

<!-- TODO: Add screenshot of Settings → MCP → MCP Integration (showing JSON/TOML copy buttons). -->

### AI CLI Integration

Run AI commands directly from PackageFlow:

```
You: "Analyze the security audit results and suggest fixes"
AI: Analyzing 3 high-severity vulnerabilities...
```

**Security First:**
- All API keys encrypted with AES-256-GCM
- Permission levels: Read Only → Confirm → Full Access
- Fine-grained tool permissions
- Complete request logging

### Security & Privacy (Local-First)

PackageFlow is designed to keep your projects and secrets on your machine.

- Data stays local; AI features are opt-in
- Keys/tokens encrypted at rest
- MCP is permissioned (read → confirm → full)

Read more: [Security & Privacy](./docs/security-and-privacy.md)

---

## 📚 Documentation

<details>
<summary><strong>📖 Full Feature Documentation</strong></summary>

| Feature | Description |
|---------|-------------|
| [Getting Started](./docs/getting-started.md) | Installation and first steps |
| [Security & Privacy](./docs/security-and-privacy.md) | Local-first storage and permissions |
| [Troubleshooting](./docs/troubleshooting.md) | Common issues and fixes |
| [Project Management](./docs/features/project-management.md) | Import and manage projects |
| [One-Click Scripts](./docs/features/one-click-scripts.md) | Run npm scripts with live terminal |
| [Visual Workflow](./docs/features/visual-workflow.md) | Drag-and-drop automation |
| [Monorepo Support](./docs/features/monorepo-support.md) | Nx, Turbo, Lerna integration |
| [Git Integration](./docs/features/git-integration.md) | Visual Git operations |
| [Worktree Management](./docs/features/worktree-management.md) | Quick worktree switching |
| [One-Click Deploy](./docs/features/one-click-deploy.md) | Deploy to Netlify/Cloudflare |
| [Security Audit](./docs/features/security-audit.md) | Vulnerability scanning |
| [AI Integration](./docs/features/ai-integration.md) | Multi-provider AI support |
| [MCP Server](./docs/features/mcp-server.md) | AI tool integration |
| [Webhooks](./docs/features/webhooks.md) | Incoming/outgoing automation |
| [Toolchain Management](./docs/features/toolchain-management.md) | Node.js version management |
| [Keyboard Shortcuts](./docs/features/keyboard-shortcuts.md) | Complete shortcut reference |

</details>

---


## 📸 Screenshots

<details open>
<summary><strong>🎯 Projects + Scripts</strong></summary>
<br/>
<img src="docs/screenshots/screenshot001.png" width="800" alt="Projects and Scripts" />
</details>

<details>
<summary><strong>🌳 Worktrees</strong></summary>
<br/>
<img src="docs/screenshots/worktree.png" width="800" alt="Worktree Management" />
<!-- TODO: Add a short gif of Cmd+K quick switcher for worktrees. -->
</details>

<details>
<summary><strong>⚡ Visual Workflow Builder</strong></summary>
<br/>
<img src="docs/screenshots/screenshot009.png" width="800" alt="Visual Workflow" />
</details>

<details>
<summary><strong>📦 Monorepo Support</strong></summary>
<br/>
<img src="docs/screenshots/screenshot002.png" width="800" alt="Monorepo Action" />
</details>

<details>
<summary><strong>🔗 Dependency Graph</strong></summary>
<br/>
<img src="docs/screenshots/screenshot003.png" width="800" alt="Dependency Graph" />
</details>

<details>
<summary><strong>🔀 Git Integration</strong></summary>
<br/>
<img src="docs/screenshots/screenshot005.png" width="800" alt="Git Integration" />
</details>

<details>
<summary><strong>🛡️ Security Audit</strong></summary>
<br/>
<img src="docs/screenshots/screenshot007.png" width="800" alt="Security Audit" />
</details>

<details>
<summary><strong>🚀 Deploy Accounts</strong></summary>
<br/>
<img src="docs/screenshots/screenshot011.png" width="800" alt="Deploy Accounts" />
</details>

<details>
<summary><strong>💻 Terminals</strong></summary>
<br/>
<img src="docs/screenshots/screenshot004.png" width="800" alt="Terminals" />
</details>

<details>
<summary><strong>🔌 Webhooks</strong></summary>
<br/>
<img src="docs/screenshots/screenshot008.png" width="800" alt="Webhooks" />
</details>

## 📦 Installation

### Homebrew (Recommended)

```bash
brew tap runkids/tap
brew install --cask packageflow

# Upgrade
brew update && brew upgrade --cask packageflow
```

### Direct Download

[Download the latest release](https://github.com/runkids/PackageFlow/releases) → Open the `.dmg` → Drag to Applications.

---

## 🗺️ Roadmap

### Recently Shipped

- [x] **Multi-Provider AI** — OpenAI, Anthropic, Google, Ollama, LM Studio
- [x] **MCP Server** — Let AI assistants control PackageFlow
- [x] **AI CLI Integration** — Claude Code, Codex, Gemini CLI
- [x] **AI Security Analysis** — Intelligent vulnerability explanations
- [x] **Notification Center** — Background task monitoring
- [x] **System Theme** — Auto light/dark mode

### Coming Soon

- [ ] 🪟 **Windows Support** — Cross-platform expansion
- [ ] 🐧 **Linux Support** — Complete desktop coverage
- [ ] 📦 **Plugin System** — Community extensions
- [ ] 🔄 **MCP Actions** — Custom AI-triggered workflows
- [ ] 🌐 **Remote Collaboration** — Team workflow sharing

> 💡 [Request a feature](https://github.com/runkids/PackageFlow/issues) or vote on existing ones!

## ❓ FAQ

<details>
<summary><strong>How is this different from VS Code terminal?</strong></summary>
<br/>

PackageFlow is about **flow**, not terminals:

- One-click actions for everything
- Visual workflow builder
- Built-in deploy with preview links
- **AI assistants can control it via MCP**
- No extension sprawl — everything integrated

</details>

<details>
<summary><strong>Is my data safe?</strong></summary>
<br/>

**100% local-first.**

- All data stays on your machine
- API keys encrypted with AES-256-GCM
- No tracking, no telemetry
- AI features are opt-in
- MCP permissions are granular

</details>

<details>
<summary><strong>What AI providers are supported?</strong></summary>
<br/>

**Cloud:** OpenAI, Anthropic (Claude), Google (Gemini)
**Local:** Ollama, LM Studio — unlimited, private, free

Use local models for sensitive code. Use cloud for convenience.

</details>

<details>
<summary><strong>What is MCP and why should I care?</strong></summary>
<br/>

**Model Context Protocol (MCP)** is how AI assistants talk to tools.

With PackageFlow's MCP server:
- Claude Code can deploy your projects
- AI can run scripts and workflows
- Voice-controlled development becomes possible

It's like giving AI hands to help you code.

</details>

## 🛠 Development

### Prerequisites

- Node.js 18+
- Rust 1.70+
- pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/runkids/PackageFlow.git
cd PackageFlow

# Install dependencies
pnpm install

# Start Vite (web UI)
pnpm dev

# Start the desktop app
pnpm dev:tauri
```

### Build

```bash
# Build web assets
pnpm build

# Build the desktop app (dmg)
pnpm build:tauri
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Ways to Contribute

- 🐛 Report bugs and request features via [Issues](https://github.com/runkids/PackageFlow/issues)
- 🔧 Submit pull requests for bug fixes or new features
- 📝 Improve documentation
- 🔄 Share your workflow templates

### Development Guidelines

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 🙏 Acknowledgments

Built with amazing open-source tools:

[Tauri](https://tauri.app/) • [React Flow](https://reactflow.dev/) • [Lucide](https://lucide.dev/) • [Claude Code](https://claude.ai/code)

---

<p align="center">
  <a href="https://star-history.com/#runkids/PackageFlow&Date">
    <img src="https://api.star-history.com/svg?repos=runkids/PackageFlow&type=Date" alt="Star History Chart" width="600" />
  </a>
</p>

---

<p align="center">
  <strong>If PackageFlow saves you time, give us a star!</strong><br/><br/>
  <a href="https://github.com/runkids/PackageFlow">
    <img src="https://img.shields.io/github/stars/runkids/PackageFlow?style=for-the-badge&logo=github&color=yellow" alt="GitHub stars" />
  </a>
</p>

<p align="center">
  <sub>MIT License • Made by <a href="https://github.com/runkids">runkids</a></sub>
</p>
