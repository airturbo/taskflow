---
phase: "09"
status: "complete"
commit: "7cdc6c5"
build: "pass"
tsc: "pass"
date: "2026-04-13"
---

# Phase 09 Verification: 四象限修正

## 构建验证

```
✓ 247 modules transformed
✓ built in 387ms
dist/assets/index-C_OnfITm.css  155.19 kB │ gzip:  25.62 kB
dist/assets/index-D4Moiap_.js   892.54 kB │ gzip: 263.92 kB
```

TypeScript strict mode: **0 new errors**

## 需求覆盖

### MATRIX-01: 新增 isUrgent/isImportant 独立字段
- ✅ `Task` 接口新增 `isUrgent: boolean` 和 `isImportant: boolean`
- ✅ `getQuadrant()` 改为读取字段而非 `tagIds`
- ✅ 新增 `getFieldsForQuadrant()` API

### MATRIX-02: 数据迁移 + tagIds 清理
- ✅ `mergePersistedState` 自动从旧 tagIds 推断字段值
- ✅ 迁移时清理 `tag-urgent`/`tag-important` 出 `tagIds`
- ✅ `moveTaskToQuadrant` 改用 `getFieldsForQuadrant`，不再修改 `tagIds`

### MATRIX-03: 拖拽修改字段不修改标签
- ✅ 桌面端拖拽 → `useTaskActions.moveTaskToQuadrant` → patch `isUrgent/isImportant`
- ✅ 移动端"移动到其他象限" → 同上
- ✅ 创建任务时传入正确的 `isUrgent/isImportant`（MatrixView、MobileMatrixView）

### MATRIX-04: 卡片 badge + tooltip
- ✅ 每张卡片显示 Q1/Q2/Q3/Q4 彩色 badge
- ✅ hover title 显示分类理由（紧急且重要 / 重要不紧急 / 紧急不重要 / 待分类）
- ✅ 颜色：Q1=红，Q2=蓝，Q3=橙，Q4=灰

## 无破坏性变更

- `SPECIAL_TAG_IDS`/`SPECIAL_TAG_META` 常量保留（TagManagementDialog、ensureSpecialTags 仍使用）
- `getTagIdsForQuadrant` 保留但标注 `@deprecated`（仅清理特殊标签，不再添加）
- 旧数据通过 `mergePersistedState` 自动迁移，无需手动干预
