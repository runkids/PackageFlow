<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="100" height="100">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>🚀 Stop juggling terminals.</strong><br/>
  <sub>Run scripts, manage Git, switch worktrees, and deploy with preview links — all in one beautiful app.</sub>
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">
    <img src="https://img.shields.io/github/v/release/runkids/PackageFlow?style=flat-square&color=blue" alt="Release">
  </a>
  <a href="https://github.com/runkids/PackageFlow/stargazers">
    <img src="https://img.shields.io/github/stars/runkids/PackageFlow?style=flat-square&color=yellow" alt="Stars">
  </a>
  <a href="https://github.com/runkids/PackageFlow/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/runkids/PackageFlow?style=flat-square" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square&logo=apple" alt="macOS">
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=rust,tauri,react,ts,tailwind" alt="Tech Stack" />
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">📥 Download</a> •
  <a href="#-features">✨ Features</a> •
  <a href="#-screenshots">📸 Screenshots</a> •
  <a href="#-roadmap">🗺️ Roadmap</a> •
  <a href="#-faq">❓ FAQ</a>
</p>

<p align="center">
  <a href="./README.zh-TW.md">繁體中文</a> •
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## 📍 Why PackageFlow?

Tired of switching between terminals, Git GUIs, and deployment dashboards?

PackageFlow brings your `package.json` to life — a single app that handles everything a frontend developer does daily. Built with **Tauri + Rust** for a tiny binary and instant startup.

Perfect for **vibe coding**: less terminal chaos, more building cool stuff.

## 🎬 Quick Start

1. **Download** → [Get PackageFlow for macOS](https://github.com/runkids/PackageFlow/releases)
2. **Open a project** → Drag any folder with `package.json` into the app
3. **Start using** → Click any script card to run it!

> 💡 **Pro tip**: Press <kbd>Cmd</kbd>+<kbd>K</kbd> to quickly switch between worktrees

## ✨ Features

| | Feature | Description |
|:---:|---------|-------------|
| 🎯 | **One-Click Scripts** | Run npm scripts from cards with live PTY terminal output |
| 🔀 | **Git Powerhouse** | Full Git operations: commit, branch, stash, diff viewer |
| 🌳 | **Worktree Magic** | Visual management, <kbd>Cmd</kbd>+<kbd>K</kbd> quick switch, session context |
| 🚀 | **Instant Deploy** | One-click deploy to Netlify/Cloudflare with instant preview links |
| 📦 | **Monorepo Ready** | Auto-detect Nx/Turborepo, workspace view, dependency graph |
| 🔧 | **Toolchain Smart** | Auto-detect Volta/Corepack version conflicts |
| 🛡️ | **Security Scan** | Visual npm audit with one-click fixes |
| ⚡ | **Visual Workflow** | Drag-and-drop automation builder with webhook triggers |

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="720" alt="Deploy demo" />
  <br/>
  <em>👆 One-click deploy, instant preview link</em>
</p>

## 📸 Screenshots

<details>
<summary>🎯 Projects + Scripts</summary>
<br/>
<img src="docs/screenshots/screenshot001.png" width="800" alt="Projects and Scripts" />
</details>

<details>
<summary>📦 Monorepo Action</summary>
<br/>
<img src="docs/screenshots/screenshot002.png" width="800" alt="Monorepo Action" />
</details>

<details>
<summary>🔗 Dependency Graph</summary>
<br/>
<img src="docs/screenshots/screenshot003.png" width="800" alt="Dependency Graph" />
</details>

<details>
<summary>💻 Terminals</summary>
<br/>
<img src="docs/screenshots/screenshot004.png" width="800" alt="Terminals" />
</details>

<details>
<summary>🔀 Git Integration</summary>
<br/>
<img src="docs/screenshots/screenshot005.png" width="800" alt="Git Integration" />
</details>

<details>
<summary>📋 Step Templates</summary>
<br/>
<img src="docs/screenshots/screenshot006.png" width="800" alt="Step Templates" />
</details>

<details>
<summary>🛡️ Security Audit</summary>
<br/>
<img src="docs/screenshots/screenshot007.png" width="800" alt="Security Audit" />
</details>

<details>
<summary>🔌 Webhooks</summary>
<br/>
<img src="docs/screenshots/screenshot008.png" width="800" alt="Webhooks" />
</details>

<details>
<summary>⚡ Visual Workflow</summary>
<br/>
<img src="docs/screenshots/screenshot009.png" width="800" alt="Visual Workflow" />
</details>

<details>
<summary>🚀 Deploy Accounts</summary>
<br/>
<img src="docs/screenshots/screenshot011.png" width="800" alt="Deploy Accounts" />
</details>

<details>
<summary>⌨️ Keyboard Shortcuts</summary>
<br/>
<img src="docs/screenshots/screenshot012.png" width="800" alt="Keyboard Shortcuts" />
</details>

## 📦 Installation

### Homebrew (macOS)

```bash
brew tap runkids/tap
brew install --cask packageflow
```

#### Upgrade

```bash
brew update
brew upgrade --cask packageflow
```

### Manual Download

Download the latest release from the [Releases](https://github.com/runkids/PackageFlow/releases) page.

## 🗺️ Roadmap

We're actively working on these features:

- [ ] 🪟 **Windows Support** — Cross-platform expansion
- [ ] 🐧 **Linux Support** — Complete desktop coverage
- [ ] 🤖 **AI Integration** — Local LLM & AI CLI (Claude Code, Codex, Gemini)
- [ ] 🔌 **MCP Server** — Let AI tools control PackageFlow
- [ ] 📦 **Plugin System** — Custom extensions

> 💡 Have a feature idea? [Open an issue!](https://github.com/runkids/PackageFlow/issues)

## ❓ FAQ

<details>
<summary><strong>Q: How is PackageFlow different from VS Code terminal?</strong></summary>
<br/>

PackageFlow focuses on visualization and efficiency:
- 🎯 One-click script execution, no commands to remember
- 👁️ All scripts visible at a glance
- 🚀 Integrated deployment with instant preview links
- 🌳 Visual worktree management

</details>

<details>
<summary><strong>Q: Which operating systems are supported?</strong></summary>
<br/>

Currently supports **macOS** (Apple Silicon & Intel).
Windows and Linux support is in development!

</details>

<details>
<summary><strong>Q: Where is my data stored? Is it secure?</strong></summary>
<br/>

All data is stored locally (`~/Library/Application Support/PackageFlow`).
Nothing is uploaded to any server. 100% local-first design.

</details>

<details>
<summary><strong>Q: Does it work with Monorepos?</strong></summary>
<br/>

Yes! Auto-detects **Nx** and **Turborepo**,
displays workspace structure and dependency graphs.

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

## ⭐ Star History

<p align="center">
  <a href="https://star-history.com/#runkids/PackageFlow&Date">
    <img src="https://api.star-history.com/svg?repos=runkids/PackageFlow&type=Date" alt="Star History Chart" width="600" />
  </a>
</p>

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) — Amazing cross-platform framework
- [React Flow](https://reactflow.dev/) — Workflow visualization
- [Lucide](https://lucide.dev/) — Beautiful icons
- [Claude Code](https://claude.ai/code) — AI-powered development assistance

---

<p align="center">
  <strong>Like this project?</strong><br/>
  ⭐ Star us = Huge support!<br/><br/>
  <a href="https://github.com/runkids/PackageFlow">
    <img src="https://img.shields.io/github/stars/runkids/PackageFlow?style=social" alt="GitHub stars" />
  </a>
</p>

<p align="center">
  Made with ❤️ by <a href="https://github.com/runkids">runkids</a>
</p>
