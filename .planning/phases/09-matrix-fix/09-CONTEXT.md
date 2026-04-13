# Phase 9 Context — 四象限修正（isUrgent/isImportant 独立字段）

## 背景

Phase 9 目标：将 Eisenhower 矩阵的 urgent/important 状态从**标签驱动**改为**独立布尔字段**驱动。

当前实现的问题：
- `getQuadrant(task)` 依赖 `task.tagIds.includes('tag-urgent')` 判断
- 拖拽改象限 → 修改 tagIds（`getTagIdsForQuadrant`）
- 特殊标签 `tag-urgent` / `tag-important` 混入普通标签列表，用户可误删
- 无法单独表达"紧急但不想在标签里显示"的语义

## 目标架构

在 Task 类型新增两个独立布尔字段：
```typescript
isUrgent: boolean    // 是否紧急
isImportant: boolean // 是否重要
```

- `getQuadrant(task)` 改为读 `isUrgent` / `isImportant`
- `moveTaskToQuadrant` 改为更新 `isUrgent` / `isImportant`
- 标签 `tag-urgent` / `tag-important` 保留用于显示历史数据，迁移时同步写入独立字段
- 卡片显示分类理由 pill（Q1/Q2/Q3/Q4 badge）+ hover tooltip

## 关键文件

| 文件 | 用途 |
|------|------|
| `packages/taskflow-core/src/domain.ts` | Task 接口定义 |
| `packages/taskflow-core/src/selectors.ts` | `getQuadrant`, `getTagIdsForQuadrant` |
| `web/src/utils/storage.ts` | 数据加载/持久化，需加迁移逻辑 |
| `web/src/hooks/useTaskActions.ts` | `moveTaskToQuadrant` handler |
| `web/src/components/views/MatrixView.tsx` | 桌面矩阵视图 |
| `web/src/mobile/MobileMatrixView.tsx` | 移动端矩阵视图 |
| `web/src/data/seed.ts` | Seed 数据 |
| `web/supabase/migrations/` | Supabase schema（仅生成 SQL，手动执行） |

## Supabase Schema 说明

当前 Supabase 使用 `workspace_states` 表存储整体 JSON（非结构化），不是结构化的 tasks 表。因此：
- **不需要** ALTER TABLE tasks
- `isUrgent` / `isImportant` 存在 JSON 里，无需 DDL 变更
- 迁移逻辑在 `storage.ts` 的 `normalizePersistedState()` 函数中处理

## 决策

1. **向后兼容**：加载时如果 task 没有 `isUrgent`/`isImportant`，从 `tagIds` 迁移
2. **标签保留**：特殊标签 `tag-urgent`/`tag-important` 继续存在，但 `getQuadrant` 不再依赖它们
3. **标签清理**：迁移后，从 tagIds 中移除特殊标签（MATRIX-02 要求 "清理 tagIds"）
4. **pill 显示**：MatrixView 卡片显示 Q1/Q2/Q3/Q4 badge，hover 展示分类依据
5. **InlineCreateRequest**：继续传 `tagIds` 字段（为了兼容），但同时传 `isUrgent`/`isImportant`

## 不做的事

- 不删除 SPECIAL_TAG_IDS 常量（其他地方还用到）
- 不修改 Supabase DDL（用整体 JSON 存储，不需要）
- 不兼容旧的 Tauri SQLite schema（Tauri 路径使用 desktop-repository.ts 单独处理，本 phase 不改）
