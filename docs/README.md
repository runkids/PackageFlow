# PackageFlow Documentation

Welcome to the PackageFlow documentation! This guide will help you get the most out of PackageFlow.

**Other Languages**: [繁體中文](./zh-TW/README.md) | [简体中文](./zh-CN/README.md)

## Quick Links

- [Getting Started](./getting-started.md) - Install, import a project, run your first script
- [MCP Server](./features/mcp-server.md) - Let AI tools control PackageFlow safely
- [Feature Guides](#features) - Deep dives for each feature area

## What is PackageFlow?

PackageFlow is an **AI-driven `package.json` project management desktop app** — the app you open instead of your terminal. It turns your projects into a visual command center for scripts, Git, deployments, and MCP-powered automation.

**Built for the modern frontend workflow:**

- **React, Vue, Next.js, Nuxt** — Run dev servers, build, and deploy with one click
- **npm, pnpm, yarn, bun** — Automatic package manager detection
- **Monorepos** — Nx, Turborepo, Lerna native support
- **AI-assisted development** — Generate commits, review code, analyze security

**Local-first by design:**

- Project metadata and automation live on your machine
- Secrets (tokens / API keys) are encrypted at rest (AES-256-GCM)
- MCP access is permissioned (read-only → confirm → full access)

## Who is PackageFlow for?

- **Frontend developers** tired of juggling terminal windows
- **Vibe coders** who want to stay in flow, not memorize CLI commands
- **Teams** who want consistent workflows across projects
- **AI-first developers** using Claude Code, Codex, or Gemini CLI

## Key Benefits

| Before PackageFlow | With PackageFlow |
|-------------------|-----------------|
| `cd project && npm run dev` | Click "Dev" |
| `git add . && git commit -m "..."` | AI generates your commit message |
| `npm audit --json \| jq ...` | Visual vulnerability dashboard |
| Switch between 5 terminal tabs | One unified workspace |

## Features

Use the docs below based on what you’re trying to do:

### Core Features

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **Project Management** | Import, scan, and manage your projects | [Read more](./features/project-management.md) |
| **One-Click Scripts** | Run npm/pnpm/yarn scripts with live output | [Read more](./features/one-click-scripts.md) |
| **Visual Workflow** | Build automation flows with drag-and-drop | [Read more](./features/visual-workflow.md) |
| **Monorepo Support** | Nx, Turborepo, Lerna integration | [Read more](./features/monorepo-support.md) |

### Git & Version Control

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **Git Integration** | Visual Git operations without CLI | [Read more](./features/git-integration.md) |
| **Worktree Management** | Manage Git worktrees with quick switcher | [Read more](./features/worktree-management.md) |

### Deployment & Security

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **One-Click Deploy** | Deploy to Netlify, Cloudflare, GitHub Pages | [Read more](./features/one-click-deploy.md) |
| **Security Audit** | Visual npm audit with vulnerability details | [Read more](./features/security-audit.md) |

### AI & Automation

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **AI Integration** | Multi-provider AI (OpenAI, Anthropic, Gemini, Ollama) | [Read more](./features/ai-integration.md) |
| **MCP Server** | Let Claude Code, Codex, Gemini CLI control PackageFlow | [Read more](./features/mcp-server.md) |
| **Webhooks** | Incoming/outgoing webhook automation | [Read more](./features/webhooks.md) |

### Tools & Settings

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **Toolchain Management** | Volta, Corepack, Node version detection | [Read more](./features/toolchain-management.md) |
| **Keyboard Shortcuts** | Customizable shortcuts reference | [Read more](./features/keyboard-shortcuts.md) |

## Supported Technologies

### Frontend Frameworks

React, Vue, Angular, Svelte, Solid, Next.js, Nuxt, Remix, Astro, Vite

### Package Managers

npm, pnpm, yarn, bun (auto-detected from lockfiles)

### Monorepo Tools

Nx, Turborepo, Lerna, pnpm workspaces, yarn workspaces

### Deployment Platforms

Netlify, Cloudflare Pages, GitHub Pages, Vercel (coming soon)

### AI Providers

OpenAI, Anthropic, Google, Ollama, LM Studio

## System Requirements

- **Platform**: macOS (Windows and Linux coming soon)
- **Node.js**: 18+ (for project detection)

## Support

- [GitHub Issues](https://github.com/runkids/PackageFlow/issues) - Bug reports and feature requests
- [Releases](https://github.com/runkids/PackageFlow/releases) - Download latest version
