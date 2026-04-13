# Phase 11 Context: 搜索过滤统一 + NLP

## Phase Goal
统一 FilterState 模型，驱动搜索栏/CommandPalette/Saved Filters，
将过滤状态序列化到 URL，并添加 NLP 输入实时解析预览 chip。

## Requirements
| REQ | Description | Est |
|-----|-------------|-----|
| FILTER-01 | 统一 FilterState 模型驱动搜索栏/CommandPalette/Saved Filters | 2d |
| FILTER-02 | 过滤状态序列化到 URL search params（集成 Phase 8 useRouterSync） | 1d |
| FILTER-03 | NLP 输入实时解析预览（日期/标签/优先级 chip） | 2d |

## Dependencies
- Phase 8 (complete): react-router-dom HashRouter + useRouterSync (URL ↔ state)
- Phase 10 (complete): dual-date 三日期系统

## Current Architecture

### useFilterState (web/src/hooks/useFilterState.ts)
- 维护: selectedTagIds, searchInput, searchKeyword (debounced)
- 初始化: 从 URL hash query params 读取初始值
- 问题: 与 URL 是单向的 (只读初始值，不回写)

### useRouterSync (web/src/hooks/useRouterSync.ts)
- 双向同步: URL ↔ (activeSelection, currentView, searchKeyword, selectedTagIds, ...)
- searchKeyword 和 selectedTagIds 已经在 URL 同步中
- 但 FilterState 缺少: priority filter、due filter、status filter

### CommandPalette (web/src/components/CommandPalette.tsx)
- 独立内部状态 (search string)，自己解析 #tag、@list、!priority、due:today、status:
- 完全与 useFilterState 隔离 — 选择任务后 onSelectTask(id)，不修改 filterState
- 问题: filter 语法孤岛，与主搜索栏/FilterState 不共享模型

### SavedFilter (packages/taskflow-core/src/domain.ts)
```typescript
interface SavedFilter {
  id: string; name: string; icon: string;
  listIds: string[]; tagIds: string[];
  priority: Priority[]; due: 'overdue' | 'today' | 'week' | 'none';
}
```
- AppSidebar 显示 saved filters，点击 → setActiveSelection('filter:id')
- applySavedFilter() 在 selectors.ts 应用

### URL 当前 query params
- q=searchKeyword
- tags=id1,id2
- view, cal, anchor, scale, task, cal_done

## Phase 11 Changes Plan

### FILTER-01: 统一 FilterState 模型
扩展 FilterState 加入 priority/status/due 字段，
让 CommandPalette 能够 "apply to workspace" 而不只是临时搜索。
新增 useUnifiedFilter hook，统一管理所有过滤维度。

### FILTER-02: URL 序列化
扩展 useRouterSync/buildQueryString/parseQueryParams，
加入 priority/status/due query params。
useUnifiedFilter 与 useRouterSync 集成，双向同步。

### FILTER-03: NLP 预览 chip
在 CommandPalette 输入框下方，实时解析 NLP 语法，
显示解析出的 chip (日期/标签/优先级/状态/清单)，
点击 chip 可 apply filter 到 workspace。

## Key Files
- web/src/hooks/useFilterState.ts — 要扩展/重构
- web/src/hooks/useRouterSync.ts — 要扩展
- web/src/components/CommandPalette.tsx — 要扩展 NLP chip
- web/src/components/CommandPalette.module.css — 添加 chip 样式
- packages/taskflow-core/src/selectors.ts — applySavedFilter 已有
