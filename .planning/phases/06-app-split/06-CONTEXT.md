# Phase 6: App.tsx 拆分 - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure refactor — discuss skipped)

<domain>
## Phase Boundary

将 App.tsx 从 3441 行巨石组件拆分为 <400 行壳 + 5+ 个独立状态 hooks + 3 个布局组件。
纯重构，不改变任何用户可见行为。每个子步骤独立 commit，全程行为对等。

Requirements:
- ARCH-01: App.tsx 拆分至 <400 行，状态分域为 5+ 个独立 hooks

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure refactor phase. Key guidelines from optimization plan:

**拆分策略（渐进式，4 个子步骤）：**

1. **状态分域盘点** — 将 App.tsx ~50+ useState 归类为 7 个域：
   - 导航: currentView, calendarMode, calendarAnchor, activeSelection
   - CRUD: tasks, folders, lists, tags, filters + 所有 update/toggle/delete 函数
   - 选择: selectedTaskId, bulkSelectedIds, bulkMode
   - 过滤: searchInput, searchKeyword, selectedTagIds
   - UI 弹窗: tagManagerOpen, commandPaletteOpen, exportPanelOpen, inlineCreate, shortcutPanelOpen
   - 视图配置: timelineScale, calendarMode, calendarShowCompleted, projectionInsightMode
   - 同步: syncStatus 相关（已在 useRealtimeSync.ts 中）

2. **逐域抽取 hook（每域一个 commit）**：
   - useModalState.ts — 所有弹窗/面板开关状态
   - useTaskSelection.ts — 任务选择 + 批量操作状态
   - useFilterEngine.ts — 搜索 + 标签过滤状态
   - useViewConfig.ts — 视图专属配置状态
   - useNavigation.ts — 视图切换 + 侧边栏选择状态

3. **清理 useViewState.ts 死代码** — 当前未被 App.tsx 使用（App.tsx 在 line 642-698 重新声明了同名状态），与新 hooks 合并或删除

4. **抽取 AppShell / Sidebar / HeaderBar** — App.tsx 最终只剩 hook 调用 + context providers + <AppShell>

**关键约束：**
- 不改变任何用户可见行为
- 每个子步骤独立 git commit，便于回滚
- 抽取后的 hook 无跨域 import（选择 hook 不 import 过滤状态）

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `web/src/App.tsx` (3441 lines) — 当前上帝组件
- `web/src/hooks/useViewState.ts` — 已抽取但未使用的死代码
- `web/src/hooks/useWorkspaceData.ts` — 数据 CRUD hook（已存在）
- `web/src/hooks/useAuth.ts` — 认证 hook（已存在）
- `web/src/hooks/useRealtimeSync.ts` — 同步 hook（已存在）
- `web/src/hooks/useGlobalShortcuts.ts` — 快捷键 hook（已存在）
- `web/src/stores/mobileUiStore.ts` — Zustand 移动端状态（已存在）
- `web/src/components/WorkspaceSidebar.tsx` — 侧边栏子组件（已存在）

### Established Patterns
- React 19 + TypeScript strict
- 自定义 hooks 返回 state + setters 的对象
- Zustand 用于移动端 UI 状态

</code_context>

<specifics>
## Specific Ideas

No specific requirements — pure refactor phase. App.tsx 目标 < 400 行。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
