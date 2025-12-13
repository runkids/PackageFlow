<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>別再切換視窗了。用視覺化方式自動化你的開發流程。</strong>
</p>

<p align="center">
  <a href="#為什麼選擇-packageflow">為什麼選擇</a> •
  <a href="#功能特色">功能特色</a> •
  <a href="#安裝方式">安裝方式</a> •
  <a href="#截圖預覽">截圖預覽</a> •
  <a href="#開發指南">開發指南</a>
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## 為什麼選擇 PackageFlow？

**痛點：** 身為前端開發者，你是否每天在多個終端機之間來回切換——跑 Git 指令、執行建置腳本、管理 worktree、檢查安全漏洞？這種上下文切換正在扼殺你的生產力。

**解決方案：** PackageFlow 是一個輕量的桌面應用程式，把所有工具整合在一個地方——還有視覺化工作流編輯器，讓你不用寫腳本就能自動化重複性任務。

### 有什麼不同？

| 功能 | 傳統工具 | PackageFlow |
|------|---------|-------------|
| **Git Worktree** | 只能用 CLI，難以視覺化 | 視覺化管理 + 快速切換器 |
| **任務自動化** | Shell 腳本、CI/CD | 拖拉式工作流編輯器 |
| **Monorepo** | 各自獨立的 CLI 工具 | Nx 與 Turborepo 統一介面 |
| **安全審計** | 手動執行 `npm audit` | 一鍵掃描 + 歷史記錄 |

使用 **Tauri + Rust** 打造 = 快速、輕量（~15MB），沒有 Electron 的肥大問題。

## 功能特色

### 視覺化工作流自動化
透過拖拉式視覺化編輯器建立和執行自訂工作流。串接多個任務、設定 Webhook 通知，並從其他工作流觸發工作流。

- 拖拉式工作流建構器
- 即時執行輸出
- Webhook 通知（Slack、Discord、自訂）
- 常用任務工作流範本
- 暫停/繼續執行

### Git 整合
無需離開應用程式即可完成全面的 Git 管理。

- 暫存/取消暫存檔案，搭配視覺化差異檢視器
- 帶語法高亮的提交預覽
- 分支管理（建立、切換、刪除）
- Stash 管理
- 遠端操作（push、pull、fetch）
- Rebase 支援

### Git Worktree 管理
使用 Git Worktree 同時處理多個分支。

- 建立和管理 Worktrees
- 快速切換器（<kbd>Cmd</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd>）
- 顯示變更的狀態徽章
- 在偏好的 IDE 中開啟（VS Code、Cursor、Zed）
- Worktree 範本

### Monorepo 支援
完整支援 Nx 和 Turborepo 工作區。

- 自動偵測 Monorepo 工具
- 跨套件執行 targets
- 依賴圖視覺化
- 快取管理
- 批次腳本執行

### 安全檢查
透過內建的漏洞掃描保護您的依賴套件安全。

- npm audit / Snyk 整合
- 漏洞嚴重程度分類
- CVSS 分數和 CVE 詳情
- 修復建議
- 掃描歷史和提醒

### 終端機整合
完整的 PTY 終端機，支援工作階段持久化。

- 互動式終端機工作階段
- 重新整理後自動重連
- 輸出歷史保留
- 多實例支援

### 其他功能

- **鍵盤快捷鍵** - 可自訂常用操作的快捷鍵
- **iOS/Android 建置檔檢查** - 分析 IPA 和 APK 檔案
- **資料匯出/匯入** - 備份和還原您的設定
- **深色/淺色主題** - 日夜皆宜，保護眼睛

## 安裝方式

### Homebrew（macOS）

```bash
brew tap runkids/tap
brew install --cask packageflow
```

#### 升級

```bash
brew update
brew reinstall --cask packageflow
```

### 手動下載

從 [Releases](https://github.com/runkids/PackageFlow/releases) 頁面下載最新版本。

## 截圖預覽

<p align="center">
  <a href="docs/screenshots/screenshot001.png"><img src="docs/screenshots/screenshot001.png" width="280" alt="截圖 1"></a>
  <a href="docs/screenshots/screenshot002.png"><img src="docs/screenshots/screenshot002.png" width="280" alt="截圖 2"></a>
  <a href="docs/screenshots/screenshot003.png"><img src="docs/screenshots/screenshot003.png" width="280" alt="截圖 3"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot004.png"><img src="docs/screenshots/screenshot004.png" width="280" alt="截圖 4"></a>
  <a href="docs/screenshots/screenshot005.png"><img src="docs/screenshots/screenshot005.png" width="280" alt="截圖 5"></a>
  <a href="docs/screenshots/screenshot006.png"><img src="docs/screenshots/screenshot006.png" width="280" alt="截圖 6"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot007.png"><img src="docs/screenshots/screenshot007.png" width="280" alt="截圖 7"></a>
  <a href="docs/screenshots/screenshot008.png"><img src="docs/screenshots/screenshot008.png" width="280" alt="截圖 8"></a>
  <a href="docs/screenshots/screenshot009.png"><img src="docs/screenshots/screenshot009.png" width="280" alt="截圖 9"></a>
</p>
<p align="center">
  <a href="docs/screenshots/screenshot010.png"><img src="docs/screenshots/screenshot010.png" width="280" alt="截圖 10"></a>
</p>

<p align="center"><em>點擊圖片查看完整尺寸</em></p>

## 開發指南

### 前置需求

- Node.js 18+
- Rust 1.70+
- pnpm

### 設定

```bash
# 複製儲存庫
git clone https://github.com/runkids/PackageFlow.git
cd PackageFlow

# 安裝依賴
pnpm install

# 啟動開發模式
pnpm tauri dev
```

### 建置

```bash
# 建置正式版本
pnpm tauri build
```

## 參與貢獻

我們歡迎各種形式的貢獻！詳情請參閱 [貢獻指南](CONTRIBUTING.md)。

### 貢獻方式

- 透過 [Issues](https://github.com/runkids/PackageFlow/issues) 回報錯誤和提出功能建議
- 提交 Pull Requests 修復錯誤或新增功能
- 改善文件
- 分享您的工作流範本

### 開發準則

1. Fork 此儲存庫
2. 建立功能分支（`git checkout -b feature/amazing-feature`）
3. 提交變更（`git commit -m 'Add amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 開啟 Pull Request

## 授權條款

本專案採用 MIT 授權條款 - 詳情請參閱 [LICENSE](LICENSE) 檔案。

## 致謝

- [Tauri](https://tauri.app/) - 出色的跨平台框架
- [React Flow](https://reactflow.dev/) - 工作流視覺化
- [Lucide](https://lucide.dev/) - 精美的圖示
- [Claude Code](https://claude.ai/code) - AI 輔助開發

---

<p align="center">
  由 <a href="https://github.com/runkids">runkids</a> 用 ❤️ 打造
</p>
