---
plan: "09-01"
status: "complete"
commit: "0252e82"
---

# Summary 09-01: 新增 isUrgent/isImportant 独立字段

## 完成内容

1. **`packages/taskflow-core/src/domain.ts`** — Task 接口新增 `isUrgent: boolean` 和 `isImportant: boolean` 字段（位于 tagIds 之后）

2. **`packages/taskflow-core/src/selectors.ts`**:
   - `getQuadrant(task)` 改为读取 `task.isUrgent` / `task.isImportant`，不再依赖 tagIds
   - 新增 `getFieldsForQuadrant(quadrant)` 返回 `{ isUrgent, isImportant }`
   - `getTagIdsForQuadrant` 标记为 `@deprecated`，改为只清理特殊标签，不再添加

3. **`web/src/data/seed.ts`** — 所有 seed task 添加 `isUrgent`/`isImportant` 字段，并移除 tagIds 中的特殊标签

4. **`web/src/types/workspace.ts`** — `InlineCreateRequest` 和 `CreateTaskPayload` 新增可选字段

5. **`web/src/utils/app-helpers.ts`** — 同步更新 `CreateTaskPayload` 和 `InlineCreateRequest` 类型

6. **`web/src/components/WorkspaceShell.tsx`** — `commitTask` 解构新字段并传入新建 Task

7. **`web/src/utils/desktop-repository.ts`** — `hydrateTaskRows` 为桌面 SQLite 加载的 task 提供 `isUrgent: false, isImportant: false` 默认值

## 验证

TypeScript 严格模式编译通过（无新增错误）
