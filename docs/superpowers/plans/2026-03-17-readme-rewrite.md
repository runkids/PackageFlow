# README.md Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the outdated PackageFlow README.md with a complete SpecForge README reflecting the current product.

**Architecture:** Single-file rewrite of `README.md` at project root. No code changes, no tests. Content follows the approved design spec structure: Hero → What is SpecForge → Key Features → AI & MCP → Getting Started → FAQ → Footer.

**Tech Stack:** Markdown, GitHub-flavored HTML for centered elements and collapsible sections.

**Design spec:** `docs/superpowers/specs/2026-03-17-readme-rewrite-design.md`

---

## Chunk 1: README.md Rewrite

### Task 1: Write complete README.md

**Files:**
- Rewrite: `README.md` (replace all content)

**Source of truth for facts:**
- Badge URLs: `runkids/PackageFlow` (repo name unchanged on GitHub)
- MCP tools: 17 tools, 6 categories — verified from `crates/specforge-lib/src/models/mcp.rs`
- Claude Code commands: 4 commands — verified from `assets/claude-commands/`
- Homebrew cask: `specforge` — matches `package.json` name

- [ ] **Step 1: Write the full README.md using the Write tool**

Use the Write tool to replace the entire file. The content has 7 sections matching the design spec:

**Section 1 — Hero:** Centered logo (`src-tauri/icons/128x128@2x.png`), title "SpecForge", primary tagline "Forge your own spec workflow.", secondary tagline "Spec-driven development, self-driven by AI — open source, local-first, methodology-agnostic." Badges for release, stars, license, macOS. Tech stack icons (rust, tauri, react, ts, tailwind). Nav links to: What is SpecForge, Features, AI & MCP, Get Started, FAQ.

**Section 2 — What is SpecForge?:** One-line positioning: "SpecForge turns specs into the driver of your development workflow." Pain point framing (teams use Notion/Jira/scattered Markdown). 3-step value prop: define schemas → design workflows → let AI drive. Blockquote: "SpecForge is a runtime, not a methodology." Sub-heading "How It Works" with `.specforge/` directory tree (schemas, workflows, specs, templates) in a fenced code block. Explanatory paragraph. ASCII workflow diagram in a separate fenced code block showing: Discuss → (gate: reviewed?) → Implement → (gate: tests pass?) → Verify → Archive, with `auto:` labels for create branch and run AI agent.

**Section 3 — Key Features:** 7 sub-headings, no emoji. Each 2-3 lines:
- **Spec-First Storage** — Markdown + YAML frontmatter, version-controlled, grep-able, no proprietary DB
- **Schema-Driven Forms** — custom YAML schemas, dynamic forms, 3 built-in schemas (spec, change-request, task)
- **Visual Workflow Builder** — React Flow canvas, YAML output, diffable
- **Gate Expressions** — inline code example: `spec_section_summary == true && reviews_approved >= 2`. Auto-evaluate on change.
- **Autopilot Mode** — self-advance, file watcher, safeguards (rate limits, circuit breakers, agent caps)
- **Spec-Aware Git** — auto `spec/{id}` branches, commit tracking, archive cleanup
- **Local-First & Private** — no cloud, no telemetry, AES-256-GCM encryption, AI opt-in via MCP

**Section 4 — AI & MCP Integration:** Open with "no built-in AI" positioning + MCP link. "Why External AI?" 3 bullets (no keys to manage, no vendor lock-in, AI evolves independently). MCP Tools table:

| Category | Tools |
|----------|-------|
| Spec Operations | create_spec, list_specs, get_spec, update_spec, delete_spec |
| Workflow Operations | advance_spec, review_spec, get_workflow_status, get_gate_status |
| Schema Operations | list_schemas, get_schema |
| Project Operations | init_project |
| Agent Operations | get_agent_runs |
| Git Operations | git_status, git_diff, git_create_branch, git_commit |

Setup: one line — "Settings → MCP → MCP Integration, copy config." Compatible tools: Claude Code, Codex CLI, Gemini CLI, any MCP-compatible. Claude Code Commands table (4 rows: /create-spec, /review-spec, /implement, /spec-status with descriptions). Agent Dispatch: YAML example showing `on_enter` with `run_agent` action, prompt, and timeout. Note: agent command configurable, default `claude`, tracks PID/status/timeout.

**Section 5 — Getting Started:** Install via `brew tap runkids/tap && brew install --cask specforge`. Or download link. 4 first steps: open project dir → scaffolds .specforge/ → create spec → watch it flow.

**Section 6 — FAQ:** 5 collapsible `<details>` items:
1. "What is spec-driven development?" — specs as active artifacts with lifecycle, gates, auto-actions
2. "How is this different from Jira / Linear / Notion?" — workflow runtime vs PM tool; files in repo, YAML workflows, real gate conditions, autonomous AI
3. "Why no built-in AI?" — by design, MCP tools, use your own AI, no vendor lock-in
4. "Is my data safe?" — 100% local-first, Markdown files, local SQLite, no cloud, no telemetry, AI opt-in
5. "Can I define my own spec methodology?" — custom schemas + workflows, built-in defaults, nothing hardcoded

**Section 7 — Footer:** Contributing link to CONTRIBUTING.md. Acknowledgments: Tauri, React Flow, Lucide, evalexpr. Centered "MIT License • Made by runkids".

---

### Task 2: Verify and Commit

**Files:**
- Verify: `README.md`

- [ ] **Step 1: Check file length and PackageFlow references**

Run:
```bash
wc -l README.md
grep -n -i "packageflow" README.md
```

Expected:
- Approximately 200-250 lines
- `PackageFlow` only appears in badge/release URLs (intentional — repo name hasn't changed on GitHub)

- [ ] **Step 2: Verify anchor links match headings**

Manually confirm these nav links resolve to their headings:
- `#what-is-specforge` → `## What is SpecForge?`
- `#key-features` → `## Key Features`
- `#ai--mcp-integration` → `## AI & MCP Integration`
- `#getting-started` → `## Getting Started`
- `#faq` → `## FAQ`

- [ ] **Step 3: Verify fenced code blocks are balanced**

Run:
```bash
grep -c '```' README.md
```

Expected: even number (every opening fence has a closing fence).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README.md for SpecForge v0.4.0

Replace outdated PackageFlow README with SpecForge content:
spec-driven development platform with workflow engine,
gate expressions, MCP integration, and autopilot mode."
```
