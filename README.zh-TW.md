<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="128" height="128">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>為 vibe coding 而生——把你的 package.json 變成開發控制台：腳本、worktree、工作流、部署與資安掃描，一個快又輕的桌面 App 搞定。</strong>
</p>

<p align="center">
  <a href="https://github.com/runkids/PackageFlow/releases">下載</a> •
  <a href="#為什麼選擇-packageflow">為什麼選擇</a> •
  <a href="#精選亮點">精選亮點</a> •
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

PackageFlow 是一個以 `package.json` 為核心的輕量桌面應用程式。它把每天最耗腦的事情——腳本、Git、worktree、資安掃描、部署——收斂成一個鍵盤友善的控制台。

使用 **Tauri + Rust** 打造：體積小、啟動快，沒有 Electron 的肥大負擔。
對新手也很友善：少記指令、多把想法做出來。

## 精選亮點

- **腳本 + 終端機**：以卡片整理 `dev/build/test/lint`（以及更多），在內建 PTY 終端機看即時輸出，快速停止程序（含 port 偵測）。
- **工具鏈護欄**：偵測 Volta/Corepack/版本不一致，並用正確版本執行命令。
- **Git 不用跳出去**：狀態、暫存、Diff 檢視、提交、分支、歷史、Stash，且支援 worktree 情境。
- **Worktree + Session**：視覺化管理所有 worktrees，<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd> 快速切換，為每個 worktree 存「我在幹嘛」（目標/筆記/清單/標籤），一鍵 Resume。
- **Monorepo 感知**：自動偵測 Nx/Turborepo、Workspace 檢視、依賴圖（重度 layout 交給 worker）。
- **視覺化工作流**：拖拉式工作流編輯器＋步驟範本、Outgoing Webhook、Incoming Webhook 觸發（含桌面通知）。
- **一鍵部署**：產生 GitHub Pages workflow 或透過 Netlify/Cloudflare Pages 部署，拿到可分享的連結（含歷史與多帳號支援）。
- **資安掃描不再忘記**：一鍵掃描、嚴重程度統計、提醒機制，依賴未安裝時可直接跳到快速修復。
- **資料在你手上**：所有資料本機保存（Tauri store），支援匯出/匯入（也包含 IPA/APK 檢視等工具）。

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="320" alt="部署 Demo" />
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
