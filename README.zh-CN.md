<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>面向前端和 Node.js 项目的开发者工作流管理工具</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装">安装</a> •
  <a href="#截图">截图</a> •
  <a href="#开发">开发</a> •
  <a href="#贡献">贡献</a> •
  <a href="#许可证">许可证</a>
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.zh-TW.md">繁體中文</a>
</p>

---

## 什么是 PackageFlow？

PackageFlow 是一款桌面应用程序，旨在简化您的开发工作流。它使用 Tauri、React 和 Rust 构建，提供了一个统一的界面来管理 Git 操作、自动化任务、处理 monorepo 项目以及确保包安全。

## 功能特性

### 可视化工作流自动化
使用拖放式可视化编辑器创建和执行自定义工作流。将多个任务串联在一起，设置 webhook 通知，并从其他工作流触发工作流。

- 拖放式工作流构建器
- 实时执行输出
- Webhook 通知（Slack、Discord、自定义）
- 常见任务的工作流模板
- 暂停/恢复执行

### Git 集成
无需离开应用程序即可进行全面的 Git 管理。

- 通过可视化差异查看器暂存/取消暂存文件
- 带有语法高亮预览的提交
- 分支管理（创建、切换、删除）
- 暂存管理
- 远程操作（推送、拉取、获取）
- Rebase 支持

### Git Worktree 管理
使用 Git worktree 同时在多个分支上工作。

- 创建和管理 worktree
- 快速切换器（<kbd>Cmd</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd>）
- 显示变更的状态徽章
- 在您喜欢的 IDE 中打开（VS Code、Cursor、Zed）
- Worktree 模板

### Monorepo 支持
对 Nx 和 Turborepo 工作区的一流支持。

- 自动检测 monorepo 工具
- 跨包运行目标
- 依赖图可视化
- 缓存管理
- 批量脚本执行

### 安全审计
通过内置的漏洞扫描保护您的依赖项安全。

- npm audit / Snyk 集成
- 漏洞严重性分类
- CVSS 评分和 CVE 详情
- 修复建议
- 扫描历史和提醒

### 终端集成
具有会话持久性的完整 PTY 终端。

- 交互式终端会话
- 刷新后自动重连
- 输出历史保留
- 多实例支持

### 其他功能

- **键盘快捷键** - 可自定义的常用操作快捷键
- **iOS/Android 构建检查** - 分析 IPA 和 APK 文件
- **数据导出/导入** - 备份和恢复您的配置
- **深色/浅色主题** - 无论白天黑夜都能舒适使用

## 安装

### Homebrew（macOS）

```bash
brew tap runkids/tap
brew install --cask packageflow
```

#### 升级

```bash
brew update
brew reinstall --cask packageflow
```

### 手动下载

从 [Releases](https://github.com/runkids/PackageFlow/releases) 页面下载最新版本。

## 截图

<p align="center">
  <a href="docs/screenshots/screenshot001.png"><img src="docs/screenshots/screenshot001.png" width="280" alt="截图 1"></a>
  <a href="docs/screenshots/screenshot002.png"><img src="docs/screenshots/screenshot002.png" width="280" alt="截图 2"></a>
  <a href="docs/screenshots/screenshot003.png"><img src="docs/screenshots/screenshot003.png" width="280" alt="截图 3"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot004.png"><img src="docs/screenshots/screenshot004.png" width="280" alt="截图 4"></a>
  <a href="docs/screenshots/screenshot005.png"><img src="docs/screenshots/screenshot005.png" width="280" alt="截图 5"></a>
  <a href="docs/screenshots/screenshot006.png"><img src="docs/screenshots/screenshot006.png" width="280" alt="截图 6"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot007.png"><img src="docs/screenshots/screenshot007.png" width="280" alt="截图 7"></a>
  <a href="docs/screenshots/screenshot008.png"><img src="docs/screenshots/screenshot008.png" width="280" alt="截图 8"></a>
  <a href="docs/screenshots/screenshot009.png"><img src="docs/screenshots/screenshot009.png" width="280" alt="截图 9"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot010.png"><img src="docs/screenshots/screenshot010.png" width="280" alt="截图 10"></a>
</p>

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

# 启动开发
pnpm tauri dev
```

### 构建

```bash
# 构建生产版本
pnpm tauri build
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
