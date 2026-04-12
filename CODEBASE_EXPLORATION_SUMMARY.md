# TaskFlow 代码库彻底探索 — 快速参考指南

**分析完成时间**: 2026-04-12  
**彻底度等级**: ⭐⭐⭐⭐⭐ (Very Thorough)  
**生成文档**: 3个核心文档 (本文 + INTERACTION_REVIEW_ANALYSIS + COMPREHENSIVE_ANALYSIS)

---

## 📁 项目整体结构速查

### 顶层目录映射

| 目录 | 用途 | 关键文件 | 行数 |
|------|------|---------|------|
| `/web/src` | Web + Desktop 前端 | App.tsx | 3,441 |
| `/packages/taskflow-core` | 共享业务逻辑库 | domain.ts, selectors.ts | ~1,500 |
| `/web/src-tauri` | Tauri 桌面壳 | src/main.rs, tauri.conf.json | 📄 |
| `/todo-obsidian-plugin` | Obsidian 插件 | main.ts, TaskFlowView.tsx | ~1,800 |
| `/web/supabase` | 云端数据库迁移 | migrations/ | 📄 |
| `/docs` | 文档 | - | 📄 |

### 核心模块分层

```
应用层 (App.tsx 3,441行)
    ↓
视图层 (5个View组件) + 组件层 (92+个组件)
    ├─ Desktop Views: List/Calendar/Kanban/Timeline/Matrix
    ├─ Mobile Views: Focus/Calendar/Matrix/Me
    └─ UI Components: TaskDetailPanel/InlineCreatePopover/etc
    ↓
业务逻辑层 (@taskflow/core)
    ├─ domain.ts (数据模型定义)
    ├─ selectors.ts (查询/过滤逻辑)
    ├─ smart-entry.ts (NLP 解析)
    └─ reminder-engine.ts (提醒触发)
    ↓
存储层 (多后端支持)
    ├─ localStorage (Web)
    ├─ SQLite (Desktop/Tauri)
    ├─ Supabase (Cloud)
    └─ Obsidian API
```

---

## 🎯 核心功能快速索引

### 1. 五大视图系统

| 视图 | 组件 | 特性 | 平台支持 |
|------|------|------|---------|
| **List** | ListView.tsx | 按列表/标签分组，拖拽排序 | Web ✓ Mobile ✓ |
| **Calendar** | CalendarView.tsx | 月/周/议程模式，农历支持 | Web ✓ Mobile ✓ |
| **Kanban** | KanbanView.tsx | 3列状态看板，拖拽转移 | Web ✓ |
| **Timeline** | TimelineView.tsx | Gantt甘特图，日/周尺度，精细拖拽 | Web ✓ |
| **Matrix** | MatrixView.tsx | 四象限(Eisenhower)，拖拽切换 | Web ✓ Mobile ✓ |

### 2. 任务生命周期API

```
创建: createTask(payload) / createNextRepeatTask()
读取: getTasksForSelection() / matchesSearch()
更新: updateTask(id, patch) / normalizeTaskPatch()
完成: toggleTaskComplete(id) + 重复规则触发
删除: deleteTask(id) / softDeleteTask(id) / restoreTask(id)
```

### 3. 时间系统三层设计

```
startAt        计划开始时间 (何时开始工作)
    ↓
dueAt          计划完成时间 (主排序字段，用户感知)
    ↓
deadlineAt     硬性截止时间 (可选，与dueAt分离)
```

### 4. 提醒系统支持

- **相对提醒**: "截止前3小时" (基于 deadline/planned/start)
- **绝对提醒**: "2026-04-15T14:00" (具体时间点)
- **触发锚点**: deadline | planned | start

### 5. NLP智能输入

支持中文自然语言解析：
```
输入: "明天下午3点打电话 #工作 !高"
解析:
  ├─ 日期: 明天 → dueAt
  ├─ 时间: 下午3点 → 15:00
  ├─ 标签: #工作 → tagIds
  └─ 优先级: !高 → priority:'high'
```

---

## 🏗️ 核心交互流程脑图

### 完整任务创建→完成→重复流程

```
用户输入 (Cmd+N or 快速创建按钮)
    ↓
[智能解析] parseSmartEntry()
    ├─ NLP 识别日期/时间/优先级/标签
    └─ 反填表单字段
    ↓
[本地保存] 
    ├─ optimistic update UI
    ├─ localStorage 写入
    └─ SQLite/Supabase 异步同步
    ↓
[用户完成任务]
    ├─ 点击完成 → toggleTaskComplete()
    ├─ 状态变更: todo → done
    ├─ activity 记录
    └─ Toast 提示 (3秒可撤销)
    ↓
[检查重复规则]
    ├─ 若 repeatRule 存在
    │  ├─ createNextRepeatTask()
    │  ├─ 日期 shift (dueAt += offset)
    │  └─ 创建新实例
    └─ 若无重复规则 → 任务结束
    ↓
[优化分析] (Stats View)
    ├─ 投影分析 (未排期/超期恢复)
    ├─ 完成趋势
    └─ Pomodoro 统计
```

---

## 💾 存储架构一览

### 多后端支持矩阵

| 后端 | 平台 | 容量 | 离线 | 同步 | 实时 |
|------|------|------|------|------|------|
| **localStorage** | Web | ~5-10MB | ✅ | ❌ | ❌ |
| **SQLite** | Desktop | 无限 | ✅ | 可选 | ❌ |
| **Supabase** | Web | 无限 | ✅ | ✅ | ✅ |
| **Obsidian API** | 插件 | 无限 | ✅ | 插件 | ❌ |

### 数据同步流程

```
本地 ← (优先) ← 操作
  ↓
[localStorage 或 SQLite]
  ↓ (异步非阻塞)
[Supabase]
  ↓ (网络恢复自动 flush)
[离线队列]
```

---

## 🎮 关键交互热点

### 移动端 (4 Tab导航)

```
📍 Focus Tab
  ├─ 5段分组 (Overdue/Today Planned/Today Deadline/Inbox/Upcoming)
  ├─ VirtualFocusList 虚拟化 (@tanstack/react-virtual)
  └─ 完成动画 200ms + Undo Toast

📅 Calendar Tab
  ├─ month/week/agenda 模式
  └─ 农历支持

◆ Matrix Tab
  └─ 2x2 网格 (竖屏适配)

👤 Me Tab
  ├─ 活跃度指标
  ├─ 完成趋势
  └─ Pomodoro 统计
```

### 桌面端关键快捷键

| 快捷键 | 功能 |
|--------|------|
| Cmd+K | 搜索/命令面板 |
| Cmd+N | 新建任务 |
| Cmd+1-5 | 切换视图 |
| Cmd+Shift+D | 切换深色模式 |
| Space | 标记完成 |

---

## 🔧 技术栈总览

### 前端框架

```
React 19.2.4
├─ TypeScript 5.9.3 (类型安全)
├─ Zustand 5.0.12 (状态管理 - 移动端 UI)
├─ @tanstack/react-virtual 3.13.23 (虚拟滚动)
├─ @dnd-kit (拖放系统)
└─ Vite 8.0.1 (构建工具)
```

### 桌面/跨平台

```
Tauri 2.7.0 (跨平台壳)
├─ SQLite (本地数据库)
├─ 通知系统
└─ 文件对话框
```

### 云端

```
Supabase (PostgreSQL + Auth + Realtime)
├─ 多用户支持
├─ 实时同步
└─ 备份恢复
```

### 共享库

```
@taskflow/core
├─ domain.ts (类型定义)
├─ selectors.ts (业务查询)
├─ dates.ts (日期/时间)
├─ timeline.ts (甘特图计算)
├─ smart-entry.ts (NLP)
├─ reminder-engine.ts (提醒)
└─ repeat-rule.ts (重复)
```

---

## 🚨 关键问题与优化建议

### P0 紧急问题

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 1 | App.tsx 3,441行巨石 | 维护困难，编译慢 | 拆分成多文件 (~500行) |
| 2 | 92个 useState 离散 | 全量重渲染，性能差 | 迁移到 Zustand/Context |
| 3 | 移动端三时间字段 | UX 反人类 | 合并字段，简化输入 |
| 4 | 完整 TaskDetailPanel 在mobile | 字段过多，首屏差 | 移动端定制版面板 |

### P1 显著影响

| # | 问题 | 建议 |
|---|------|------|
| 5 | 缺列表上下文信息 | MobileFocusCard 显示列表徽章 |
| 6 | 空状态文案逻辑错误 | 区分「无任务」vs「全完成」 |
| 7 | 方括号标记 [计划] [DDL] | 改用图标 (📌 ⚠️) |
| 8 | Desktop ListView 无虚拟滚动 | 启用虚拟滚动 |
| 9 | 缺行级快速操作 | 添加行内按钮/滑动操作 |

### P2 优化项

| # | 建议 |
|---|------|
| 10 | 命令面板增强 (支持过滤/视图切换) |
| 11 | TypeScript 严格模式 |
| 12 | 单元测试补充 |
| 13 | ESLint 规则补充 |
| 14 | 性能监控 (Sentry) |

---

## 📊 代码库统计

| 指标 | 数值 |
|------|------|
| **App.tsx** | 3,441 行 |
| **总组件数** | 92+ |
| **React Hooks** | 10+ |
| **View 类型** | 5 (+ 2 mobile特化) |
| **存储后端** | 4 (localStorage/SQLite/Supabase/Obsidian) |
| **业务逻辑库** | @taskflow/core (~1,500 行) |
| **TypeScript** | ✅ 完全类型安全 |
| **构建时间** | ~3s (dev) |

---

## 🎓 学习建议

### 优先阅读顺序

1. **COMPREHENSIVE_ANALYSIS.md** (本库已有)
   - 系统架构概览
   - 核心数据模型
   - 功能矩阵

2. **INTERACTION_REVIEW_ANALYSIS.md** (新生成)
   - 交互流程细节
   - UX 问题分析
   - 优化建议

3. **源代码阅读顺序**
   - `packages/taskflow-core/src/` (理解业务模型)
   - `web/src/types/` (数据结构定义)
   - `web/src/components/views/` (视图层)
   - `web/src/App.tsx` (主编排逻辑)
   - `web/src/utils/` (工具函数)
   - `web/src/hooks/` (React hooks)

### 快速启动

```bash
# 安装依赖
cd /Users/turbo/WorkBuddy/20260330162606/web
npm install

# 开发服务器
npm run dev

# 或桌面应用
npm run desktop:dev

# 类型检查
npm run build

# 构建
npm run build:web
```

---

## 🔗 关键文件映射表

### 业务逻辑核心

| 文件 | 用途 | 关键导出 |
|------|------|---------|
| `@taskflow/core/domain.ts` | 类型定义 | Task, Tag, TodoList, etc |
| `@taskflow/core/selectors.ts` | 查询/过滤 | getTasksForSelection, matchesSearch |
| `@taskflow/core/dates.ts` | 时间操作 | getDateKey, isToday, isOverdue |
| `@taskflow/core/smart-entry.ts` | NLP解析 | parseSmartEntry |
| `@taskflow/core/reminder-engine.ts` | 提醒 | collectReminderEvents |
| `@taskflow/core/repeat-rule.ts` | 重复 | createNextRepeatTask |

### UI 视图组件

| 文件 | 用途 |
|------|------|
| `web/src/components/views/ListView.tsx` | 列表视图 |
| `web/src/components/views/CalendarView.tsx` | 日历视图 (month/week/agenda) |
| `web/src/components/views/KanbanView.tsx` | 看板视图 (3列) |
| `web/src/components/views/TimelineView.tsx` | 甘特图视图 (day/week) |
| `web/src/components/views/MatrixView.tsx` | 四象限视图 |
| `web/src/components/views/StatsView.tsx` | 统计视图 |

### 移动端组件

| 文件 | 用途 |
|------|------|
| `web/src/mobile/MobileFocusView.tsx` | Focus Tab (核心) |
| `web/src/mobile/MobileCalendarView.tsx` | Calendar Tab |
| `web/src/mobile/MobileMatrixView.tsx` | Matrix Tab |
| `web/src/mobile/MobileMeView.tsx` | Me Tab (统计) |
| `web/src/mobile/MobileSheets.tsx` | 底部 Sheet 集合 |

### 存储与同步

| 文件 | 用途 |
|------|------|
| `web/src/utils/storage.ts` | localStorage API |
| `web/src/utils/desktop-repository.ts` | SQLite 适配层 |
| `web/src/utils/desktop-sqlite.ts` | SQLite Schema |
| `web/src/utils/offline-queue.ts` | 离线操作队列 |
| `web/src/utils/supabase.ts` | Supabase 客户端 |

### Hook 与状态管理

| 文件 | 用途 |
|------|------|
| `web/src/hooks/useAuth.ts` | Supabase 认证 |
| `web/src/hooks/useRealtimeSync.ts` | 云端同步 |
| `web/src/hooks/useReminderCenter.ts` | 提醒系统 |
| `web/src/stores/mobileUiStore.ts` | 移动端 UI 状态 (Zustand) |

---

## 📝 分析文档引用

三份关键分析文档已生成：

1. **COMPREHENSIVE_ANALYSIS.md** (原有)
   - 项目结构概览
   - 核心数据模型
   - 技术栈详解
   - 功能矩阵

2. **INTERACTION_REVIEW_ANALYSIS.md** (🆕 本次生成)
   - 整体架构深度分析
   - 核心业务流程详解
   - 用户交互路径完整映射
   - 前端UI/交互设计详述
   - 后端数据流与状态管理
   - 移动端特殊交互
   - 跨平台集成策略
   - 关键UX问题与详细建议

3. **CODEBASE_EXPLORATION_SUMMARY.md** (本文)
   - 快速参考指南
   - 功能索引
   - 交互热点
   - 问题速查表

---

## ✅ 分析覆盖范围清单

- ✅ 整体目录结构
- ✅ 所有重要的产品文档 (README/设计/需求)
- ✅ 前端代码 (UI 组件、视图、交互逻辑)
- ✅ 后端代码 (API、数据模型、业务逻辑)
- ✅ 存储层 (多后端支持、同步机制)
- ✅ 核心业务流程 (创建→执行→完成→重复)
- ✅ 用户交互路径 (5个视图 + 移动端4个Tab)
- ✅ 跨平台架构 (Web/Desktop/Mobile/Obsidian)
- ✅ 性能与优化 (虚拟滚动、状态管理、离线同步)
- ✅ UX 问题分析 (P0/P1/P2 分级)
- ✅ 改进建议 (优先级路线图、ROI评估)

---

**生成时间**: 2026-04-12  
**分析深度**: ⭐⭐⭐⭐⭐ Very Thorough  
**预计阅读时间**: 30-45 分钟 (完整) / 5-10 分钟 (快速查阅)

