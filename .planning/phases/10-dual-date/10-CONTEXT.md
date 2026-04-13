# Phase 10 — Context: 双日期体验强化

## Goal
dueAt (计划完成, 蓝色) + deadlineAt (硬性截止, 红色) 双日期模型在所有视图中清晰展示。

## Dependencies
- Phase 8: HashRouter + useRouterSync ✅
- Phase 9: Matrix isUrgent/isImportant fields ✅
- Phase 13: Zustand UI state, completion animations, @floating-ui ✅

## Requirements
| REQ | Description | Status |
|-----|-------------|--------|
| DATE-01 | 所有视图双日期同时展示，颜色/图标区分（蓝=dueAt，红=deadlineAt） | TODO |
| DATE-02 | Focus Tab 5 组区分 + 清晰副标题 | TODO |
| DATE-03 | dueAt > deadlineAt 警告 badge + 一键修正 | TODO |
| DATE-04 | 日历视图双天标记（蓝 dueAt / 红 deadlineAt） | TODO |
| DATE-05 | 快速创建默认"计划完成"，可展开添加"截止日期" | TODO |

## Design Decisions (LOCKED)
- 蓝色 (#6384ff / var(--accent)) → dueAt (计划完成)
- 红色 (#f87171 / var(--red)) → deadlineAt (硬性截止)
