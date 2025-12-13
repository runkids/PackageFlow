<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>Stop juggling terminals. Automate your dev workflow visually.</strong>
</p>

<p align="center">
  <a href="#why-packageflow">Why PackageFlow</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#development">Development</a>
</p>

<p align="center">
  <a href="./README.zh-TW.md">繁體中文</a> •
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## Why PackageFlow?

**The Problem:** You're a frontend developer juggling multiple terminals, switching between Git commands, running build scripts, managing worktrees, and checking security audits. Context switching kills your productivity.

**The Solution:** PackageFlow is a lightweight desktop app that puts everything in one place—with a visual workflow builder that lets you automate repetitive tasks without writing scripts.

### What Makes It Different

| Feature | Traditional Tools | PackageFlow |
|---------|------------------|-------------|
| **Git Worktree** | CLI-only, hard to visualize | Visual management with quick switcher |
| **Task Automation** | Shell scripts, CI/CD | Drag-and-drop workflow builder |
| **Monorepo** | Separate CLI tools | Unified UI for Nx & Turborepo |
| **Security Audit** | Manual `npm audit` | One-click scan with history |

Built with **Tauri + Rust** = Fast, lightweight (~15MB), no Electron bloat.

## Features

### Visual Workflow Automation
Create and execute custom workflows with a drag-and-drop visual editor. Chain multiple tasks together, set up webhooks for notifications, and trigger workflows from other workflows.

- Drag-and-drop workflow builder
- Real-time execution output
- Webhook notifications (Slack, Discord, custom)
- Workflow templates for common tasks
- Pause/resume execution

### Git Integration
Comprehensive Git management without leaving the app.

- Stage/unstage files with visual diff viewer
- Commit with syntax-highlighted previews
- Branch management (create, switch, delete)
- Stash management
- Remote operations (push, pull, fetch)
- Rebase support

### Git Worktree Management
Work on multiple branches simultaneously with Git worktrees.

- Create and manage worktrees
- Quick switcher (<kbd>Cmd</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd>)
- Status badges showing changes
- Open in your preferred IDE (VS Code, Cursor, Zed)
- Worktree templates

### Monorepo Support
First-class support for Nx and Turborepo workspaces.

- Auto-detect monorepo tools
- Run targets across packages
- Dependency graph visualization
- Cache management
- Batch script execution

### Security Audit
Keep your dependencies secure with built-in vulnerability scanning.

- npm audit / Snyk integration
- Vulnerability severity breakdown
- CVSS scores and CVE details
- Fix recommendations
- Scan history and reminders

### Terminal Integration
Full PTY terminal with session persistence.

- Interactive terminal sessions
- Auto-reconnect after refresh
- Output history preservation
- Multi-instance support

### Additional Features

- **Keyboard shortcuts** - Customizable shortcuts for common actions
- **iOS/Android build inspection** - Analyze IPA and APK files
- **Data export/import** - Backup and restore your configurations
- **Dark/Light theme** - Easy on the eyes, day or night

## Installation

### Homebrew (macOS)

```bash
brew tap runkids/tap
brew install --cask packageflow
```

#### Upgrade

```bash
brew update
brew reinstall --cask packageflow
```

### Manual Download

Download the latest release from the [Releases](https://github.com/runkids/PackageFlow/releases) page.

## Screenshots

<p align="center">
  <a href="docs/screenshots/screenshot001.png"><img src="docs/screenshots/screenshot001.png" width="280" alt="Screenshot 1"></a>
  <a href="docs/screenshots/screenshot002.png"><img src="docs/screenshots/screenshot002.png" width="280" alt="Screenshot 2"></a>
  <a href="docs/screenshots/screenshot003.png"><img src="docs/screenshots/screenshot003.png" width="280" alt="Screenshot 3"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot004.png"><img src="docs/screenshots/screenshot004.png" width="280" alt="Screenshot 4"></a>
  <a href="docs/screenshots/screenshot005.png"><img src="docs/screenshots/screenshot005.png" width="280" alt="Screenshot 5"></a>
  <a href="docs/screenshots/screenshot006.png"><img src="docs/screenshots/screenshot006.png" width="280" alt="Screenshot 6"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot007.png"><img src="docs/screenshots/screenshot007.png" width="280" alt="Screenshot 7"></a>
  <a href="docs/screenshots/screenshot008.png"><img src="docs/screenshots/screenshot008.png" width="280" alt="Screenshot 8"></a>
  <a href="docs/screenshots/screenshot009.png"><img src="docs/screenshots/screenshot009.png" width="280" alt="Screenshot 9"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot010.png"><img src="docs/screenshots/screenshot010.png" width="280" alt="Screenshot 10"></a>
</p>

<p align="center"><em>Click on any image to view full size</em></p>

## Development

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

# Start development
pnpm tauri dev
```

### Build

```bash
# Build for production
pnpm tauri build
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Ways to Contribute

- Report bugs and request features via [Issues](https://github.com/runkids/PackageFlow/issues)
- Submit pull requests for bug fixes or new features
- Improve documentation
- Share your workflow templates

### Development Guidelines

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing cross-platform framework
- [React Flow](https://reactflow.dev/) - For the workflow visualization
- [Lucide](https://lucide.dev/) - For the beautiful icons
- [Claude Code](https://claude.ai/code) - AI-powered development assistance

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/runkids">runkids</a>
</p>
