---
plan: "09-04"
status: "complete"
commit: "7cdc6c5"
---

# Summary 09-04: 卡片分类理由 pill + hover tooltip

## 完成内容

1. **`web/src/components/views/MatrixView.tsx`** — 每张卡片新增象限 badge pill：
   - 在 `chip-wrap dense` 区域前插入 `<span className={styles.matrixQuadrantBadge} data-quadrant={key} title={...}>`
   - `title` 属性显示分类理由（Q1: 紧急且重要 / Q2: 重要，不紧急 / Q3: 紧急，不重要 / Q4: 待分类）
   - badge 文字显示象限编号（Q1/Q2/Q3/Q4）
   - 分类理由直接从 `task.isUrgent`/`task.isImportant` 读取，与实际字段一致

2. **`web/src/components/views/MatrixView.module.css`** — 新增 `.matrixQuadrantBadge` 样式：
   - 共用基础样式（11px 字体、圆角 4px、inline-flex）
   - Q1: 红色（#ff3b30）
   - Q2: 蓝色（#007aff）
   - Q3: 橙色（#ff9500）
   - Q4: 灰色（var(--text-3)）
   - 使用 `color-mix` 实现 15% 背景透明度（与 midnight/paper 主题兼容）

## 验证

TypeScript 严格模式编译通过（无新增错误）
