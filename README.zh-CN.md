<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>为 vibe coding 而生——把你的 package.json 变成开发控制台：脚本、worktree、工作流、部署与安全扫描，一个快又轻的桌面 App 搞定。</strong>
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">下载</a> •
  <a href="#为什么选择-packageflow">为什么选择</a> •
  <a href="#精选亮点">精选亮点</a> •
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

PackageFlow 是一个以 `package.json` 为核心的轻量桌面应用。它把每天最耗脑的事情——脚本、Git、worktree、安全扫描、部署——收敛成一个键盘友好的控制台。

使用 **Tauri + Rust** 构建：体积小、启动快，没有 Electron 的臃肿负担。
对新手也很友好：少记命令，多把想法做出来。

## 精选亮点

- **脚本 + 终端**：用卡片整理 `dev/build/test/lint`（以及更多），在内置 PTY 终端里看实时输出，快速停止进程（含端口检测）。
- **工具链护栏**：检测 Volta/Corepack/版本不一致，并用正确版本执行命令。
- **Git 不用跳出去**：状态、暂存、Diff 查看、提交、分支、历史、Stash，并支持 worktree 场景。
- **Worktree + Session**：可视化管理所有 worktrees，<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd> 快速切换，为每个 worktree 保存“我在做什么”（目标/笔记/清单/标签），一键 Resume。
- **Monorepo 感知**：自动检测 Nx/Turborepo、Workspace 视图、依赖图（重度 layout 交给 worker）。
- **可视化工作流**：拖拽式工作流编辑器 + 步骤模板、Outgoing Webhook、Incoming Webhook 触发（含桌面通知）。
- **一键部署**：生成 GitHub Pages workflow 或通过 Netlify/Cloudflare Pages 部署，拿到可分享的链接（含历史与多账号支持）。
- **安全扫描不再忘记**：一键扫描、严重程度统计、提醒机制，依赖未安装时可直接跳到快速修复。
- **数据在你手上**：所有数据本地保存（Tauri store），支持导出/导入（也包含 IPA/APK 检视等工具）。

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="320" alt="部署 Demo" />
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
