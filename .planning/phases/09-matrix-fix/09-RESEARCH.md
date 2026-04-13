# Phase 9 Research — 四象限修正

## 1. 当前矩阵工作原理

### 分类逻辑（packages/taskflow-core/src/selectors.ts:242）

```typescript
export function getQuadrant(task: Task): MatrixQuadrantKey {
  const urgent = task.tagIds.includes(SPECIAL_TAG_IDS.urgent)    // 'tag-urgent'
  const important = task.tagIds.includes(SPECIAL_TAG_IDS.important) // 'tag-important'
  if (urgent && important) return 'q1'
  if (!urgent && important) return 'q2'
  if (urgent && !important) return 'q3'
  return 'q4'
}
```

### 拖拽改象限（selectors.ts:250）

```typescript
export function getTagIdsForQuadrant(tagIds: string[], quadrant: MatrixQuadrantKey) {
  const next = new Set(tagIds.filter(id => !Object.values(SPECIAL_TAG_IDS).includes(id)))
  if (quadrant === 'q1' || quadrant === 'q3') next.add(SPECIAL_TAG_IDS.urgent)
  if (quadrant === 'q1' || quadrant === 'q2') next.add(SPECIAL_TAG_IDS.important)
  return Array.from(next)
}
```

调用路径：`MatrixView.onMoveToQuadrant` → `WorkspaceShell.moveTaskToQuadrant` → `useTaskActions.moveTaskToQuadrant` → `getTagIdsForQuadrant`

### MobileMatrixView

移动端用 `getQuadrant(t)` 分发任务，用 `onMoveToQuadrant` 同样依赖标签。

## 2. 影响点清单

| 位置 | 变更类型 |
|------|---------|
| `packages/taskflow-core/src/domain.ts` | Task 新增 `isUrgent`, `isImportant` 字段 |
| `packages/taskflow-core/src/selectors.ts` | `getQuadrant` 读 `isUrgent`/`isImportant`；`getTagIdsForQuadrant` 废弃/替换 |
| `web/src/utils/storage.ts` `mergePersistedState` | 迁移逻辑：从 tagIds 推断并写入独立字段，清理特殊 tagIds |
| `web/src/hooks/useTaskActions.ts` `moveTaskToQuadrant` | 改写 `isUrgent`/`isImportant` 而非 tagIds |
| `web/src/data/seed.ts` | seed task 加 `isUrgent`/`isImportant` 字段 |
| `web/src/components/views/MatrixView.tsx` | onOpenInlineCreate 去掉传 special tagIds；新增 quadrant pill badge |
| `web/src/mobile/MobileMatrixView.tsx` | 同上 |

## 3. Supabase Schema 评估

当前 Supabase 使用 `workspace_states.state_json JSONB` 整体存储，没有独立的 tasks 结构化表。

**结论**：不需要 DDL 变更。`isUrgent`/`isImportant` 作为 JSON 字段随 state 存储。无需手动执行 migration SQL。

## 4. 迁移策略

在 `mergePersistedState` 中对每个 task 执行：

```typescript
const hasUrgentTag = task.tagIds.includes('tag-urgent')
const hasImportantTag = task.tagIds.includes('tag-important')
const isUrgent = task.isUrgent ?? hasUrgentTag
const isImportant = task.isImportant ?? hasImportantTag
const cleanedTagIds = task.tagIds.filter(id => id !== 'tag-urgent' && id !== 'tag-important')
```

- 如果 task 已有 `isUrgent` 字段，优先使用（已迁移）
- 如果没有（旧数据），从 tagIds 推断
- 清理特殊标签出 tagIds

## 5. Quadrant Pill 设计

在 MatrixView 卡片上新增一个小 badge，显示当前象限标识：

```
Q1  → 红色小 pill "紧急·重要"
Q2  → 蓝色小 pill "重要"
Q3  → 橙色小 pill "紧急"
Q4  → 灰色小 pill "待分类"（可选，只在 q4 时不显示）
```

hover tooltip 显示分类依据："isUrgent: true, isImportant: false → 紧急不重要"

## 6. InlineCreateRequest 调整

MatrixView 创建任务时，现在传 `tagIds: [SPECIAL_TAG_IDS.urgent, ...]`。
新逻辑改为在创建 handler 中直接设置 `isUrgent`/`isImportant`。

需要在 `InlineCreateRequest` 类型上新增可选字段：
```typescript
isUrgent?: boolean
isImportant?: boolean
```

然后在 `handleInlineCreate` 中读取这两个字段，不再操作 special tagIds。

## 7. 特殊标签保留

`SPECIAL_TAG_IDS`、`SPECIAL_TAG_META` 保留（`TagManagementDialog`、`MobileSheets` 等用它们标记系统标签样式），但 `getQuadrant` 不再依赖它们。

可能的未来清理：删除特殊标签出 tags 列表（但这是 Phase 10 的事）。

## 8. 构建验证

`cd web && npx vite build` —— TypeScript strict 模式要求 `isUrgent`/`isImportant` 非 undefined 时必须提供默认值。

在 `mergePersistedState` 中，`task.isUrgent ?? false` 作为降级值，确保类型兼容。
