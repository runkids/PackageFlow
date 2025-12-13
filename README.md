<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>A desktop app for frontend & Node.js developers — manage scripts, Git, worktrees, and deploy with instant preview links.</strong>
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">Download</a> •
  <a href="#why-packageflow">Why</a> •
  <a href="#highlights">Highlights</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#installation">Installation</a> •
  <a href="#development">Development</a>
</p>

<p align="center">
  <a href="./README.zh-TW.md">繁體中文</a> •
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## Why PackageFlow?

PackageFlow brings your `package.json` to life. Run scripts, manage Git, switch worktrees, and deploy to get a shareable link—all from one app.

Great for vibe coding: less command-line, more building. Built with **Tauri + Rust** for a small binary and fast startup.

## Highlights

- **Scripts + Terminal**: Run npm scripts from cards with live PTY terminal output. Stop processes with port detection.
- **Toolchain Detection**: Detect Volta/Corepack version mismatches and run commands with correct versions.
- **Git Integration**: Status, staging, diff viewer, commit, branches, history, stashes, and worktree operations.
- **Worktrees + Sessions**: Manage worktrees visually, quick switch with <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>, save session context (goal/notes/checklist/tags) per worktree.
- **Monorepo Support**: Nx/Turborepo detection, workspaces view, and dependency graph.
- **Visual Workflows**: Drag-and-drop workflow builder with step templates, outgoing webhooks, and incoming webhook triggers.
- **Deploy + Preview**: Deploy via Netlify/Cloudflare Pages and get a shareable preview link instantly. Supports history and multiple accounts.
- **Security Audits**: Run scans, view severity breakdowns, set reminders, quick fixes for uninstalled dependencies.
- **Local-first**: All data stored locally (Tauri store). Export/import supported. Includes IPA/APK inspection tools.

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="620" alt="Deploy demo" />
</p>

## Installation

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

## Screenshots

<table align="center">
  <tr>
    <td align="center">
      <a href="docs/screenshots/screenshot001.png">
        <img src="docs/screenshots/screenshot001.png" width="220" alt="截圖 1">
        <div>Projects + Scripts</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot002.png">
        <img src="docs/screenshots/screenshot002.png" width="220" alt="截圖 2">
        <div>Monorepo Action</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot003.png">
        <img src="docs/screenshots/screenshot003.png" width="220" alt="截圖 3">
        <div>Dependency Graph</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot004.png">
        <img src="docs/screenshots/screenshot004.png" width="220" alt="截圖 4">
        <div>Terminals</div>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="docs/screenshots/screenshot005.png">
        <img src="docs/screenshots/screenshot005.png" width="220" alt="截圖 5">
        <div>Git</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot006.png">
        <img src="docs/screenshots/screenshot006.png" width="220" alt="截圖 6">
        <div>Step Template</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot007.png">
        <img src="docs/screenshots/screenshot007.png" width="220" alt="截圖 7">
        <div>Security</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot008.png">
        <img src="docs/screenshots/screenshot008.png" width="220" alt="截圖 8">
        <div>Webhook</div>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="docs/screenshots/screenshot009.png">
        <img src="docs/screenshots/screenshot009.png" width="220" alt="截圖 9">
        <div>Flow Display</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot010.png">
        <img src="docs/screenshots/screenshot010.png" width="220" alt="截圖 10">
        <div>Workflow With Project</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot011.png">
        <img src="docs/screenshots/screenshot011.png" width="220" alt="截圖 11">
        <div>Deploy Accounts</div>
      </a>
    </td>
    <td align="center">
      <a href="docs/screenshots/screenshot012.png">
        <img src="docs/screenshots/screenshot012.png" width="220" alt="eyboard Shortcuts">
        <div>Keyboard Shortcuts</div>
      </a>
    </td>
    <td></td>
  </tr>
</table>

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
