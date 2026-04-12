# 🧭 桌面数据层技术决策记录 (TECH_DECISION_RECORD)

| 字段 | 值 |
|------|-----|
| **制品 ID** | ART-TECH_DECISION_RECORD-0001 |
| **版本** | v1.0.0 |
| **状态** | approved |
| **产出角色** | system_architect |
| **关联 CR / IA** | CR-20260402-001 / IA-20260402-001 |
| **日期** | 2026-04-02 |

---

## 决策 1：保留 snapshot 与 legacy store，但降级为兼容镜像而非主数据源

- **决策**：桌面端主数据源仍以 SQLite repository 为准；snapshot 与 legacy store 保留为兼容/回退镜像。
- **原因**：当前仍处于数据层快速演进阶段，完全移除回退链路会放大迁移和异常恢复风险。
- **影响**：读路径优先 repository，写路径仍可在失败时回退；后续可继续把镜像写入改成节流 checkpoint。

## 决策 2：优先实现 task graph 级增量 upsert，不做 relation 行级 diff

- **决策**：对单个 task 的关系表采用“单 task 范围内 delete + reinsert”而不是对子项逐行 diff。
- **原因**：当前目标是快速摆脱整库 delete + rewrite；若直接上 relation diff，复杂度、边界条件与回归成本会明显上升。
- **影响**：实现简单、风险可控；性能收益已足够明显；后续如数据量进一步增大，再评估 relation 细粒度 diff。

## 决策 3：选择器、提醒与统计统一经由 repository query / aggregate 暴露

- **决策**：在 repository 层建立 selection DSL、stats、priority distribution、tag distribution、reminder candidate 等高层查询能力。
- **原因**：桌面端当前最贵的不是 schema，而是 App 层继续把 SQLite 当“冷存储”，所有热路径仍在 React 数组上二次过滤。
- **影响**：App 层逻辑更薄，数据层边界更清晰，也为后续分页、索引和性能压测打下基础。

## 决策 4：引入桌面持久化串行队列

- **决策**：所有桌面写入进入单队列，查询可等待最近一次写入完成。
- **原因**：UI 层是 fire-and-forget 保存，连续操作下存在并发写与读旧值风险。
- **影响**：提醒、统计、导航计数等派生查询在高频交互下更稳定；后续若引入 reducer/store，也可以复用该编排层。

## 决策 5：继续双写 tasks JSON 镜像列与关系表

- **决策**：在当前阶段继续维护 `tasks.*_json` 与 `task_*` 关系表双写一致。
- **原因**：现有 hydrate、迁移回填与回退链路仍依赖 JSON 镜像列，立刻去掉 source-of-truth 地位风险太高。
- **影响**：短期需要继续注意一致性；长期建议在迁移与回退链路稳定后收敛 schema 责任，逐步淡化 JSON 镜像列。

---

## 暂不采纳的方案

### A. 冷启动完全不加载 tasks，只按视图即查即取
- **原因**：现有编辑与保存仍围绕内存中的 `tasks` 数组展开，直接切断会引发较大状态管理重构。
- **结论**：作为下一阶段目标，而不是本轮落地点。

### B. 每次任务编辑都同步全量 mirror snapshot / legacy store
- **原因**：这会把 repository 增量写入节省下来的 I/O 再次浪费掉。
- **结论**：当前先保留兼容，后续应节流成 checkpoint。

### C. 直接把统计页继续交给前端数组计算
- **原因**：这会让 phase5 只完成一半，下沉了 counts/stats，却把 priority/tag distribution 留在热路径里。
- **结论**：本轮已补齐 repository 聚合，桌面统计页不再依赖数组嵌套过滤。

---

## 后续触发条件

当满足以下任一条件时，重新评审并更新本记录：

1. 冷启动改为 query-first task shell
2. snapshot / legacy store 不再同步全量镜像
3. tasks JSON 镜像列准备降级或移除
4. 日历 / 时间线引入窗口分页查询
5. 需要支撑更大规模数据量并开始正式性能压测

---

*本文档用于固定本轮桌面数据层的关键技术取舍，避免后续会话重复讨论“为什么不直接全量重写 / 为什么还保留 snapshot / 为什么暂不做 relation diff”。*