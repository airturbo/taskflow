# Phase 11 Research: 搜索过滤统一 + NLP

## 现状总结

### 1. useFilterState (hooks/useFilterState.ts)
- 只管理: selectedTagIds, searchInput (raw), searchKeyword (debounced)
- 初始化从 URL 读取，但不回写 URL（URL 回写由 useRouterSync 负责）
- **缺失**: priority filter、status filter、due filter

### 2. useRouterSync (hooks/useRouterSync.ts)
- 已同步: view, q (searchKeyword), cal, anchor, scale, tags, task, cal_done
- **FilterState 缺失字段不在 URL 中**: priority, status, due

### 3. CommandPalette (components/CommandPalette.tsx)
- 完全独立内部状态，自己 inline 解析 #tag、@list、!priority、due:today、status:
- 不修改 workspace FilterState — 选中项后 onSelectTask / onSelectList / setSearch
- **NLP chip 预览** 功能完全缺失

### 4. SavedFilter (domain.ts + selectors.ts)
```typescript
interface SavedFilter {
  id, name, icon, listIds, tagIds, priority: Priority[], due: 'overdue'|'today'|'week'|'none'
}
```
- applySavedFilter() 在 selectors.ts 已实现
- Sidebar 点 saved filter → activeSelection('filter:id')
- **与 FilterState 没有统一模型**

### 5. useWorkspaceComputed
- 接收 selectedTagIds + searchKeyword
- 用 matchesSearch + matchesSelectedTags 过滤
- **缺**: priority/status/due 实时过滤参数

## 差距分析

| 功能 | 现状 | 目标 |
|-----|-----|------|
| Tag filter | useFilterState + URL `tags=` | 已有，保留 |
| Search keyword | useFilterState + URL `q=` | 已有，保留 |
| Priority filter | 无 | 加 URL `priority=high,urgent` |
| Status filter | 无 | 加 URL `status=todo,doing` |
| Due filter | 无 | 加 URL `due=today` |
| CommandPalette | 独立孤岛 | 添加 NLP chip 预览 + apply to workspace |
| NLP chip 预览 | 无 | FILTER-03 |

## 实现策略

### FILTER-01: 扩展 FilterState

**方案**: 最小侵入性扩展 useFilterState
- 加入 `filterPriority: Priority[]`
- 加入 `filterStatus: TaskStatus[]`  
- 加入 `filterDue: 'overdue'|'today'|'week'|'none'`
- 透传到 useWorkspaceComputed → 过滤逻辑

**不做**: 不合并 SavedFilter 模型（SavedFilter 是 persistent entity，FilterState 是 ephemeral UI state）
**不做**: 不改变 CommandPalette 的任务选择行为（保留原有功能）

### FILTER-02: URL 序列化

**方案**: 扩展 useRouterSync 的 buildQueryString/parseQueryParams
- priority=high,urgent (多值逗号分隔)
- status=todo,doing (多值逗号分隔)
- due=today (单值)

同时扩展 RouterSyncState/RouterSyncSetters 接口。

### FILTER-03: NLP chip 预览

**方案**: 在 CommandPalette 中，当 search 输入时：
1. 实时解析 NLP 语法识别 chips：
   - `#tagname` → tag chip (颜色点 + 标签名)
   - `!priority` → priority chip (颜色 + 优先级名)
   - `due:today` / `due:week` / `due:overdue` → due chip
   - `status:todo` / `status:doing` / `status:done` → status chip
   - `@listname` → list chip
   - 剩余文本 → search keyword chip
2. 显示 chip 行在输入框下方
3. 添加 "Apply to workspace" 按钮（或 Cmd+Enter 快捷键）
4. Apply 时: 调用 onApplyFilter callback → 修改 workspace FilterState

**新增 CommandPalette prop**: `onApplyFilter(filter: NLPParsedFilter): void`

## 文件影响范围

| 文件 | 改动 |
|-----|------|
| hooks/useFilterState.ts | 扩展 priority/status/due 字段 |
| hooks/useRouterSync.ts | 扩展 URL params |
| hooks/useWorkspaceComputed.ts | 接收新 filter 字段 |
| components/CommandPalette.tsx | NLP chip 预览 + apply |
| components/CommandPalette.module.css | chip 样式 |
| App.tsx | 连接 onApplyFilter |
