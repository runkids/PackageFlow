<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="PackageFlow Logo" width="100" height="100">
</p>

<h1 align="center">PackageFlow</h1>

<p align="center">
  <strong>🚀 告別終端機地獄</strong><br/>
  <sub>npm scripts、Git、Worktree、部署預覽 — 全部整合在一個漂亮的 App</sub>
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
  <a href="https://github.com/runkids/PackageFlow/releases">📥 下載</a> •
  <a href="#-功能特色">✨ 功能</a> •
  <a href="#-截圖展示">📸 截圖</a> •
  <a href="#️-開發路線">🗺️ 路線圖</a> •
  <a href="#-常見問題">❓ FAQ</a>
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## 📍 為什麼選擇 PackageFlow？

厭倦了在終端機、Git GUI、部署後台之間切來切去？

PackageFlow 讓你的 `package.json` 活起來 — 一個 App 搞定前端開發者每天都在做的事。使用 **Tauri + Rust** 打造，安裝檔超小、啟動超快。

專為 **vibe coding** 設計：少點終端機混亂，多點時間寫酷東西。

## 🎬 快速開始

1. **下載** → [下載 macOS 版本](https://github.com/runkids/PackageFlow/releases)
2. **開啟專案** → 拖曳任何含 `package.json` 的資料夾到 App
3. **開始使用** → 點擊任何 script 卡片即可執行！

> 💡 **小技巧**：按 <kbd>Cmd</kbd>+<kbd>K</kbd> 快速切換 worktrees

## ✨ 功能特色

| | 功能 | 說明 |
|:---:|---------|-------------|
| 🎯 | **一鍵執行 Scripts** | 卡片式執行 npm scripts，即時 PTY 終端輸出 |
| 🔀 | **完整 Git 操作** | commit、branch、stash、diff 檢視器一應俱全 |
| 🌳 | **Worktree 魔法** | 視覺化管理、<kbd>Cmd</kbd>+<kbd>K</kbd> 快速切換、Session 記錄 |
| 🚀 | **即時部署** | 一鍵部署到 Netlify/Cloudflare，立即取得預覽連結 |
| 📦 | **Monorepo 支援** | 自動偵測 Nx/Turborepo、workspace 檢視、依賴圖表 |
| 🔧 | **工具鏈偵測** | 自動偵測 Volta/Corepack 版本衝突 |
| 🛡️ | **安全掃描** | 視覺化 npm audit，一鍵修復 |
| ⚡ | **視覺化工作流** | 拖拉式自動化建構器 + Webhook 觸發 |

<p align="center">
  <img src="docs/screenshots/deploy-demo.gif" width="720" alt="Deploy demo" />
  <br/>
  <em>👆 一鍵部署，即時取得預覽連結</em>
</p>

## 📸 截圖展示

<details>
<summary>🎯 專案 + Scripts</summary>
<br/>
<img src="docs/screenshots/screenshot001.png" width="800" alt="專案和 Scripts" />
</details>

<details>
<summary>📦 Monorepo 操作</summary>
<br/>
<img src="docs/screenshots/screenshot002.png" width="800" alt="Monorepo 操作" />
</details>

<details>
<summary>🔗 依賴圖表</summary>
<br/>
<img src="docs/screenshots/screenshot003.png" width="800" alt="依賴圖表" />
</details>

<details>
<summary>💻 終端機</summary>
<br/>
<img src="docs/screenshots/screenshot004.png" width="800" alt="終端機" />
</details>

<details>
<summary>🔀 Git 整合</summary>
<br/>
<img src="docs/screenshots/screenshot005.png" width="800" alt="Git 整合" />
</details>

<details>
<summary>📋 步驟模板</summary>
<br/>
<img src="docs/screenshots/screenshot006.png" width="800" alt="步驟模板" />
</details>

<details>
<summary>🛡️ 安全稽核</summary>
<br/>
<img src="docs/screenshots/screenshot007.png" width="800" alt="安全稽核" />
</details>

<details>
<summary>🔌 Webhooks</summary>
<br/>
<img src="docs/screenshots/screenshot008.png" width="800" alt="Webhooks" />
</details>

<details>
<summary>⚡ 視覺化工作流</summary>
<br/>
<img src="docs/screenshots/screenshot009.png" width="800" alt="視覺化工作流" />
</details>

<details>
<summary>🚀 部署帳號</summary>
<br/>
<img src="docs/screenshots/screenshot011.png" width="800" alt="部署帳號" />
</details>

<details>
<summary>⌨️ 鍵盤快捷鍵</summary>
<br/>
<img src="docs/screenshots/screenshot012.png" width="800" alt="鍵盤快捷鍵" />
</details>

## 📦 安裝

### Homebrew (macOS)

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

## 🗺️ 開發路線

我們正在積極開發以下功能：

- [ ] 🪟 **Windows 支援** — 跨平台擴展
- [ ] 🐧 **Linux 支援** — 完整桌面支援
- [ ] 🤖 **AI 整合** — Local LLM 與 AI CLI (Claude Code, Codex, Gemini)
- [ ] 🔌 **MCP 伺服器** — 讓 AI 工具控制 PackageFlow
- [ ] 📦 **插件系統** — 自訂擴展功能

> 💡 有功能建議？[開 Issue 告訴我們！](https://github.com/runkids/PackageFlow/issues)

## ❓ 常見問題

<details>
<summary><strong>Q: PackageFlow 和 VS Code 終端機有什麼不同？</strong></summary>
<br/>

PackageFlow 專注於視覺化和效率：
- 🎯 一鍵執行 scripts，不用記指令
- 👁️ 所有 scripts 一目瞭然
- 🚀 整合部署，直接取得預覽連結
- 🌳 Worktree 視覺化管理

</details>

<details>
<summary><strong>Q: 支援哪些作業系統？</strong></summary>
<br/>

目前支援 **macOS** (Apple Silicon 和 Intel)。
Windows 和 Linux 支援正在開發中！

</details>

<details>
<summary><strong>Q: 資料存在哪裡？安全嗎？</strong></summary>
<br/>

所有資料都儲存在本機 (`~/Library/Application Support/PackageFlow`)。
不會上傳到任何伺服器。100% 本機優先設計。

</details>

<details>
<summary><strong>Q: 可以用在 Monorepo 專案嗎？</strong></summary>
<br/>

可以！自動偵測 **Nx** 和 **Turborepo**，
顯示 workspace 結構和依賴圖表。

</details>

## 🛠 開發

### 前置需求

- Node.js 18+
- Rust 1.70+
- pnpm

### 設定

```bash
# Clone 專案
git clone https://github.com/runkids/PackageFlow.git
cd PackageFlow

# 安裝依賴
pnpm install

# 啟動 Vite (web UI)
pnpm dev

# 啟動桌面應用
pnpm dev:tauri
```

### 建置

```bash
# 建置 web 資源
pnpm build

# 建置桌面應用 (dmg)
pnpm build:tauri
```

## 🤝 貢獻

我們歡迎各種貢獻！請參閱 [Contributing Guide](CONTRIBUTING.md) 了解詳情。

### 貢獻方式

- 🐛 透過 [Issues](https://github.com/runkids/PackageFlow/issues) 回報 bug 或提出功能建議
- 🔧 提交 Pull Request 修復 bug 或新增功能
- 📝 改善文件
- 🔄 分享你的工作流模板

### 開發指南

1. Fork 這個專案
2. 建立 feature branch (`git checkout -b feature/amazing-feature`)
3. Commit 你的修改 (`git commit -m 'Add amazing feature'`)
4. Push 到 branch (`git push origin feature/amazing-feature`)
5. 開一個 Pull Request

## ⭐ Star 歷史

<p align="center">
  <a href="https://star-history.com/#runkids/PackageFlow&Date">
    <img src="https://api.star-history.com/svg?repos=runkids/PackageFlow&type=Date" alt="Star History Chart" width="600" />
  </a>
</p>

## 📄 授權

本專案採用 MIT 授權 - 詳見 [LICENSE](LICENSE) 檔案。

## 🙏 致謝

- [Tauri](https://tauri.app/) — 強大的跨平台框架
- [React Flow](https://reactflow.dev/) — 工作流視覺化
- [Lucide](https://lucide.dev/) — 精美圖示
- [Claude Code](https://claude.ai/code) — AI 輔助開發

---

<p align="center">
  <strong>喜歡這個專案嗎？</strong><br/>
  ⭐ Star 我們 = 最大的支持！<br/><br/>
  <a href="https://github.com/runkids/PackageFlow">
    <img src="https://img.shields.io/github/stars/runkids/PackageFlow?style=social" alt="GitHub stars" />
  </a>
</p>

<p align="center">
  Made with ❤️ by <a href="https://github.com/runkids">runkids</a>
</p>
