<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>给前端与 Node.js 开发者的桌面工具 — 管理脚本、Git、worktree，部署后立即获取预览链接。</strong>
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">下载</a> •
  <a href="#为什么选择-packageflow">为什么选择</a> •
  <a href="#功能">功能</a> •
  <a href="#截图">截图</a> •
  <a href="#安装">安装</a> •
  <a href="#开发">开发</a>
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.zh-TW.md">繁體中文</a>
</p>

---

## 为什么选择 PackageFlow？

PackageFlow 让你的 `package.json` 动起来。运行脚本、管理 Git、切换 worktree、部署并获取可分享的链接——全在一个 App 内完成。

适合 vibe coding：少打命令，专注开发。使用 **Tauri + Rust** 构建，文件小、启动快。

## 功能

- **脚本 + 终端**：以卡片执行 npm 脚本，内置 PTY 终端实时输出，支持端口检测停止进程。
- **工具链检测**：检测 Volta/Corepack 版本不一致，以正确版本执行命令。
- **Git 集成**：状态、暂存、Diff 查看、提交、分支、历史、Stash，支持 worktree 操作。
- **Worktree + Session**：可视化管理 worktrees，<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd> 快速切换，可保存每个 worktree 的工作记录（目标/笔记/清单/标签）。
- **Monorepo 支持**：Nx/Turborepo 检测、Workspace 视图、依赖图。
- **可视化工作流**：拖拽式工作流编辑器，支持步骤模板、Outgoing/Incoming Webhook。
- **部署 + 预览**：通过 Netlify/Cloudflare Pages 部署，立即获取可分享的预览链接。支持历史记录与多账号。
- **安全扫描**：执行扫描、严重程度统计、提醒机制、快速修复未安装的依赖。
- **本地优先**：所有数据本地保存（Tauri store），支持导出/导入，含 IPA/APK 检视工具。

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="620" alt="部署 Demo" />
</p>

## 安装

### Homebrew（macOS）

```bash
brew tap runkids/tap
brew install --cask packageflow
```

#### 升级

```bash
brew update
brew upgrade --cask packageflow
```

### 手动下载

从 [Releases](https://github.com/runkids/PackageFlow/releases) 页面下载最新版本。

## 截图

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

<p align="center"><em>点击任意图片查看完整大小</em></p>

## 开发

### 前置条件

- Node.js 18+
- Rust 1.70+
- pnpm

### 设置

```bash
# 克隆仓库
git clone https://github.com/runkids/PackageFlow.git
cd PackageFlow

# 安装依赖
pnpm install

# 启动 Vite（Web UI）
pnpm dev

# 启动桌面 App
pnpm dev:tauri
```

### 构建

```bash
# 构建 Web assets
pnpm build

# 构建桌面 App（dmg）
pnpm build:tauri
```

## 贡献

我们欢迎贡献！请参阅我们的[贡献指南](CONTRIBUTING.md)了解详情。

### 贡献方式

- 通过 [Issues](https://github.com/runkids/PackageFlow/issues) 报告 bug 和请求功能
- 提交 bug 修复或新功能的 pull request
- 改进文档
- 分享您的工作流模板

### 开发指南

1. Fork 仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交您的更改（`git commit -m 'Add amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 开启一个 Pull Request

## 许可证

本项目使用 MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。

## 致谢

- [Tauri](https://tauri.app/) - 出色的跨平台框架
- [React Flow](https://reactflow.dev/) - 工作流可视化
- [Lucide](https://lucide.dev/) - 精美的图标
- [Claude Code](https://claude.ai/code) - AI 驱动的开发辅助

---

<p align="center">
  由 <a href="https://github.com/runkids">runkids</a> 用 ❤️ 打造
</p>
