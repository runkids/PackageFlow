# Minimalist Dark UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire SpecForge UI from blue-accent glassmorphism to Minimalist Dark (layered slate + amber accent + glass cards) with light/dark theme support.

**Architecture:** Inside-out approach — design tokens first, then UI primitives, then global shell, then individual pages. All changes are style-only (no behavior/logic changes). CSS variables use HSL triplets consumed by Tailwind via `hsl(var(--xxx) / <alpha-value>)`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 3.4, CVA (Class Variance Authority), Vite 8, Tauri 2

**Spec:** `docs/superpowers/specs/2026-03-17-ui-redesign-minimalist-dark-design.md`

---

## File Map

### New Files
```
src/assets/fonts/SpaceGrotesk-Variable.woff2
src/assets/fonts/Inter-Variable.woff2
src/assets/fonts/JetBrainsMono-Variable.woff2
```

### Modified Files (by task)

| Task | Files |
|------|-------|
| 1. Foundation | `src/styles.css`, `tailwind.config.js`, `index.html` |
| 2. Primitives A | `src/components/ui/Button.tsx`, `src/components/ui/Input.tsx`, `src/components/ui/Checkbox.tsx`, `src/components/ui/Toggle.tsx` |
| 3. Primitives B | `src/components/ui/Dialog.tsx`, `src/components/ui/Dropdown.tsx`, `src/components/ui/Tabs.tsx`, `src/components/ui/Progress.tsx`, `src/components/ui/Skeleton.tsx`, `src/components/ui/Select.tsx` |
| 4. Primitives C | `src/components/ui/QuickSwitcher.tsx`, `src/components/ui/KeyboardShortcutsDialog.tsx`, `src/components/ui/ThemeToggle.tsx`, `src/components/ui/ListSidebar/*`, + **all remaining** `src/components/ui/*.tsx` files with old color refs (AIReviewDialog, ConfirmDialog, EmptyState, GradientDivider, KeyboardShortcutsHint, PermissionCheckbox, UpdateDialog, etc.) |
| 5. Global Shell | `src/App.tsx`, `src/components/status-bar/McpStatusButton.tsx`, `src/components/status-bar/NotificationButton.tsx`, `src/components/status-bar/BackgroundTasksButton.tsx`, `src/components/status-bar/StopProcessesButton.tsx` |
| 6. Settings | `src/components/settings/SettingsPage.tsx`, `src/components/settings/McpSettingsPanel.tsx`, `src/components/settings/SettingsButton.tsx`, `src/components/settings/ShortcutEditor.tsx`, `src/components/settings/ui/SettingCard.tsx`, `src/components/settings/ui/SettingInfoBox.tsx`, `src/components/settings/ui/SettingRow.tsx`, `src/components/settings/ui/SettingSection.tsx`, `src/components/settings/panels/AppearanceSettingsPanel.tsx`, `src/components/settings/panels/AboutSettingsPanel.tsx`, `src/components/settings/panels/McpSettingsFullPanel.tsx`, `src/components/settings/panels/ShortcutsSettingsPanel.tsx`, `src/components/settings/panels/StorageSettingsPanel.tsx`, `src/components/settings/panels/DataSettingsPanel.tsx`, `src/components/settings/panels/NotificationSettingsPanel.tsx`, `src/components/settings/mcp/MCPActionEditor.tsx`, `src/components/settings/mcp/MCPActionSettings.tsx`, `src/components/settings/mcp/MCPActionHistory.tsx`, `src/components/settings/mcp/ActionConfirmationDialog.tsx`, `src/components/settings/mcp/UnifiedActivityLog.tsx`, `src/components/settings/mcp/ServerStatusCard.tsx`, `src/components/settings/mcp/QuickSetupSection.tsx`, `src/components/settings/mcp/PermissionQuickModeSelector.tsx`, `src/components/settings/mcp/ToolPermissionMatrix.tsx` |
| 7. Spec Editor | `src/components/spec-editor/SpecList.tsx`, `src/components/spec-editor/SpecEditor.tsx`, `src/components/spec-editor/MarkdownEditor.tsx`, `src/components/spec-editor/FrontmatterForm.tsx`, `src/components/spec-editor/NewSpecDialog.tsx` |
| 8. Workflow | `src/components/workflow/WorkflowCanvas.tsx`, `src/components/workflow/nodes/PhaseNode.tsx`, `src/components/workflow/nodes/GateNode.tsx`, `src/components/workflow/nodes/ScriptNode.tsx`, `src/components/workflow/edges/AnimatedEdge.tsx`, `src/components/workflow/edges/InsertableEdge.tsx`, + **all remaining** `src/components/workflow/**/*.tsx` with old color refs (WorkflowEditor, WorkflowToolbar, VisualCanvas, WorkflowSidebar, WorkflowSelector, WorkflowNode, WorkflowConnection, WorkflowOutputPanel, WorkflowPreview, WorkflowExecutionStatus, ExecutionHistoryPanel, NodePanel, OutputNodeGroup, StartNode, TriggerWorkflowNode, VirtualizedOutputList, TemplateSelector, TriggerWorkflowPanel, WebhookSettingsDialog, etc.) |
| 9. Terminal | `src/components/terminal/ScriptPtyTerminal.tsx`, `src/components/terminal/TerminalOutput.tsx`, `src/components/terminal/TerminalTab.tsx`, `src/components/terminal/TerminalStatusBar.tsx`, `src/components/terminal/TerminalSearchBar.tsx` |
| 10. Onboarding + Cleanup | `src/components/onboarding/FirstRunWizard.tsx` |

---

## Task 1: Foundation — Tokens, Fonts, Config

**Files:**
- Create: `src/assets/fonts/SpaceGrotesk-Variable.woff2`, `src/assets/fonts/Inter-Variable.woff2`, `src/assets/fonts/JetBrainsMono-Variable.woff2`
- Modify: `src/styles.css`, `tailwind.config.js`, `index.html`

- [ ] **Step 1: Download and add font files**

Download variable font woff2 files from Google Fonts and place them in `src/assets/fonts/`:
- Space Grotesk variable (weight 300-700): https://fonts.google.com/specimen/Space+Grotesk
- Inter variable (weight 100-900): https://fonts.google.com/specimen/Inter
- JetBrains Mono variable (weight 100-800): https://fonts.google.com/specimen/JetBrains+Mono

Use `fontsource` npm packages as an alternative source if needed:
```bash
# Option: download from fontsource
npm install @fontsource-variable/space-grotesk @fontsource-variable/inter @fontsource-variable/jetbrains-mono
# Then copy the woff2 files from node_modules to src/assets/fonts/
# Then uninstall the packages (we only need the files, not the JS imports)
```

Verify: `ls -la src/assets/fonts/*.woff2` shows 3 files, total ~255KB.

- [ ] **Step 2: Rewrite CSS variables and add @font-face in styles.css**

Read `src/styles.css` fully. Replace the `:root` and `.dark` blocks with the new token values from spec sections 1.1 and 1.2. Add `@font-face` declarations from spec section 1.4 BEFORE the `@tailwind` directives.

Key changes:
- `:root` — all tokens to warm paper palette (spec 1.1)
- `.dark` — all tokens to deep slate palette (spec 1.2)
- Add `--background-alt` to both modes (new token)
- Add `@font-face` for Space Grotesk, Inter, JetBrains Mono
- Update `body` font-family to `"Inter", system-ui, sans-serif`
- Add `body::before` noise texture (spec 3.4)
- Add `.dark body::after` ambient orb (spec 3.4)
- Update scrollbar styles (spec 6.1)
- Update JSON syntax colors with dark/light selectors (spec 6.2)
- Remove deleted animation CSS: shimmer-purple, shimmer-blue, shimmer-amber, blink, bot-wobble
- Retain: accordion, chip-enter/exit, chip-slide-in/out, edge-flow, ime-pulse
- Update reduced-motion media query (spec 5.6)

- [ ] **Step 2b: Build check after CSS variable rewrite**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npm run build 2>&1 | tail -10
```

Expected: Build succeeds. This catches any CSS syntax errors or PostCSS issues from the massive variable rewrite before proceeding.

- [ ] **Step 3: Verify styles.css compiles**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tailwindcss -i src/styles.css -o /dev/null --minify 2>&1 | head -5
```

Expected: No errors.

- [ ] **Step 4: Update tailwind.config.js**

Read `tailwind.config.js`. Apply these changes:
1. Update ALL color entries to `hsl(var(--xxx) / <alpha-value>)` format (spec 1.3 — CRITICAL for opacity modifiers)
2. Add `"background-alt"` color entry
3. Add `fontFamily` with sans/display/mono (spec 1.3)
4. Add `boxShadow` glow-sm/md/lg (spec 1.3)
5. Remove deleted keyframes: rocket-vibrate, rocket-fly, flame-flicker, sparkle-glow, sparkle-twinkle, ai-generate-glow, scan-glow, scan-line, ai-review-glow, ai-security-glow, security-sparkle
6. Remove corresponding animation entries for the deleted keyframes
7. Update `pulse-subtle` keyframe to border-color oscillation (spec 5.4)
8. Keep: accordion-down/up, chip-enter/exit, chip-slide-in/out

- [ ] **Step 5: Update index.html preload script**

Read `index.html`. Find the inline `<script>` that prevents flash. Update the hardcoded background color values:
- Dark: `hsl(240, 20%, 5%)` (was `hsl(0, 0%, 12%)`)
- Light: `hsl(30, 33%, 94%)` (was `hsl(0, 0%, 100%)`)

- [ ] **Step 6: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npm run build 2>&1 | tail -20
```

Expected: Build succeeds. There may be Tailwind class warnings for opacity modifiers on components not yet updated — these are expected and will be resolved in subsequent tasks.

- [ ] **Step 7: Commit**

```bash
git add src/assets/fonts/ src/styles.css tailwind.config.js index.html
git commit -m "feat(ui): add Minimalist Dark design tokens, fonts, and Tailwind config

- Replace CSS variables with Minimalist Dark palette (warm paper light / deep slate dark)
- Add locally bundled variable fonts (Space Grotesk, Inter, JetBrains Mono)
- Update Tailwind config with <alpha-value> opacity support, glow shadows, font families
- Add noise texture and ambient orb CSS effects
- Update index.html preload colors
- Remove deleted animations (rocket, sparkle, scan, AI glow effects)"
```

---

## Task 2: UI Primitives A — Button, Input, Checkbox, Toggle

**Files:**
- Modify: `src/components/ui/Button.tsx` (69 lines, CVA), `src/components/ui/Input.tsx` (27 lines), `src/components/ui/Checkbox.tsx` (187 lines, CVA), `src/components/ui/Toggle.tsx` (209 lines)

- [ ] **Step 1: Rewrite Button.tsx CVA variants**

Read `src/components/ui/Button.tsx`. Rewrite `buttonVariants` CVA config per spec 2.1:

Base classes:
```
inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium
transition-all duration-200 ease-out
active:scale-[0.98]
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
disabled:pointer-events-none disabled:opacity-50
```

Variants:
- `default` (primary): `bg-primary text-primary-foreground hover:brightness-110 hover:shadow-glow-sm`
- `secondary`: `bg-transparent text-foreground border border-foreground/15 hover:bg-foreground/5 hover:border-foreground/25`
- `ghost`: `bg-transparent text-foreground hover:bg-foreground/5`
- `destructive`: `bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30`
- `success`: `bg-success/20 text-success border border-success/30 hover:bg-success/30`
- `link`: `text-foreground underline-offset-4 hover:text-primary hover:underline`

Remove: `warning`, `info`, `outline` variants if they exist. Keep variant names that other files import.

Sizes: `sm` (h-8 px-3 text-xs rounded-md), `default` (h-9 px-4 py-2), `lg` (h-11 px-6), `icon` (h-9 w-9)

- [ ] **Step 2: Update Input.tsx**

Read `src/components/ui/Input.tsx`. Update classes per spec 2.3:
```
bg-card/60 backdrop-blur-[8px] border border-border rounded-lg h-11 w-full px-3 py-2
text-sm text-foreground placeholder:text-muted-foreground
transition-all duration-200
focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:outline-none
disabled:cursor-not-allowed disabled:opacity-50
file:border-0 file:bg-transparent file:text-sm file:font-medium
```

- [ ] **Step 3: Update Checkbox.tsx CVA variants**

Read `src/components/ui/Checkbox.tsx`. Update CVA variants:
- Unchecked base: `border border-border rounded-md bg-transparent`
- Checked state (`data-[state=checked]`): `bg-primary border-primary text-primary-foreground`
- Focus: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Remove color-specific variants (destructive, success, warning, purple) — use single default style
- Keep size variants and label/description layout

- [ ] **Step 4: Update Toggle.tsx**

Read `src/components/ui/Toggle.tsx`. Update styling:
- Track off: `bg-muted border border-border` (remove backdrop-blur-sm)
- Track on: `bg-primary border-primary`
- Knob: `bg-white rounded-full` (keep existing)
- Transition: `transition-all duration-200 ease-out`
- Remove blue/green/red colored states — single amber primary

- [ ] **Step 5: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

Expected: No type errors (these are style-only changes).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Input.tsx src/components/ui/Checkbox.tsx src/components/ui/Toggle.tsx
git commit -m "feat(ui): restyle Button, Input, Checkbox, Toggle to Minimalist Dark

- Button: amber primary, outline secondary, glass destructive/success
- Input: glass bg with amber focus ring
- Checkbox: amber checked state, remove color variants
- Toggle: amber on state, remove glassmorphism"
```

---

## Task 3: UI Primitives B — Dialog, Dropdown, Tabs, Progress, Skeleton, Select

**Files:**
- Modify: `src/components/ui/Dialog.tsx` (149 lines), `src/components/ui/Dropdown.tsx` (184 lines), `src/components/ui/Tabs.tsx` (205 lines), `src/components/ui/Progress.tsx` (50 lines), `src/components/ui/Skeleton.tsx` (76 lines), `src/components/ui/Select.tsx` (607 lines)

- [ ] **Step 1: Update Dialog.tsx**

Read `src/components/ui/Dialog.tsx`. Update per spec 2.5:
- Overlay: `bg-black/60 backdrop-blur-sm` (verify existing)
- DialogContent: `bg-card border border-border rounded-xl shadow-xl`
- Remove any blue/colored accents from header/close button

- [ ] **Step 2: Update Dropdown.tsx**

Read `src/components/ui/Dropdown.tsx`. Update per spec 2.6:
- Container: `bg-card border border-border rounded-lg shadow-lg`
- Item hover: `hover:bg-foreground/5 rounded-md`
- Active item: `text-primary`
- Separator: `border-border`
- Destructive item: `text-destructive hover:bg-destructive/10`

- [ ] **Step 3: Update Tabs.tsx**

Read `src/components/ui/Tabs.tsx`. Update per spec 2.7:
- TabsList: `border-b border-border` (remove bg-muted/50 background)
- TabsTrigger inactive: `text-muted-foreground hover:text-foreground`
- TabsTrigger active: `text-foreground border-b-2 border-primary` (amber underline indicator)
- Remove bg-background active state — use underline instead

- [ ] **Step 4: Update Progress.tsx**

Read `src/components/ui/Progress.tsx`. Update per spec 2.8:
- Track: `bg-muted rounded-full h-2`
- Fill: `bg-primary rounded-full transition-[width] duration-500 ease-out`
- Remove gradient variant — replace with semantic variants (success: `bg-success`, destructive: `bg-destructive`)

- [ ] **Step 5: Update Skeleton.tsx**

Read `src/components/ui/Skeleton.tsx`. Update:
- Base: `bg-muted rounded-lg animate-pulse` (verify — should already work with new tokens)
- Verify sub-components (WorktreeItemSkeleton etc.) look correct with new muted color

- [ ] **Step 6: Update Select.tsx**

Read `src/components/ui/Select.tsx`. Update styling:
- Trigger: same as Input (bg-card/60, border-border, rounded-lg, h-11)
- Focus: `border-primary/50 ring-2 ring-primary/20`
- Dropdown: `bg-card border border-border rounded-lg shadow-lg`
- Option hover: `bg-foreground/5 rounded-md`
- Selected option: `text-primary` with Check icon
- Remove any blue/cyan accent colors

- [ ] **Step 7: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/Dialog.tsx src/components/ui/Dropdown.tsx src/components/ui/Tabs.tsx src/components/ui/Progress.tsx src/components/ui/Skeleton.tsx src/components/ui/Select.tsx
git commit -m "feat(ui): restyle Dialog, Dropdown, Tabs, Progress, Skeleton, Select

- Dialog: glass card content with dark overlay
- Dropdown: subtle borders, foreground/5 hover
- Tabs: amber underline indicator, remove bg active state
- Progress: amber fill with semantic variants
- Select: glass bg with amber focus"
```

---

## Task 4: UI Primitives C — QuickSwitcher, KeyboardShortcutsDialog, ThemeToggle, ListSidebar

**Files:**
- Modify: `src/components/ui/QuickSwitcher.tsx` (810 lines), `src/components/ui/KeyboardShortcutsDialog.tsx` (764 lines), `src/components/ui/ThemeToggle.tsx` (22 lines), `src/components/ui/ListSidebar/ListSidebarHeader.tsx` (139 lines), `src/components/ui/ListSidebar/ListSidebarItem.tsx` (255 lines), `src/components/ui/ListSidebar/ListSidebarEmpty.tsx` (66 lines)

- [ ] **Step 1: Update QuickSwitcher.tsx**

Read `src/components/ui/QuickSwitcher.tsx`. This is 810 lines — the most complex UI component. Key changes per spec 6.4:
- Overlay: `bg-black/60 backdrop-blur-sm`
- Container: `bg-card border border-border rounded-xl shadow-xl`
- Search input: `h-12`, icon left, `border-b border-border` (no outer border)
- Results: `hover:bg-foreground/5`, keyboard selected = `bg-primary/15 border-l-2 border-primary`
- Shortcut badge: `font-mono text-xs bg-muted px-1.5 py-0.5 rounded-md`
- **Remove**: theme-based color system (blue/cyan/purple/indigo gradient headers) — use uniform amber accents
- Category headers: `text-xs text-muted-foreground uppercase tracking-wide font-mono`

- [ ] **Step 2: Update KeyboardShortcutsDialog.tsx**

Read `src/components/ui/KeyboardShortcutsDialog.tsx`. Key changes per spec 6.5:
- **Remove**: cyan gradient header — use `bg-card border-b border-border`
- Key badge: `bg-muted border border-border rounded-md font-mono text-xs px-2 py-1 shadow-sm`
- Search/filter pills: `bg-foreground/5 border border-border rounded-full text-xs`
- Category headers: `text-sm font-display font-semibold text-foreground`
- Floating button: keep drag functionality, restyle to `bg-card border border-border rounded-lg shadow-lg`

- [ ] **Step 3: Update ThemeToggle.tsx**

Read `src/components/ui/ThemeToggle.tsx`. Update per spec:
- Sun icon: `text-primary` (amber, was amber-500 — should auto-map now)
- Moon icon: `text-muted-foreground` (was blue-400 — change to neutral)
- Keep Button ghost variant as wrapper

- [ ] **Step 4: Update ListSidebar components**

Read all files in `src/components/ui/ListSidebar/`.

ListSidebarHeader.tsx:
- Search input: apply new Input styles
- Sort dropdown: apply new Dropdown styles
- Create button: apply new Button primary style

ListSidebarItem.tsx:
- Hover: `hover:bg-foreground/5 rounded-lg`
- Selected: `bg-primary/15 border-l-2 border-primary`
- Status badges: use semantic dots (zinc=draft, amber=active, green=done)
- Context menu trigger: `hover:bg-foreground/5`

ListSidebarEmpty.tsx:
- Text: `text-muted-foreground` (verify already correct)

- [ ] **Step 5: Sweep all remaining ui/ files for old colors**

```bash
grep -rn "blue-[3-6]00\|cyan-[3-6]00\|purple-[3-6]00\|indigo-[3-6]00" src/components/ui/ --include="*.tsx" | grep -v node_modules
```

For every file listed in the output, read it and apply the standard color replacements:
- `blue-*` / `cyan-*` / `purple-*` / `indigo-*` → `primary`, `muted`, or `foreground` tokens
- Known files that will appear: `AIReviewDialog.tsx`, `ConfirmDialog.tsx`, `EmptyState.tsx`, `GradientDivider.tsx`, `KeyboardShortcutsHint.tsx`, `PermissionCheckbox.tsx`, `UpdateDialog.tsx`, and potentially others
- `GradientDivider.tsx`: if it exists solely for colored gradients, consider replacing with `border-b border-border` or removing entirely

- [ ] **Step 6: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): restyle QuickSwitcher, KeyboardShortcuts, ThemeToggle, ListSidebar, and all remaining UI components

- QuickSwitcher: remove colored gradients, amber accent, glass container
- KeyboardShortcuts: remove cyan gradient, muted key badges
- ThemeToggle: neutral moon icon
- ListSidebar: amber selected state, foreground/5 hover"
```

---

## Task 5: Global Shell — App Header, Status Bar

**Files:**
- Modify: `src/App.tsx` (434 lines), `src/components/status-bar/McpStatusButton.tsx` (217 lines), `src/components/status-bar/NotificationButton.tsx` (313 lines), `src/components/status-bar/BackgroundTasksButton.tsx` (245 lines), `src/components/status-bar/StopProcessesButton.tsx` (246 lines)

- [ ] **Step 1: Update App.tsx header and shell**

Read `src/App.tsx`. Update:
- Header: `bg-background border-b border-border` (spec 3.1)
- Tab navigation (Specs/Workflows): inactive `text-muted-foreground`, active `text-foreground border-b-2 border-primary`
- Status bar area: `bg-background-alt border-t border-border` (spec 3.2)
- Remove any blue/colored accents in the shell
- Keep macOS drag region unchanged

- [ ] **Step 2: Update McpStatusButton.tsx**

Read `src/components/status-bar/McpStatusButton.tsx`. Update:
- Default: `text-muted-foreground text-xs`
- Hover: `text-foreground bg-foreground/5 rounded-md`
- Connected status: `text-success` (green dot)
- Error status: `text-destructive` (red dot)
- Warning status: `text-primary` (amber dot)

- [ ] **Step 3: Update NotificationButton.tsx**

Read `src/components/status-bar/NotificationButton.tsx`. Update:
- Button: same status bar style as McpStatus
- Unread badge: `bg-primary text-primary-foreground` (amber, was red)
- Notification dropdown: `bg-card border border-border rounded-lg shadow-lg`
- Individual notifications: `hover:bg-foreground/5`

- [ ] **Step 4: Update BackgroundTasksButton.tsx**

Read `src/components/status-bar/BackgroundTasksButton.tsx`. Update:
- Loading animation: use `text-primary` for spinner
- Task list: `bg-card border border-border rounded-lg`
- Progress indicators: `bg-primary` fill

- [ ] **Step 5: Update StopProcessesButton.tsx**

Read `src/components/status-bar/StopProcessesButton.tsx`. Update:
- Danger styling: `text-destructive hover:bg-destructive/10`
- Confirmation dialog: uses Dialog primitive (already updated in Task 3)

- [ ] **Step 6: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/status-bar/
git commit -m "feat(ui): restyle app shell header and status bar

- Header: background with border-border, amber tab indicator
- Status bar: background-alt surface, muted text
- Status buttons: semantic state colors (amber/green/red)"
```

---

## Task 6: Settings — All Components

**Files:**
- Modify: `src/components/settings/SettingsPage.tsx`, `src/components/settings/McpSettingsPanel.tsx`, `src/components/settings/SettingsButton.tsx`, `src/components/settings/ShortcutEditor.tsx`
- Modify: `src/components/settings/ui/SettingCard.tsx`, `src/components/settings/ui/SettingInfoBox.tsx`, `src/components/settings/ui/SettingRow.tsx`, `src/components/settings/ui/SettingSection.tsx`
- Modify: `src/components/settings/panels/AppearanceSettingsPanel.tsx`, `src/components/settings/panels/AboutSettingsPanel.tsx`, `src/components/settings/panels/McpSettingsFullPanel.tsx`, `src/components/settings/panels/ShortcutsSettingsPanel.tsx`, `src/components/settings/panels/StorageSettingsPanel.tsx`, `src/components/settings/panels/DataSettingsPanel.tsx`, `src/components/settings/panels/NotificationSettingsPanel.tsx`
- Modify: `src/components/settings/mcp/MCPActionEditor.tsx`, `src/components/settings/mcp/MCPActionSettings.tsx`, `src/components/settings/mcp/MCPActionHistory.tsx`, `src/components/settings/mcp/ActionConfirmationDialog.tsx`, `src/components/settings/mcp/UnifiedActivityLog.tsx`, `src/components/settings/mcp/ServerStatusCard.tsx`, `src/components/settings/mcp/QuickSetupSection.tsx`, `src/components/settings/mcp/PermissionQuickModeSelector.tsx`, `src/components/settings/mcp/ToolPermissionMatrix.tsx`

- [ ] **Step 1: Update SettingsPage.tsx and shared UI components**

Read `src/components/settings/SettingsPage.tsx` and all files in `src/components/settings/ui/`. Update:
- SettingsPage nav sidebar: `bg-background-alt`, active item `bg-primary/15 text-primary`
- Remove any purple/blue gradient references in SettingsPage
- SettingSection: title `text-lg font-display font-semibold`, `border-b border-border pb-6 mb-6`
- SettingRow: `flex justify-between items-center py-3`
- SettingCard: `bg-card border border-border rounded-xl`
- SettingInfoBox: replace colored backgrounds with `bg-primary/10` or `bg-muted`

- [ ] **Step 2: Update AppearanceSettingsPanel.tsx**

Read `src/components/settings/panels/AppearanceSettingsPanel.tsx`. Update:
- Theme preview cards: `bg-card border border-border rounded-xl p-4`
- Selected card: `border-2 border-primary shadow-glow-sm`
- Update card mockup colors to show new dark/light palette
- Sun/Moon/Monitor icons: use `text-primary`/`text-muted-foreground`/`text-muted-foreground`

- [ ] **Step 3: Update AboutSettingsPanel.tsx**

Read `src/components/settings/panels/AboutSettingsPanel.tsx`. Update:
- Remove R/E/W gradient text — use `text-foreground` or `text-primary` for version
- Link styling: `text-primary hover:underline`
- Built status indicator: semantic colors

- [ ] **Step 4: Update McpSettingsFullPanel.tsx (1313 lines)**

Read `src/components/settings/panels/McpSettingsFullPanel.tsx`. This is the largest panel. Apply the common color replacements:
- `blue-500/600/400` → `primary`
- `cyan-500/400` → `primary`
- Colored backgrounds → `bg-primary/15` or `bg-muted`
- Colored borders → `border-border` or `border-primary/20`
- Keep `text-destructive` for dangerous operations

- [ ] **Step 5: Update remaining panels (Shortcuts, Storage, Data, Notification)**

For each of these 4 panels, read and apply the same color replacement pattern as Step 4:
- `src/components/settings/panels/ShortcutsSettingsPanel.tsx`
- `src/components/settings/panels/StorageSettingsPanel.tsx`
- `src/components/settings/panels/DataSettingsPanel.tsx`
- `src/components/settings/panels/NotificationSettingsPanel.tsx`

- [ ] **Step 6: Update MCP sub-components (8 files)**

Read all files in `src/components/settings/mcp/`. These contain 37+ old-color references. For each file, apply the common replacements:
- `MCPActionEditor.tsx`, `MCPActionSettings.tsx`, `MCPActionHistory.tsx`
- `ActionConfirmationDialog.tsx`, `UnifiedActivityLog.tsx`
- `ServerStatusCard.tsx`, `QuickSetupSection.tsx`
- `PermissionQuickModeSelector.tsx`, `ToolPermissionMatrix.tsx`

Also update `src/components/settings/McpSettingsPanel.tsx` (top-level MCP panel).

- [ ] **Step 7: Update SettingsButton.tsx and ShortcutEditor.tsx**

Read and update remaining settings files:
- `SettingsButton.tsx`: icon color, hover state
- `ShortcutEditor.tsx`: key badge styling, focus ring

- [ ] **Step 8: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 9: Commit**

```bash
git add src/components/settings/
git commit -m "feat(ui): restyle all settings components to Minimalist Dark

- SettingsPage: background-alt nav, amber active state
- Shared UI: SettingSection/Row/Card with new tokens
- All 7 panels: remove blue/cyan/purple accents
- MCP sub-components (8 files): replace colored accents
- Theme preview cards: updated for new dark/light palette"
```

---

## Task 7: Spec Editor

**Files:**
- Modify: `src/components/spec-editor/SpecList.tsx` (263 lines), `src/components/spec-editor/SpecEditor.tsx` (432 lines), `src/components/spec-editor/MarkdownEditor.tsx` (189 lines), `src/components/spec-editor/FrontmatterForm.tsx` (316 lines), `src/components/spec-editor/NewSpecDialog.tsx` (111 lines)

- [ ] **Step 1: Update SpecList.tsx**

Read `src/components/spec-editor/SpecList.tsx`. Update per spec 4.1:
- List container: `bg-background-alt`
- Item hover: `hover:bg-foreground/5 rounded-lg`
- Selected item: `bg-primary/15 border-l-2 border-primary`
- Status badges: draft=zinc dot, active=amber dot, done=green dot
- Search/create: inherits from ListSidebar (already updated in Task 4)

- [ ] **Step 2: Update SpecEditor.tsx**

Read `src/components/spec-editor/SpecEditor.tsx`. Update:
- Split pane container: `bg-background`
- Splitter: `w-1 bg-transparent hover:bg-primary/20 cursor-col-resize transition-colors`
- Toolbar buttons: ghost button style (already updated)
- Action buttons (save/cancel): primary/secondary button styles

- [ ] **Step 3: Update MarkdownEditor.tsx**

Read `src/components/spec-editor/MarkdownEditor.tsx`. Update:
- Editor container: `bg-card rounded-xl border border-border`
- Toolbar: `border-b border-border` with ghost icon buttons
- Prose rendering: add Tailwind Typography customization:
  - `prose-headings:font-display prose-headings:text-foreground`
  - `prose-p:text-foreground/90`
  - `prose-code:font-mono prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md`
  - `prose-a:text-primary prose-a:no-underline hover:prose-a:underline`
  - `prose-hr:border-border`

- [ ] **Step 4: Update FrontmatterForm.tsx**

Read `src/components/spec-editor/FrontmatterForm.tsx`. Update:
- Labels: `font-mono text-xs uppercase tracking-wide text-muted-foreground`
- Input fields: inherits from Input component (already updated)
- Color picker/selects: inherits from Select component (already updated)

- [ ] **Step 5: Update NewSpecDialog.tsx**

Read `src/components/spec-editor/NewSpecDialog.tsx`. Update:
- Uses Dialog + Input + Button primitives (already updated)
- Verify no hardcoded colors remain

- [ ] **Step 6: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/components/spec-editor/
git commit -m "feat(ui): restyle spec editor to Minimalist Dark

- SpecList: amber selected state, semantic status dots
- MarkdownEditor: glass card container, prose typography
- FrontmatterForm: mono labels, updated inputs
- Splitter: amber hover indicator"
```

---

## Task 8: Workflow Editor

**Files:**
- Modify: `src/components/workflow/WorkflowCanvas.tsx` (66 lines), `src/components/workflow/nodes/PhaseNode.tsx` (119 lines), `src/components/workflow/nodes/GateNode.tsx` (113 lines), `src/components/workflow/nodes/ScriptNode.tsx` (383 lines), `src/components/workflow/edges/AnimatedEdge.tsx` (141 lines), `src/components/workflow/edges/InsertableEdge.tsx` (184 lines)

Also update React Flow CSS in `src/styles.css` (lines ~111-210) if not already done in Task 1.

- [ ] **Step 1: Update React Flow CSS in styles.css**

Read the React Flow section of `src/styles.css` (around lines 111-210). Update:
- `.react-flow__node` base: transparent background (nodes handle their own styling)
- `.react-flow__handle`: `w-3 h-3 bg-muted border-2 border-border rounded-full`
- `.react-flow__controls`: `bg-card border border-border rounded-lg`
- `.react-flow__minimap`: `bg-card border border-border rounded-lg`
- `.react-flow__edge-path`: `stroke: hsl(var(--border))`
- Remove any blue/colored accents from React Flow base CSS

- [ ] **Step 2: Update WorkflowCanvas.tsx**

Read `src/components/workflow/WorkflowCanvas.tsx`. Update per spec 4.2:
- Canvas background: `bg-background`
- Add subtle grid pattern via React Flow's `Background` component or CSS:
  ```
  linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
  background-size: 40px 40px
  ```

- [ ] **Step 3: Update PhaseNode.tsx**

Read `src/components/workflow/nodes/PhaseNode.tsx`. Update per spec 4.2:
- Base: `bg-card/60 backdrop-blur-[8px] border border-border rounded-xl`
- Remove dynamic color top border — use uniform `border-border`
- Selected: `border-primary/40 shadow-glow-sm` (replace blue ring)
- Running: `border-primary animate-pulse-subtle`
- Completed: `border-success/30` + small green dot indicator
- Error: `border-destructive/30` + small red dot indicator
- Remove colored icon backgrounds

- [ ] **Step 4: Update GateNode.tsx**

Read `src/components/workflow/nodes/GateNode.tsx`. Update:
- Base: compact version of PhaseNode glass card
- Diamond indicator: `border-2 border-primary rotate-45` (small, inline)
- Status: passed=`border-success/30`, blocked=`border-primary/30`
- Remove amber/green direct color references — use semantic tokens

- [ ] **Step 5: Update ScriptNode.tsx**

Read `src/components/workflow/nodes/ScriptNode.tsx` (383 lines — complex). Update:
- Base: `bg-card/60 rounded-lg border border-border`
- Terminal icon: `text-muted-foreground`
- Script name: `font-mono text-xs`
- Status indicator: use semantic colors (running=amber, done=green, error=red)
- Collapsible sections: keep functionality, restyle borders/backgrounds
- Input/output bindings: `text-xs text-muted-foreground font-mono`

- [ ] **Step 6: Update AnimatedEdge.tsx**

Read `src/components/workflow/edges/AnimatedEdge.tsx`. Update:
- Default stroke: `hsl(var(--border))` color
- Running: `stroke: hsl(var(--primary))` with subtle opacity animation
- Completed: `stroke: hsl(var(--success) / 0.5)`
- Remove blue-specific colors

- [ ] **Step 7: Update InsertableEdge.tsx**

Read `src/components/workflow/edges/InsertableEdge.tsx`. Update:
- Stroke: `hsl(var(--border))` (dashed)
- Insert button: `bg-card border border-border rounded-full hover:border-primary hover:shadow-glow-sm`
- Hover state: `stroke: hsl(var(--foreground) / 0.3)`

- [ ] **Step 8: Sweep all remaining workflow/ files for old colors**

```bash
grep -rn "blue-[3-6]00\|cyan-[3-6]00\|purple-[3-6]00\|indigo-[3-6]00" src/components/workflow/ --include="*.tsx" | grep -v node_modules
```

For every file listed in the output, read it and apply the standard color replacements. Known files that will appear: `WorkflowEditor.tsx`, `WorkflowToolbar.tsx`, `VisualCanvas.tsx`, `WorkflowSidebar.tsx`, `WorkflowSelector.tsx`, `WorkflowNode.tsx`, `WorkflowConnection.tsx`, `WorkflowOutputPanel.tsx`, `WorkflowPreview.tsx`, `WorkflowExecutionStatus.tsx`, `ExecutionHistoryPanel.tsx`, `NodePanel.tsx`, `OutputNodeGroup.tsx`, `StartNode.tsx`, `TriggerWorkflowNode.tsx`, `VirtualizedOutputList.tsx`, `TemplateSelector.tsx`, `TriggerWorkflowPanel.tsx`, `WebhookSettingsDialog.tsx`, and potentially others.

Apply same patterns:
- Status colors (running=`primary`, completed=`success`, error=`destructive`)
- Active/selected = `primary` (amber)
- Backgrounds = `bg-card/60`, `bg-muted`, `bg-foreground/5`
- Borders = `border-border`, `border-primary/20`

- [ ] **Step 9: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 10: Commit**

```bash
git add src/components/workflow/ src/styles.css
git commit -m "feat(ui): restyle workflow editor to Minimalist Dark

- Canvas: subtle grid background
- PhaseNode: glass card with amber selected/running states
- GateNode: compact glass card with diamond indicator
- ScriptNode: glass card, mono typography
- Edges: border-color strokes, amber for active
- React Flow CSS: updated controls, minimap, handles"
```

---

## Task 9: Terminal

**Files:**
- Modify: `src/components/terminal/ScriptPtyTerminal.tsx` (744 lines), `src/components/terminal/TerminalOutput.tsx` (122 lines), `src/components/terminal/TerminalTab.tsx` (70 lines), `src/components/terminal/TerminalStatusBar.tsx` (40 lines), `src/components/terminal/TerminalSearchBar.tsx` (85 lines)

Also update xterm CSS in `src/styles.css` (around lines 212-301) if not already done.

- [ ] **Step 1: Update xterm CSS in styles.css**

Read the xterm section of `src/styles.css`. Update:
- Terminal scrollbar: 4px width, `foreground/10` thumb
- Link color: `text-primary` (amber, was blue-400)
- Selection: use CSS variable or keep hardcoded per theme

- [ ] **Step 2: Update ScriptPtyTerminal.tsx**

Read `src/components/terminal/ScriptPtyTerminal.tsx`. Update xterm theme object:

Dark mode theme:
```js
{
  background: '#0A0A0F',
  foreground: '#FAFAFA',
  cursor: '#F59E0B',
  cursorAccent: '#0A0A0F',
  selectionBackground: 'rgba(245, 158, 11, 0.2)',
  // Standard ANSI colors retained, brightness tuned
}
```

Light mode theme:
```js
{
  background: '#1C1917',
  foreground: '#F5F0EB',
  cursor: '#D97706',
  cursorAccent: '#FFFBEB',
  selectionBackground: 'rgba(217, 119, 6, 0.2)',
}
```

Terminal container: `bg-background rounded-xl border border-border overflow-hidden`

- [ ] **Step 3: Update TerminalTab.tsx**

Read `src/components/terminal/TerminalTab.tsx`. Update:
- Active tab: `text-foreground border-b-2 border-primary`
- Inactive tab: `text-muted-foreground hover:text-foreground`
- Close button: `hover:bg-foreground/5 rounded`

- [ ] **Step 4: Update TerminalStatusBar.tsx**

Read `src/components/terminal/TerminalStatusBar.tsx`. Update:
- Background: `bg-background-alt border-t border-border`
- Text: `text-xs font-mono text-muted-foreground`

- [ ] **Step 5: Update TerminalSearchBar.tsx and TerminalOutput.tsx**

Read both files. Update:
- Search input: consistent with Input component styles
- Match highlighting: `bg-primary/30 text-foreground`
- Output container: `text-sm font-mono`

- [ ] **Step 6: Build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/components/terminal/ src/styles.css
git commit -m "feat(ui): restyle terminal to Minimalist Dark

- xterm theme: deep slate bg, amber cursor and selection
- Terminal tabs: amber active indicator
- Status bar: background-alt surface
- Search: amber match highlighting"
```

---

## Task 10: Onboarding + Final Verification

**Files:**
- Modify: `src/components/onboarding/FirstRunWizard.tsx` (333 lines)

- [ ] **Step 1: Update FirstRunWizard.tsx**

Read `src/components/onboarding/FirstRunWizard.tsx`. Update per spec 4.5:
- Full screen: `bg-background`
- Add ambient orb: inline `radial-gradient(ellipse, rgba(245,158,11,0.05), transparent 70%)` centered
- Title: `font-display text-4xl font-bold tracking-tight`
- Subtitle: `text-lg text-muted-foreground`
- Step dots: `bg-muted` (pending), `bg-primary` (current), `bg-primary/50` (completed)
- Preset cards: `bg-card/60 border border-border rounded-xl p-6`
  - Hover: `hover:border-foreground/15 hover:scale-[1.02] transition-all duration-300`
  - Selected: `border-primary shadow-glow-sm`
- CTA button: primary variant, `h-12 px-8` (large size)

- [ ] **Step 2: Commit onboarding**

```bash
git add src/components/onboarding/
git commit -m "feat(ui): restyle onboarding wizard to Minimalist Dark

- Full-screen with ambient amber orb
- Glass preset cards with glow selection
- Display font headings, step indicator dots"
```

- [ ] **Step 3: Full build verification**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npm run build 2>&1 | tail -20
```

Expected: Clean build with no errors.

- [ ] **Step 4: Visual verification checklist**

Start the dev server and visually verify each area:

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow && npm run dev
```

Check in browser at http://localhost:1420 (or Tauri app):

- [ ] Dark mode: deep slate background, amber accents, glass cards
- [ ] Light mode: warm paper background, deeper amber, white cards
- [ ] System mode: follows OS preference
- [ ] Theme toggle: smooth transition, no flash
- [ ] Header: correct background, amber tab indicator
- [ ] Status bar: background-alt surface, all buttons functional
- [ ] Spec list: amber selected state, status dots visible
- [ ] Spec editor: glass card editor, prose renders correctly
- [ ] Workflow canvas: subtle grid, glass nodes
- [ ] Workflow nodes: state indicators (selected/running/completed/error)
- [ ] Settings: all panels readable, no stray colors
- [ ] Terminal: correct xterm theme, amber cursor
- [ ] QuickSwitcher (Cmd+K): glass container, amber selected
- [ ] Keyboard shortcuts dialog: muted key badges
- [ ] Onboarding: ambient orb, glass preset cards
- [ ] Scrollbars: subtle, foreground/10 opacity
- [ ] Focus states: amber ring on buttons, border on inputs
- [ ] Reduced motion: animations disabled when preference set

- [ ] **Step 5: Grep for remaining old color references**

```bash
cd /Users/williehung/Developer/Apps/github/PackageFlow
# Search for old accent colors that should have been replaced
grep -rn "blue-[3-6]00\|cyan-[3-6]00\|purple-[3-6]00\|indigo-[3-6]00\|emerald-[3-6]00" src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".specforge"
# Also check for hardcoded amber that should now be primary token
grep -rn "amber-[3-6]00" src/components/ --include="*.tsx" | grep -v node_modules
```

Legitimate exceptions (do NOT replace):
- ANSI terminal colors in xterm config
- JSON syntax highlighting colors (hardcoded per-theme by design — spec 6.2)
- Any `info` semantic colors using blue (if retained)

All other hits should be replaced with `primary`, `destructive`, `success`, or `muted-foreground` tokens.

- [ ] **Step 6: Final commit if any fixes**

```bash
# Only if Step 5 found issues to fix
git add -A
git commit -m "fix(ui): clean up remaining old color references"
```

- [ ] **Step 7: Add .superpowers to .gitignore if needed**

```bash
# Check if .superpowers is gitignored
grep -q ".superpowers" .gitignore || echo ".superpowers/" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore .superpowers brainstorm files"
```
