# Phase 5: 安全网 + 速赢 - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

建立错误隔离 + 离线队列防护 + 移除有害全局 transition + 移动端完成操作速赢。
纯安全网/基础设施改动，不改变业务逻辑，不改变 UI 布局，不改变数据模型。

Requirements:
- ARCH-03: 每个视图独立 React Error Boundary，崩溃不影响其他区域
- ARCH-04: 离线队列 500 条上限 + 7 天过期策略
- ARCH-05: 移除全局 `* { transition: all }`，按需声明精确 transition
- UX-01: 移动端完成任务移除确认弹窗，改为 Undo Toast

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure/safety-net phase. Key guidelines from optimization plan:
- Error Boundary: 顶层 + 视图级双层。视图崩溃显示"此视图出现问题 — 切换到其他视图 / 重新加载" + 复制调试信息按钮
- 离线队列: MAX_QUEUE_SIZE=500, MAX_AGE_MS=7*86400000, 入队时检查容量超限丢最旧, flush前过滤过期
- Transition: 精确声明 ~12 个需要动画的元素（sidebar toggle, modal opacity, card hover shadow, check button 等）
- UX-01: 完成任务路径移除 MobileConfirmSheet 调用，直接 toggle + 显示 Undo Toast（3s 自动消失）。确认对话框仅保留在永久删除场景

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `web/src/App.tsx` (3441 lines) — 完成任务路径中调用 MobileConfirmSheet (line 3333)
- `web/src/mobile/MobileFocusView.tsx` — onToggleComplete callback
- `web/src/mobile/MobileSheets.tsx` (line 265) — MobileConfirmSheet 组件
- `web/src/utils/offline-queue.ts` — 当前无容量限制
- `web/src/index.css` — 全局 `* { transition: all 0.15s ease }` 
- `web/src/main.tsx` — 应用入口，需包裹 Error Boundary
- `web/src/stores/mobileUiStore.ts` — completionToast, showCompletionToast 已存在

### Established Patterns
- React 19 + TypeScript strict
- 移动端 UI 状态通过 Zustand mobileUiStore 管理
- completionToast 已有实现基础，可直接复用

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure/safety-net phase. Refer to optimization plan for detailed approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
