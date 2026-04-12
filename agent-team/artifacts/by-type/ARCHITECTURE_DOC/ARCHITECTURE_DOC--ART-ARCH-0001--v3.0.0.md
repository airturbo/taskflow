# 🏗️ 待办管理工具 — 桌面数据层架构文档 (ARCHITECTURE_DOC)

| 字段 | 值 |
|------|-----|
| **制品 ID** | ART-ARCH-0001 |
| **版本** | v3.0.0 |
| **状态** | approved |
| **产出角色** | system_architect |
| **关联 CR / IA** | CR-20260402-001 / IA-20260402-001 |
| **创建时间** | 2026-04-02 |

---

## 1. 本轮架构目标

本轮不再把 SQLite 只当“落盘仓库”，而是把桌面端推进到 **repository-first** 的数据层：

1. **关键读链真正下沉**：提醒候选、选择器筛选、导航计数、统计数据优先走 repository 查询。
2. **关键写链真正收敛**：保存不再整库清空重建，而是按 task graph 增量 upsert。
3. **读写时序可控**：持久化通过串行队列排队，查询可等待最近一次写入完成。
4. **兼容链路仍保留**：snapshot 与 legacy store 继续作为镜像/回退，不阻断当前 demo 的稳定性。

---

## 2. 当前分层

```text
App.tsx
  ├─ 任务编辑 / 视图状态 / 选择器上下文
  ├─ 桌面模式下调用 repository query / aggregate
  └─ 浏览器模式下保留内存派生回退

storage.ts
  ├─ loadState()
  ├─ saveState()
  ├─ waitForDesktopPersistence()
  └─ enqueueDesktopPersistence()

desktop-repository.ts
  ├─ workspace / folders / lists / tags / filters / tasks 查询与保存
  ├─ selection DSL -> DesktopTaskQuery 编译
  ├─ count / stats / priority distribution / tag distribution
  └─ task + relations 增量 upsert

desktop-sqlite.ts
  ├─ schema / migrations
  └─ snapshot / fallback support
```

---

## 3. 读路径设计

### 3.1 Selection DSL

`desktop-repository.ts` 现通过统一的 selection query 把上层工作区语义翻译成 repository 查询参数：

- `system: all / today / upcoming / inbox / completed / trash`
- `list:{id}`
- `tag:{id}`
- `filter:{id}`
- `tool:{id}`
- 叠加条件：`selectedTagIds`、`keyword`、`includeCompleted`

这意味着 App 层不再需要在桌面模式下自己做大段 `tasks.filter(...)` 来实现系统视图、标签交集、关键词搜索和智能清单。

### 3.2 聚合能力

桌面 repository 已具备以下聚合入口：

- `queryDesktopRepositorySelectionCounts()`：导航计数
- `queryDesktopRepositoryTaskStatsBySelection()`：active / completed / overdue / scheduled
- `queryDesktopRepositoryPriorityDistributionBySelection()`：优先级分布
- `queryDesktopRepositoryTagDistributionBySelection()`：标签分布
- `queryDesktopReminderCandidateTasks()`：提醒候选任务

原则：**列表查列表，统计查统计，提醒查候选，不再默认 hydrate 全量任务后在 React 里二次扫描。**

---

## 4. 写路径设计

### 4.1 旧问题

旧链路虽然已经把任务关系拆表，但保存仍是：

1. 整份 `PersistedState` 进入 repository
2. `DELETE` 全部 `tasks / task_* / filters / tags / lists / folders`
3. 再全量重建

这会带来三类问题：

- 任务内容没变，仅切换主题/视图也会高频重写任务库
- 保存结束前触发查询时，容易读到旧数据
- 关系表越多，整库重写成本越高

### 4.2 新方案

当前保存策略改为：

- `workspace_state` 单独 upsert
- `folders / lists / tags / filters` 按主键 upsert
- `tasks` 按 task id 增量 upsert
- 每个 task 的 `task_tags / reminders / subtasks / attachments / collaborators / comments / activity` 在 **单 task 范围** 内 replace
- 仅删除本次 state 中真正不存在的记录

这是一种保守但有效的中间态：

- 不做复杂 relation 行级 diff，降低实现风险
- 但已经从“整库重写”进入“task graph 增量写入”

---

## 5. 一致性与回退策略

### 5.1 串行写入

`storage.ts` 增加桌面持久化串行队列：

- 所有桌面保存进入同一队列
- 派生查询在需要时调用 `waitForDesktopPersistence()`
- 避免短时间连续编辑造成写入乱序和读旧值

### 5.2 兼容镜像

当前仍保留：

- SQLite snapshot
- legacy Tauri store mirror

原因不是为了长期共存，而是为了：

1. 提供迁移与异常时的回退面
2. 在 repository 方案继续演进时保留恢复抓手
3. 让桌面 demo 在本轮迭代内优先保证稳定而不是一次性激进收口

---

## 6. 当前边界

本轮虽然把热路径下沉了一层，但还没有完全做到 query-first workspace：

1. 冷启动仍会 hydrate 全量任务到 `initialState.tasks`
2. 日历周/月格与时间线窗口尚未改成时间窗分页查询
3. snapshot / legacy store 仍是整份 checkpoint
4. `tasks` 主表中的 JSON 镜像列仍需继续与关系表双写保持一致

所以当前阶段的准确描述是：

> **桌面端已经从“SQLite 只负责存储”推进到“repository 负责关键查询与增量写入”，但尚未完成完全意义上的 query-first state 架构。**

---

## 7. 下一阶段建议

1. **冷启动任务壳层化**：把 workspace shell 与 task payload 解耦，减少启动即全量 hydrate。
2. **时间窗查询化**：日历 / 时间线改成围绕 `start_at / due_at` 的窗口查询与分页。
3. **checkpoint 节流**：把 snapshot / legacy store 从“每次保存都镜像”收敛成低频 checkpoint。
4. **索引策略**：围绕 due / completed / deleted / reminders / keyword 明确补索引。
5. **fixture + smoke test**：为 selection DSL、aggregate、增量 upsert 补稳定测试样例。

---

*本文档由系统架构师角色产出，用于把桌面 repository phase5 的真实数据层边界、读写策略与后续演进路径固定下来。*