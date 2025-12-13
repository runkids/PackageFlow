<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>給前端與 Node.js 開發者的桌面工具 — 管理腳本、Git、worktree，部署後立即取得預覽連結。</strong>
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">下載</a> •
  <a href="#為什麼選擇-packageflow">為什麼選擇</a> •
  <a href="#功能">功能</a> •
  <a href="#截圖預覽">截圖預覽</a> •
  <a href="#安裝方式">安裝方式</a> •
  <a href="#開發指南">開發指南</a>
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## 為什麼選擇 PackageFlow？

PackageFlow 讓你的 `package.json` 動起來。執行腳本、管理 Git、切換 worktree、部署並取得可分享的連結——全在一個 App 內完成。

適合 vibe coding：少打指令，專注開發。使用 **Tauri + Rust** 打造，檔案小、啟動快。

## 功能

- **腳本 + 終端機**：以卡片執行 npm 腳本，內建 PTY 終端機即時輸出，支援 port 偵測停止程序。
- **工具鏈偵測**：偵測 Volta/Corepack 版本不一致，以正確版本執行命令。
- **Git 整合**：狀態、暫存、Diff 檢視、提交、分支、歷史、Stash，支援 worktree 操作。
- **Worktree + Session**：視覺化管理 worktrees，<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd> 快速切換，可儲存每個 worktree 的工作記錄（目標/筆記/清單/標籤）。
- **Monorepo 支援**：Nx/Turborepo 偵測、Workspace 檢視、依賴圖。
- **視覺化工作流**：拖拉式工作流編輯器，支援步驟範本、Outgoing/Incoming Webhook。
- **部署 + 預覽**：透過 Netlify/Cloudflare Pages 部署，立即取得可分享的預覽連結。支援歷史記錄與多帳號。
- **資安掃描**：執行掃描、嚴重程度統計、提醒機制、快速修復未安裝的依賴。
- **本機優先**：所有資料本機保存（Tauri store），支援匯出/匯入，含 IPA/APK 檢視工具。

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="620" alt="部署 Demo" />
</p>

## 安裝方式

### Homebrew（macOS）

```bash
brew tap runkids/tap
brew install --cask packageflow
```

#### 升級

```bash
brew update
brew upgrade --cask packageflow
```

### 手動下載

從 [Releases](https://github.com/runkids/PackageFlow/releases) 頁面下載最新版本。

## 截圖預覽

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

# 啟動 Vite（Web UI）
pnpm dev

# 啟動桌面 App
pnpm dev:tauri
```

### 建置

```bash
# 建置 Web assets
pnpm build

# 建置桌面 App（dmg）
pnpm build:tauri
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
