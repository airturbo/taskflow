# TaskFlow 共享核心层架构决策

> 决策时间：2026-04-09
> 状态：Phase 1（功能补齐中），Phase 2 待插件 MVP 稳定后执行

## 决策
采用 **共享核心层 + 各端独立 UI** 方案，不走分支维护。

## 目标端
- Web 端（React + Vite + Supabase）
- Mac App（Tauri / SwiftUI）
- Android 移动端（RN / Kotlin）
- Obsidian 插件（React + Obsidian API）

## 共享核心层范围（~1200 行，8 个文件）
1. `domain.ts` — 类型定义（Task/Tag/List/Reminder 等）
2. `selectors.ts` — 业务规则（过滤/搜索/排序/四象限/统计）
3. `dates.ts` — 日期工具（20+ 纯函数）
4. `smart-entry.ts` — 自然语言解析（以 web 完整版为基准）
5. `reminder-engine.ts` — 提醒引擎
6. `repeat-rule.ts` — 重复任务规则
7. `meta.ts` — UI 元数据常量（颜色/文案/图标）
8. `timeline.ts` — 时间线计算

## 各端独立实现
- UI 渲染层
- 存储层（localStorage / CoreData / Room / Plugin.loadData）
- 通知层
- 文件系统
- 同步层

## 落地路径
- Phase 1（当前）：先补齐 Obsidian 插件功能，保持 copy-paste 模式
- Phase 2（MVP 稳定后）：在仓库根建 `packages/taskflow-core`，两端消费
- Phase 3（新端启动时）：Mac App / Android 直接从 @taskflow/core 起步
