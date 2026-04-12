# Role Handoff RS-20260410-001 → frontend_engineer

- workflow_id: `WF-20260410-001`
- from_role: `project_manager_orchestrator`
- to_role: `frontend_engineer`
- intent: `用户 4 个新优化需求`

## Summary

# 需求清单  ## 1. 日历周历添加按钮精简 - 只保留每天日期行右侧小 + 号 - 去掉下方区域内巨大 + 号（`.calendar-create-strip` 或类似内联创建卡片） - 去掉周历头部横向每天旁的 + 号  ## 2. 新增任务三个时间字段 - MobileQuickCreateSheet 改为三个时间：开始时间(startAt)、计划完成(dueAt)、截止DDL(deadlineAt) - 每个用 datetime-local 输入  ## 3. 象

## Content

# 需求清单

## 1. 日历周历添加按钮精简
- 只保留每天日期行右侧小 + 号
- 去掉下方区域内巨大 + 号（`.calendar-create-strip` 或类似内联创建卡片）
- 去掉周历头部横向每天旁的 + 号

## 2. 新增任务三个时间字段
- MobileQuickCreateSheet 改为三个时间：开始时间(startAt)、计划完成(dueAt)、截止DDL(deadlineAt)
- 每个用 datetime-local 输入

## 3. 象限切换改为顶栏下拉
- 四象限/看板/时间线 segmented control 改成日历模式的顶栏左上角下拉
- 释放空间给四象限内容区

## 4. 时间线手机端重构
- 纵向布局：左侧2px竖线+小圆点节点，右侧紧凑卡片
- 去掉横向滚动
- 卡片只显示标题+时间
