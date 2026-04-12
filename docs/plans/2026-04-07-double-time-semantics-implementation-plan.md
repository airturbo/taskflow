# Dual Time Semantics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为待办管理工具落地“计划完成时间 + 硬性 DDL”双时间语义，并保持筛选信息架构克制不膨胀。

**Architecture:** 以最小破坏方式扩展现有时间模型：保留 `startAt` 和现有 `dueAt` 承载排期区间，把 `dueAt` 明确解释为计划完成时间，再新增 `deadlineAt` 承载硬性 DDL。同时把时间型筛选的口径状态持久化到 workspace shell，让“今日 / 未来 7 天”在同一行内切换计划或 DDL 视角。日历继续围绕计划时间排，时间线继续围绕开始/计划区间排，DDL 只作为风险叠加层。

**Tech Stack:** Vite + React + TypeScript、Tauri SQLite repository、localStorage 持久化。

---

### Task 1: 扩展领域模型与持久化

**Files:**
- Modify: `web/src/types/domain.ts`
- Modify: `web/src/data/seed.ts`
- Modify: `web/src/utils/storage.ts`
- Modify: `web/src/utils/desktop-sqlite.ts`
- Modify: `web/src/utils/desktop-repository.ts`

**Step 1:** 给 `Task` 增加 `deadlineAt`，给 `PersistedState` 增加时间型筛选口径状态。

**Step 2:** 在 `seedState` 中补默认值，确保旧数据仍能回退到 `planned` 口径。

**Step 3:** 更新 browser localStorage merge/save、desktop workspace shell save/load，使口径状态能持久化。

**Step 4:** 为 SQLite 增加 migration：`tasks.deadline_at` 与 `workspace_state.selection_time_modes_json`。

**Step 5:** 更新 desktop repository 的任务映射、查询参数和 workspace shell 读写。

---

### Task 2: 重写系统时间筛选语义

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/utils/desktop-repository.ts`
- Modify: `web/src/utils/dates.ts`（如需）

**Step 1:** 在 `WorkspaceApp` 中建立 `today/upcoming` 的时间口径状态与切换动作。

**Step 2:** 改造 `getTasksForSelection()`，让 `system:today` / `system:upcoming` 根据当前口径匹配 `dueAt` 或 `deadlineAt`。

**Step 3:** 改造 desktop repository 查询与 selection counts，让桌面端结果和浏览器端一致。

**Step 4:** 让导航按钮支持同一行内切换“计划 / DDL”，且不误触发行点击。

---

### Task 3: 改造详情面板与任务卡片

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`

**Step 1:** 把详情面板的时间区块改成“开始时间 / 计划完成 / 硬性 DDL”。

**Step 2:** 加入冲突提示：当计划完成晚于 DDL 时即时提醒。

**Step 3:** 把列表卡片主时间改成计划完成，并用轻量 badge 展示 DDL。

**Step 4:** 看板 / 四象限复用同样的双时间表达规则，避免每个视图说不同语言。

---

### Task 4: 改造日历、时间线与提醒文案

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/utils/reminder-engine.ts`
- Modify: `web/src/index.css`

**Step 1:** 保持日历按计划完成 / 开始时间落点，不让 DDL 变成第二个主锚点。

**Step 2:** 在日历条目和时间线中增加 DDL 风险标识。

**Step 3:** 时间线条继续表达开始 → 计划完成，DDL 只做 marker。

**Step 4:** 提醒文案和“到期”触发优先指向 DDL；若没有 DDL，再回退计划完成。

---

### Task 5: 回归验证与体验复审

**Files:**
- Modify: `.agent-team/artifacts/by-type/UX_REVIEW_REPORT/`（新增）
- Modify: `.agent-team/artifacts/by-type/UX_ISSUE_LOG/`（新增）

**Step 1:** 运行 `npm run build` 验证前端构建。

**Step 2:** 用前台真实交互复查：详情编辑、今日/未来 7 天切换、列表卡片、日历、时间线。

**Step 3:** 记录体验问题并立即回收明显违和点。

**Step 4:** 产出 focused UX review 结论，说明本轮还有哪些问题被关闭、哪些留待下一轮。
