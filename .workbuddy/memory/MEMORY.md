# 长期记忆

## 项目基本信息

- **产品名**：TaskFlow（2026-04-09 正式命名）
- **定位**：对标滴答清单/Todoist/Things 3 的高保真 Web+App 待办管理工具，目标上架给其他用户使用
- **代码位置**：`web/`，技术栈 Vite + React + TypeScript + Tauri（桌面端）
- **GitHub**：https://github.com/airturbo/taskflow.git（Public），main 分支
- **Web 部署**：https://taskflow-zeta-lovat.vercel.app/（Vercel，自动跟随 main 分支）
- **后端**：Supabase（https://yprcnagrqifswmhuxpgy.supabase.co），选型原因：快速验证 PMF，数据标准 PostgreSQL 可随时迁移
- **Bundle identifier**：com.airturbo.taskflow
- **App 安装路径**：/Applications/TaskFlow.app（构建后手动覆盖安装）
- **治理目录**：`.agent-team/`，角色配置 `roles/roles.v1.yaml`

---

## 用户画像（master）

- **称呼**：master
- **背景**：产品经理，视野广，审美高，要求真实可用而不是静态展示
- **沟通偏好**：
  - 喜欢简短指令推进（「继续」「下一步」「两者都做」）
  - 不接受废话和空洞的礼貌回复，直接说结论和行动
  - 遇到问题会附图，期望助手主动分析根因而非等待指令
  - 认可深度技术判断，但最终决策权在自己
- **决策风格**：
  - 认可「先验证 PMF 再迁移/扩展」的渐进主义（如 Supabase 先行）
  - 不接受过度工程化的设计，倾向最小必要原则
  - 对布局和视觉问题会提供截图标注，期望助手对比分析
- **审美标准（强制）**：
  - 对标 Todoist / Things 3：极简、精致、不接受模板感
  - CRAP 原则（Contrast/Repetition/Alignment/Proximity）是设计底线
  - 组件有父子层级时必须视觉上可区分（字重、颜色、缩进）
  - 数字列必须垂直对齐，图标必须风格统一
  - 滚动条：完全隐藏（Things 3 风格，内容可滚动但不显示条）
  - 入口克制：「如无必要勿增实体」，优先图标入口而非文字按钮
  - 信息层级：主操作 > 内容 > 辅助信息 > 系统状态，权重依次递减

---

## 产品设计原则（已固化进角色）

### CRAP + Gestalt（PM / UI / FE 强制遵守）

```
C - Contrast    重要 vs 次要有可感知差异，主次按钮对比度 ≥ 4.5:1
R - Repetition  全局统一设计 token，无"相似但不同"的随机变体
A - Alignment   所有元素基于 4px/8px 网格，禁止随意 margin 凑合
P - Proximity   相关元素靠近，不相关拉开。分组间距 ≥ 组内间距 2 倍
```

### 移动端法则
- 触摸目标最小 44px，间距 ≥ 8px
- 手机（≤680px）：底部 Sheet + 拖动关闭
- 平板/中屏（680-1280px）：右侧抽屉自动滑出（400px）
- 宽屏（>1280px）：固定右侧 rail
- 滚动容器必须设宽高约束，折叠侧边栏展开时必须 position:fixed + 遮罩

### 抽屉/弹层规则
- 抽屉打开时必须有半透明遮罩（opacity ≥ 0.3，backdrop-filter blur）
- z-index 层级：底部 Sheet > 300，导航抽屉 > 200，compact sidebar > 200，右侧抽屉 > 150，移动端底部导航 > 30
- 左侧导航抽屉：position:fixed，展开时原 aside 文档流占位必须收为 0（grid 列宽归零）

---

## 技术基线（2026-04-09）

### 架构决策
- 存储：纯 localStorage（桌面端四层存储已废弃），Supabase 云同步（离线优先，400ms 节流）
- 数据同步：Supabase Realtime newer-wins 合并 + 离线队列
- 认证：Supabase Auth（邮箱/Google OAuth），未配置时自动访客模式
- 构建：`npm run build:web`（Web，给 Vercel 用）/ `npm run desktop:build`（Tauri）

### 断点体系（四档）
```
> 1280px    全三栏（sidebar 256px + main + rail 360px）
960-1200px  折叠侧边栏（48px 图标栏，点 toggle 展开为 fixed 256px）
680-960px   导航变左侧抽屉（single main column）
≤ 680px     手机（底部5标签导航 + 底部 Sheet 详情）
```

### 关键文件
- `web/src/App.tsx` — 主应用，所有视图、状态管理
- `web/src/index.css` — 全局样式，设计系统
- `web/src/utils/supabase.ts` — Supabase 客户端
- `web/src/hooks/useAuth.ts` — 认证
- `web/src/hooks/useRealtimeSync.ts` — 多端实时同步
- `web/src/utils/storage.ts` — 离线优先存储层
- `web/src/utils/smart-entry.ts` — 自然语言解析
- `web/src/utils/repeat-rule.ts` — 重复任务规则
- `web/vercel.json` — Vercel 部署配置
- `.env.local` — Supabase key（不进 git，在 web/ 目录下）

### 已完成功能
- 五视图：日历/列表/看板/时间线/四象限
- 任务完整属性：标题/描述/清单/优先级/标签/DDL/计划时间/重复规则/提醒/子任务/附件/备注
- Supabase 账户体系（登录/注册/Google OAuth/访客模式）
- Realtime 多端同步 + 离线队列 + 同步指示器
- 重复任务（daily/weekdays/weekly/monthly/yearly/custom）
- 全局快捷键（⌘N/⌘K/Esc/1-5/?) + 快捷键面板
- 系统主题跟随（三档：跟随系统/深色/浅色）
- 自然语言增强（下周/下月/N天后/#标签/!优先级）
- 统计页：30天趋势 + Streak + 专注时长
- 批量操作（多选/完成/移动/打标签/删除）
- 清单与文件夹完整 CRUD
- 响应式分级详情（手机 Sheet + 平板抽屉 + 桌面 rail）
- 无滚动条全局隐藏

### 待做（Phase 4+）
- macOS 代码签名（Apple Developer $99/年）
- 隐私政策页面 + 服务条款
- App Store 上架（macOS）
- 番茄计时器（数据结构已有，缺 UI）
- 批量操作（移动端适配）

---

## 沟通与协作偏好

### 推进节奏
- master 偏好「先分析 → 给出判断 → 拍板后立即执行」
- 遇到设计/技术两可时，先说清楚利弊，再给出自己的推荐，不把选择全甩给用户
- 执行后主动汇报结果，不等用户追问

### Bug 处理
- 截图/视频会直接发过来，期望助手主动对比分析，不等用户逐条描述
- 修复前先说根因，修复后说清楚改了什么、为什么这样改
- 反复修复失败时，升级到架构层面重构，而不是继续打补丁

### 代码工作流
- 每次改完都要：`npm run build:web` 验证 → `git push` → `npm run desktop:build` + 覆盖安装 `/Applications/TaskFlow.app`
- 重要变更后更新 `.workbuddy/memory/2026-XX-XX.md` 和 `MEMORY.md`

---

## 角色团队规则（.agent-team）

- PM、UI 设计师、前端开发的 system_prompt 已注入 CRAP/Gestalt/44px/层级/克制原则
- 体验官：必须进入前台真实交互界面，不能只看文档或截图就验收
- 体验官发现问题 → PM 承接转化为需求 → PM+PM/Orchestrator 协调落地 → 完成后回交体验官复验
- 基线：`BL-20260402-001`（`configs/baselines/baseline.current.v1.json`）

---

## 历史决策记录

| 时间 | 决策 | 原因 |
|------|------|------|
| 2026-04-09 | 选 Supabase 而非 Firebase | 关系型数据模型更适合，Firebase 国内不稳定，PG 可随时迁移 |
| 2026-04-09 | 先用 Supabase 再评估自建 | 先验证 PMF，节省 4 周后端开发时间 |
| 2026-04-09 | GitHub 仓库改为 Public | 解决 Vercel Hobby 套餐部署 Blocked 问题 |
| 2026-04-09 | 折叠侧边栏改为 click-toggle 而非 hover | hover 在 macOS 容易误触，click toggle 更可预期 |
| 2026-04-09 | 任务详情分级：Sheet/抽屉/rail | 按设备尺寸最优交互体验，对标 Todoist Mobile |
| 2026-04-09 | 滚动条完全隐藏 | Things 3 / Todoist 风格，减少视觉噪音 |
