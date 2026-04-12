# TaskFlow 项目

## 简介
TaskFlow 是一个多端待办工具，支持 Web + Desktop (Tauri) + Obsidian 插件，通过 Supabase 实现数据同步。

## 技术栈
- Web: React 19 + TypeScript 5.9 + Vite 8.0.1 + Supabase
- Desktop: Tauri 2.10.1
- Obsidian Plugin: TypeScript + React (via Obsidian API)
- Backend: Supabase (PostgreSQL + Realtime)
- Shared: @taskflow/core (packages/taskflow-core)
- State: Zustand (mobile UI) + React hooks (desktop) — 待统一
- Drag: @dnd-kit (mobile) + 手写 pointer events (kanban) — 待统一

## 核心原则
- 个人效率优先：对标 Todoist / Things 3 的专注度和完成度
- 双日期模型是产品灵魂：计划完成 (dueAt) + 硬性截止 (deadlineAt) 贯穿所有视图
- 本地优先：数据一致性优先于实时性
- 同步策略：last-write-wins on updated_at（v2.0 升级为 field-level merge）

## 用户偏好
- 审美底线：CRAP 原则，极简精致专业
- 滚动条完全隐藏（参考 Things 3）
- 同步频率：不需要实时，减少不必要 API 调用
- 代码风格：TypeScript 严格模式

## Current Milestone: v2.0 TaskFlow 交互体验全面优化

**Goal:** 解决 25 个已识别的交互/架构问题，将 TaskFlow 从"功能丰富但体验粗糙"打磨为对标 Todoist/Things 3 品质的个人效率工具。

**Target features:**
- 架构治理：App.tsx 拆分、CSS 模块化、Error Boundary、离线队列限制
- 核心差异化：双日期全视图设计语言统一、Focus 分组强化
- 四象限数据模型修正：标签→独立字段
- 客户端路由 + 视图状态恢复
- 统一拖拽系统（@dnd-kit）
- 搜索过滤统一 + NLP 实时解析预览
- UX 打磨：完成仪式、重复任务感知、日期冲突修正
- 看板 WIP Limit、Stats 可操作出口
- 发现性：快捷键引导、批量操作、标签预览、时间线今日线
- 性能加固 + Field-Level Merge（个人多设备同步保障）

**Key constraints:**
- 个人体验优先，协作/分享功能后移
- 渐进式重构，每阶段独立可部署
- 不破坏现有功能（main 分支全程可用）

## Validated (v1.1)
- Obsidian 同步频率优化（debounce 2000ms+, 30s 最小间隔）
- Obsidian UI 升级（Command Palette, 任务详情面板, 侧边栏）
- Web 实时同步降频（指数退避, visibilitychange 暂停）
- 错误处理与代码质量（JWT 自动刷新, 导出错误统一）

## Key Decisions
- 2026-04-12: Supabase 而非 Firebase（关系型 + PG 可迁移）
- 2026-04-12: Vercel + Supabase 部署
- 2026-04-13: v2.0 冲突策略选择 field-level merge（非 CRDT）
- 2026-04-13: v2.0 App.tsx 渐进式拆分（非一次性重写）
- 2026-04-13: v2.0 双日期模型强化而非弱化，Focus 保留 5 组区分
- 2026-04-13: v2.0 个人体验优先，路由侧重状态恢复而非分享

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
Last updated: 2026-04-13
