# 📦 桌面数据层第五阶段 — 交付说明 (DELIVERY_NOTE)

| 字段 | 值 |
|------|-----|
| **制品 ID** | ART-DELIVERY-0002 |
| **版本** | v1.0.0 |
| **状态** | approved |
| **产出角色** | project_manager_orchestrator |
| **交付日期** | 2026-04-02 |

---

## 本次完成内容

本轮不再停留在“把 JSON 拆成关系表”这一层，而是把桌面端真正推进到可消费的 repository 数据层：

- `desktop-repository.ts` 新增选择器级查询能力，支持按系统视图 / 清单 / 标签 / 智能清单、标签交集、关键词、到期范围、提醒存在性等条件直接查任务。
- `App.tsx` 在桌面模式下把提醒候选、导航计数、工作区任务筛选与顶部统计切到 repository 直查优先；浏览器端仍保留原有内存派生作为回退链路。
- `storage.ts` 新增桌面持久化串行队列，避免状态保存与派生查询并发时读到旧数据。
- `saveDesktopRepositoryState()` 不再整库清空重写，而是改为按 task 及其关系表增量 upsert，并仅删除真正移除的记录。

## 核心收益

1. **提醒链路更真实**：桌面端只查询有提醒或到期候选的任务，不再每 15 秒扫整包任务数组。
2. **标签筛选更靠近数据层**：多选交集、关键词和智能清单规则可直接落到 repository 查询上。
3. **持久化成本显著收敛**：保存时不再清空 `tasks` 与所有关系表，避免无意义重写。
4. **读写竞态收敛**：保存队列与查询等待机制让“刚改完就立刻查询”的链路更稳定。

## 涉及主文件

- `/Users/turbo/WorkBuddy/20260330162606/web/src/utils/desktop-repository.ts`
- `/Users/turbo/WorkBuddy/20260330162606/web/src/utils/storage.ts`
- `/Users/turbo/WorkBuddy/20260330162606/web/src/App.tsx`

## 下一步建议

1. 继续把日历周/月格、时间线窗口和更多导航区块切到分页式 repository 查询，进一步减少整包任务状态的前端依赖。
2. 为 repository 查询与增量写入补一组纯函数级 smoke test / fixture，避免后续每轮都只能靠整包 build 兜底。
3. 评估是否为提醒、统计与搜索建立更明确的索引策略，给后续桌面端规模化数据量留余地。
