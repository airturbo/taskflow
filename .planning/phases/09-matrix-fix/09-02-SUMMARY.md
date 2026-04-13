---
plan: "09-02"
status: "complete"
commit: "7cdc6c5"
---

# Summary 09-02: 数据迁移与持久化更新

## 完成内容

1. **`web/src/utils/storage.ts`** — `mergePersistedState` 新增迁移逻辑：
   - 从旧 `tagIds` 中推断 `isUrgent`（含 `tag-urgent`）和 `isImportant`（含 `tag-important`）
   - 如果字段已存在（新数据），直接使用；如不存在（旧数据），从 tagIds 推断
   - 清理 `tagIds` 中的 `tag-urgent` 和 `tag-important`

2. **`web/src/hooks/useTaskActions.ts`** — `moveTaskToQuadrant` 改用 `getFieldsForQuadrant`：
   - 不再调用已废弃的 `getTagIdsForQuadrant`
   - 直接 patch `isUrgent` / `isImportant` 字段
   - 变更检测改为比较新旧字段值

3. **`web/src/components/views/MatrixView.tsx`** — `meta` 对象及所有 `onOpenInlineCreate` 调用更新：
   - `meta` 类型从 `tagIds: string[]` 改为 `isUrgent: boolean; isImportant: boolean`
   - 通过 `getFieldsForQuadrant` 自动计算每个象限的字段值
   - 移除 `SPECIAL_TAG_IDS` 导入
   - 所有 4 处 `onOpenInlineCreate` 调用改传 `isUrgent/isImportant`

4. **`web/src/types/workspace.ts`** — `InlineCreateDraft` 新增 `isUrgent: boolean; isImportant: boolean` 字段

5. **`web/src/components/WorkspaceShell.tsx`** — `openInlineCreate` 和 `submitInlineCreate` 更新：
   - `openInlineCreate` 接收并存储 `isUrgent/isImportant` 到 draft
   - `submitInlineCreate` 将 `isUrgent/isImportant` 传给 `commitTask`

## 验证

TypeScript 严格模式编译通过（无新增错误）
