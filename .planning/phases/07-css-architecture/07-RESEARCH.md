# Phase 7: CSS 架构 — Research

**Date:** 2026-04-13

---

## 1. 现状摸底

### CSS 文件清单

| 文件 | 行数 | 状态 |
|------|------|------|
| `web/src/index.css` | 6921 | 主体，全局 import in `main.tsx` |
| `web/src/App.css` | 321 | **未被任何文件 import** — 死代码 |
| `web/src/components/CommandPalette.css` | 169 | 已被 `CommandPalette.tsx` import（非 module） |

**App.css 是孤立文件**，内容是 Vite 脚手架默认模板残留，可直接删除。

### index.css 内部结构

index.css 分为两大块：
- **桌面/共享段（L1–L2750）**：~2750 行，设计系统 tokens + 全局 reset + 组件样式
- **响应式+移动端（L2751–L6921）**：~4170 行，4 个断点的 media queries + 大量 `.is-phone` scoped 规则

具体 section 分布（按行号）：

```
L1–125    全局滚动条 + :root design tokens + 全局 reset
L126–172  Layout (.app-shell)
L173–578  Sidebar (含文件夹标题、NavButton)
L579–605  Main Content Areas (.main-stage, .right-rail)
L606–646  Composer
L647–670  View Switcher
L671–983  Buttons + Tags/TagManager（共享工具类）
L984–1079 Shortcut Panel
L1080–1160 Export Panel
L1161–1422 Workspace (TaskList/TaskCard — 大块)
L1423–1836 Calendar
L1837–1930 Agenda
L1931–2028 Kanban
L2029–2175 Timeline
L2176–2253 Matrix
L2254–2288 Tools Layout + Habits
L2289–2362 Stats
L2363–2518 Right Rail
L2519–2736 Detail Card
L2737–2750 Empty State
L2751–L6921 响应式断点 + 移动端（体量超过桌面端）
```

### 组件目录

| 目录 | 文件数 |
|------|--------|
| `src/components/` | 20 个 .tsx |
| `src/components/views/` | 6 个 .tsx |
| `src/mobile/` | 7 个 .tsx |
| **总计** | **37 个 .tsx** |

---

## 2. CSS Modules 关键技术事实

### Vite 原生支持
Vite 8 对 `.module.css` 开箱即用，无需额外配置。命名规则：文件名以 `.module.css` 结尾，Vite 自动将类名 hash 化（production）或加前缀（dev）。

### 使用方式
```tsx
import styles from './AppSidebar.module.css'
// ...
<div className={styles.brandBlock}>
```

### TypeScript 类型
Vite 会为 CSS Modules 生成隐式类型，无需 `*.d.ts`。`tsconfig.app.json` 默认包含 `moduleResolution: bundler`，已覆盖。

### 全局样式保留
`:root`、`*`、`html`/`body`、`@keyframes`、`@media` 等全局规则**必须留在 index.css**（或专门的 `variables.css` / `globals.css`）。CSS Modules 只 scope 类名，不 scope 这些。

---

## 3. 核心规划难题

### 难题 A：共享工具类（ghost-button, icon-button 等被 17 个组件使用）

`ghost-button`、`primary-button` 等按钮类被 **17 个组件**跨文件使用。CSS Modules 会将类名局部化，这意味着：
- **方案 1**：保留为全局类（留在 index.css），不 module 化。简单，无迁移成本。
- **方案 2**：提取为 `shared/buttons.module.css`，每个用到的组件 `import` 进来。干净，但有大量 import 改动。
- **方案 3**：用 `:global(.ghost-button)` 写在各自 module.css 里。反模式，不推荐。

**结论**：共享工具类最好归到一个 `src/styles/shared.module.css`（或直接留全局），而非强行分散。

### 难题 B：`.is-phone` 跨组件 scoping

`is-phone` 是加在 body/root 层级的全局标记类（由 `App.tsx` 根据 viewport 宽度写入），用于 CSS 选择器如 `.is-phone .kanban-card { ... }`。

这类**父选择器跨组件**的规则无法直接用 CSS Modules scope：
- 在 `KanbanView.module.css` 中写 `.is-phone .kanbanCard { ... }` — **无效**，因为 `.is-phone` 是全局类、`.kanbanCard` 是 scoped
- 需要用 `:global(.is-phone) .kanbanCard { ... }` — 这是 CSS Modules 的正规 `:global` escape

**数量**：index.css 中有 **67 处** `.is-phone` 规则，分布在几乎所有视图 section 中。

### 难题 C：响应式 media query 归属

响应式 `@media (max-width: 1280px)` 规则影响多个组件（e.g., `.stats-grid`, `.kanban-grid`, `.matrix-grid` 同在一个 `@media` 块里）。

- **方案 1（推荐）**：各组件的 media query 拆入各自 module.css — 每个组件自治，Phase 8 路由等后续阶段好维护
- **方案 2**：保留响应式段在 index.css 不动 — 简单但违反模块化目标

### 难题 D：移动端 CSS 体量（~4170 行）vs 移动端组件文件

移动端 CSS 有 7 个 mobile 组件，但 CSS 里移动端代码散布在：
1. 各桌面 section 的末尾（`.is-phone .kanban-card` 穿插在 Kanban section）
2. 独立的 mobile section（L3136 移动端顶部标题栏 → L6921）

这意味着**同一个组件的 CSS 不连续**，散落在 index.css 多处。拆分时需要**按组件汇聚**，而非按文件行顺序切割。

---

## 4. 规划关键决策点

> 这些决策影响 task breakdown，必须在 PLAN 阶段明确。

### D1：拆分粒度策略

**全量 module 化** vs **分层 module 化**：

| 策略 | 说明 | 优 | 劣 |
|------|------|----|----|
| A. 全量 module 化 | 所有组件都拆 .module.css | 最彻底 | 工作量最大，共享类处理复杂 |
| B. 分层 module 化 | 组件私有 → module；全局/共享 → globals.css | 实用，风险低 | 仍保留部分全局 CSS |
| C. 按视图 module 化 | 6 个视图各一个 module.css + 共享留全局 | 最快 | 颗粒度粗 |

**推荐**：策略 B — 分层模块化。globals.css（design tokens + reset + shared utilities），组件私有 CSS → .module.css。

### D2：共享工具类处理

- 选项 1：留 `index.css`（rename to `globals.css`）全局
- 选项 2：提取 `src/styles/shared.module.css` + 各组件 import

推荐选项 1（留全局），因为按钮类是真正的"UI 原语"，强行 scope 会增大 diff 且无实际收益。

### D3：App.css 处置

直接**删除**（未被 import，是死代码）。

### D4：CommandPalette.css 处置

`CommandPalette.css` 已是独立 CSS（非 module），可：
- 保持现状（rename to `.module.css` 并改 import）
- 或纳入 module 化统一处理

成本低，建议纳入统一处理。

### D5：移动端 CSS 归属

- 选项 1：桌面+移动组件 CSS 合并在同一个 module（如 `AppSidebar.module.css` 含所有 `.is-phone .sidebar-*` 规则）
- 选项 2：移动端有独立 `src/styles/mobile.css`（全局，不 module 化）

选项 1 更模块化，但需要大量 `:global(.is-phone)` 写法。选项 2 回避了难题但不彻底。

---

## 5. MINOR-04：主内容区滚动条 thin auto-hide

**需求**：`.main-stage`（主内容区）的滚动条改为 thin + auto-hide 风格。

**现状**：
```css
/* index.css L17-29: 全局隐藏滚动条 */
* { scrollbar-width: none; }
::-webkit-scrollbar { display: none; }

/* 局部例外类 */
.scrollbar-visible { scrollbar-width: thin; scrollbar-color: rgba(128,128,128,0.2) transparent; }
```

**目标行为**：
- `scrollbar-width: thin`（Firefox）
- Webkit: 4px 宽，hover 时显示，idle 时淡出（auto-hide）
- Webkit 原生不支持 auto-hide，需用 CSS 透明度动画模拟（`::-webkit-scrollbar-thumb` + `opacity: 0` + `transition` + hover `opacity: 1`）

**实现位置**：`.main-stage` 规则（L151）所在文件，或直接加 class/style。

**注意**：Tauri WebKit 与 Chrome 行为可能略有差异，需注意测试覆盖。

---

## 6. 目标文件结构（规划参考）

```
web/src/
├── styles/
│   ├── globals.css          # :root tokens, reset, shared utils (ghost-button etc.), @keyframes
│   └── scrollbars.css       # 可选：滚动条规则单独抽出（MINOR-04）
├── components/
│   ├── AppSidebar.module.css
│   ├── AppTopBar.module.css
│   ├── CommandPalette.module.css   (rename from .css)
│   ├── ExportPanel.module.css
│   ├── InlineCreatePopover.module.css
│   ├── MobileTabBar.module.css
│   ├── ReminderCenterPanel.module.css
│   ├── ShortcutPanel.module.css
│   ├── TagManagementDialog.module.css
│   ├── TaskBottomSheet.module.css
│   ├── TaskDetailPanel.module.css
│   ├── WorkspaceShell.module.css   (Layout, Main Stage)
│   └── views/
│       ├── ListView.module.css
│       ├── CalendarView.module.css
│       ├── KanbanView.module.css
│       ├── TimelineView.module.css
│       ├── MatrixView.module.css
│       └── StatsView.module.css
└── mobile/
    ├── MobileFocusView.module.css
    ├── MobileCalendarView.module.css
    ├── MobileMatrixView.module.css
    ├── MobileMeView.module.css
    ├── MobileProjectsView.module.css
    ├── MobileSheets.module.css
    └── MobileTaskDetailContent.module.css
```

**index.css 剩余内容**（main.tsx 继续 import）：
- 重定向 `@import './styles/globals.css'`，或直接内联保留

---

## 7. 迁移策略建议

### 迁移顺序（由简到难）
1. **删除 App.css**（死代码，零风险）
2. **提取 globals.css**（tokens + reset + shared utils — 不改任何 TSX）
3. **按组件逐一迁移**（先简单组件如 ShortcutPanel、ExportPanel，再复杂如 AppSidebar、ListView）
4. **视图 CSS 迁移**（含 @media 拆分）
5. **移动端 CSS 汇聚**（最复杂，`.is-phone` `:global` 处理）
6. **MINOR-04 滚动条**（加在 WorkspaceShell.module.css 或 globals）

### 迁移单元粒度
每个 task = **1 个组件**的 CSS 迁移 + 对应 TSX 的 className 更新。这样每步可独立测试。

### 风险
- **className 漏改**：TSX 用字符串引用 CSS 类名，漏改会样式丢失但不报错。需要视觉回归测试。
- **`.is-phone` scoping**：`:global(.is-phone) .localClass` 语法需手动逐一处理，容易遗漏。
- **移动端 CSS 汇聚成本**：~4170 行移动端 CSS 散落在多处，需要按组件 grep 归集，工作量较大。

---

## 8. 工作量估算校准

原估算 3.5d（ARCH-02）+ 0.5d（MINOR-04）= 4d 总计。

基于实际规模：
- globals.css 提取：0.5d（无 TSX 改动）
- 桌面组件迁移（~20 个组件，含 TSX className 更新）：1.5d
- 视图迁移（6 个，含 @media 拆分）：0.5d
- 移动端 CSS 汇聚（7 个 mobile 组件，`.is-phone` `:global` 处理）：1d
- MINOR-04 滚动条：0.25d
- 测试/验证：0.25d

**总计约 4d，与原估算吻合。移动端是最大风险项。**
