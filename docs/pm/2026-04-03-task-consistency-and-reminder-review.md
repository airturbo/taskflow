# 2026-04-03 任务一致性修复与提醒系统复核报告

## 本轮目标
直接对齐 master 最新要求，按顺序完成 4 件事：
1. 修复 app 端不同视图任务数量不一致的严重 bug；
2. 把“左侧计数 = 当前视图卡片集合”的一致性做成长期回归；
3. 从技术视角 + 产品视角复核任务信息的存储与更新机制；
4. 参考市面竞品，给出提醒系统优化方案。

---

## 一、已落地修复

### 1. desktop 主视图数据源统一
本轮最核心的问题，不是某一个视图单独算错，而是 desktop 模式下原来存在两套真相：
- 左侧计数 / 顶部统计：走 SQLite repository 查询；
- 列表 / 看板 / 四象限 / 时间线 / 日历卡片：大多仍走前端 fallback cache 推导。

这会天然制造“左边 2 个，视图里 3 个”的分叉。

本轮已收口为：
- `list / kanban / matrix` 直接使用 `desktopVisibleTasks`
- `calendar` 直接使用 `desktopCalendarTasks`
- `timeline` 直接使用 `desktopTimelineTasks`
- 只有 desktop 查询结果尚未返回时，才回退到前端 fallback 数组

### 2. 侧边栏计数补齐当前工作区过滤语义
本轮同时把侧边栏计数补齐到当前工作区过滤条件：
- `selectedTagIds`
- `searchKeyword`

也就是说，当前工作区如果已经通过标签交集或搜索缩小了结果集，左侧数字不再沿用未过滤的旧口径，而是和当前工作区真实卡片集合一致。

### 2.1 二次收口：活动工作区计数与 hero 指标绑定当前渲染集合
在用户最新截图里，又出现了一种更隐蔽的分叉：
- 列表里的卡片已经先更新到 5 条
- 但左侧“全部”和顶部“活跃任务”仍停在 3

这说明除了 repository query 与 fallback cache 分叉之外，**当前渲染集合** 与 **活动工作区摘要数字** 之间仍有一个时间差窗口。

这轮已进一步收口为：
- `list / kanban / matrix` 这类完整工作区视图下，活动中的 sidebar count 不再盲信异步回流结果，而是优先对齐当前已渲染的任务集合
- 顶部 hero 指标也统一改为基于当前实际展示的任务集合计算

产品层面的意义很直接：
- 用户当前眼前看到几条卡片，活动工作区的 count 和 hero 数字就必须是多少
- 即便 repository 查询尚在回流，也不能让“列表 5 条、全部 3 条”这种感知层错乱再出现

### 3. 日历 month / week / agenda 挂日规则统一
之前三个子视图对同一个任务的落点不一致：
- month：`dueAt ?? startAt`
- week：`startAt ?? dueAt`
- agenda：`dueAt ?? startAt`

这不只是显示差异，还会影响：
- 同任务跨视图“今天在哪一天出现”
- 日历拖拽改期时的 source date
- 周视图 / 列表视图统计是否一致

本轮已抽成统一 helper：
- `getCalendarTaskAnchor(task)`
- `getCalendarTaskDateKey(task)`

当前日历三个子视图已改为同一套挂日规则，不再各算各的。

### 4. 回归脚本补齐数量一致性检查
已扩展 `.workbuddy/browser-audit/ux-review-runner.mjs`，新增：
- 列表 / 看板 / 四象限 数量一致性检查
- 列表 / 看板 / 四象限 标题集合一致性检查
- calendar 周视图 / agenda 视图 数量一致性检查
- calendar 周视图 / agenda 视图 标题集合一致性检查
- 回归脚本自身的弱场景容错，避免无关链路让整轮验证中断

---

## 二、回归结果

最新回归结果见：
- `.workbuddy/browser-audit/results/ux-review-summary.json`

关键结果：
- `crossViewParity.allMatchesList = true`
- `crossViewParity.allMatchesActiveMetric = true`
- `crossViewParity.activeMetricMatchesList = true`
- `crossViewParity.listMatchesKanban = true`
- `crossViewParity.listMatchesMatrix = true`
- `crossViewParity.weekMatchesAgenda = true`
- `crossViewParity.listTitlesMatchKanban = true`
- `crossViewParity.listTitlesMatchMatrix = true`
- `crossViewParity.weekTitlesMatchAgenda = true`

本轮样本下的核心计数结果：
- `allSelectionCount = 6`
- `activeMetricCount = 6`
- `listCount = 6`
- `kanbanVisibleCount = 6`
- `matrixVisibleCount = 6`
- `weekTaskCount = 5`
- `agendaVisibleTaskCount = 5`

判断：
- “同一工作区、同一过滤条件下，不同主视图卡片数量不一致”的主问题已收口。
- calendar 周 / agenda 之间原来的挂日分叉也已经收口。

已知未收口但不属于本轮主阻塞：
- 浏览器环境仍持续出现 `AudioContext was not allowed to start` 警告；这说明提醒声音在浏览器受用户手势限制，真正稳定的声音反馈仍应以 packaged desktop app 为主。

---

## 三、任务信息存储与更新机制复核

## 3.1 技术视角结论

### 当前真实架构
当前 desktop 端不是“纯前端 localStorage 应用”，也不是“彻底无缓存的纯 SQL 客户端”，而是三层组合：

1. **SQLite repository：主持久化真源**
   - 主表 / 关系表：`tasks`、`task_tags`、`task_reminders`、`task_subtasks`、`task_attachments`、`task_comments`、`task_activity` 等
   - 工作区壳状态：`workspace_state`

2. **query-first shell：主查询链路**
   - 冷启动先读 `workspace_state`
   - 当前 selection 的任务、计数、统计，再按需直查 repository

3. **snapshot / legacy store：节流镜像与兜底链路**
   - 用于兼容与恢复，不应再被当作主查询真源

### 当前主链路
**读链路**
- `loadState()`
- `loadDesktopStateWithMigration()`
- `loadDesktopWorkspaceShellState()`
- 初始只加载 workspace shell，`tasks: []`
- 当前 selection 再通过 `queryDesktopRepositoryTasksBySelection()` / `queryDesktopRepositorySelectionCounts()` / `queryDesktopRepositoryTaskStatsBySelection()` 按需拉取

**写链路**
- 前端 mutation
- `saveDesktopTask()`
- `enqueueDesktopPersistence()`
- `upsertDesktopRepositoryTask()`
- 节流触发 mirror：snapshot + legacy store

### 这轮复核后确认的优势
1. **主数据已经结构化，不再是整包 JSON 硬存**
2. **任务关系已拆表，后续继续扩提醒 / 评论 / 活动都有空间**
3. **写链路是单 task 增量 upsert，不再整库 delete + rewrite**
4. **冷启动壳与当前 selection 查询已分离，方向是对的**

### 这轮复核后确认的风险
1. **selection 规则维护了两份**
   - 前端内存版：`getTasksForSelection()`
   - repository SQL 版：`buildSelectionTaskQuery()`
   - 这仍是长期一致性风险点

2. **前端 cache 仍然存在且仍会参与部分链路**
   - 本轮已经把主视图渲染切回 repository-first
   - 但 cache 仍承担 detail fallback / merge mirror / 部分兜底责任
   - 这意味着“cache 只是缓存，不是另一个业务真源”这个边界需要继续守住

3. **工作区计数原来没有完整吃到 workspace filter**
   - 本轮已修复到包含 `selectedTagIds` / `searchKeyword`
   - 这类问题说明“workspace filter”在产品语义上已经是一级概念，后续不能再当附加条件处理

### 技术结论
当前架构已经足够支撑高保真 parity demo 继续往前推进；但再往后做更复杂能力时，不建议继续把 selection / calendar / timeline 规则散落在 `App.tsx` 和 repository 两头分别维护。下一阶段最值得做的是：
- 把 selection 规则提炼成统一 query contract
- 把 calendar / timeline 的日期语义继续抽出公共 helper
- 把“cache 仅作镜像和兜底”的边界写成明确约束

## 3.2 产品视角结论

从产品和体验角度，这轮问题不是“数字错了一下”，而是破坏了用户对系统的基本信任。

一旦出现：
- 左边说 2 个
- 列表里 3 个
- 看板再换一个数

用户不会去区分这是 selection query、cache fallback、calendar anchor 还是 timeline subset。他只会得出一个结论：**这个产品不可信。**

因此本轮确认 4 条产品不变量：
1. **同一工作区 + 同一过滤条件下，列表 / 看板 / 四象限必须看到同一批任务**
2. **calendar 的不同子模式，对同一任务的挂日规则必须一致**
3. **timeline 是 scheduled subset，可以少，但必须“少得有理由”，不能“少得说不清”**
4. **标签交集、搜索词、selection 本身都属于当前工作区语义，数字必须跟着工作区一起变化**

---

## 四、提醒系统现状复核

### 当前实现现状
本轮梳理后，当前提醒系统本质上仍是 demo 级实现：
- `App.tsx` 定时轮询提醒候选
- `collectReminderEvents()` 负责本地触发计算
- `useReminderCenter()` 只维护一个内存 feed
- `snoozeReminder()` 通过追加 absolute reminder 实现稍后提醒
- `repeatRule` 还没有真正驱动提醒调度
- 浏览器声音受 `AudioContext` 用户手势限制

### 当前短板
1. **提醒模型过浅**
   - relative reminder 只支持 `m/h/d`
   - 缺少提醒模板、提醒策略、渠道策略、批量设置

2. **时间语义不够清楚**
   - 现在主要是 `startAt / dueAt`
   - 没有把“计划开始时间”和“硬截止时间”明确拆开

3. **交互闭环不够完整**
   - feed 是临时内存态，不是一个真正的提醒中心
   - 稍后提醒是能用，但还不够像正式产品
   - 缺少“已触发 / 已稍后 / 已完成 / 已忽略”的完整状态流

4. **跨端体验不稳定**
   - web 能提示，但声音和系统通知受浏览器限制
   - desktop 更适合做真实通知，但目前能力还没被完全用起来

---

## 五、竞品参考与设计启发

### 1. TickTick（官方功能页）
来源：`https://ticktick.com/features`

可借鉴点：
- 持续提醒（Constant Reminder）
- 多视图日历（年 / 月 / 周 / 日程 / 多日 / 多周）
- 时间线式计划表达
- 地理位置提醒
- 每日回顾
- 番茄 / 习惯 / 日历 / 任务整合在同一产品里

启发：
- TickTick 强在“能力全”，适合作为我们 reminder power ceiling 的参考。
- 但它也容易功能很多、层次很厚；我们不能照着把界面做重。

### 2. Todoist（官方帮助页）
来源：
- Reminders: `https://www.todoist.com/help/articles/introduction-to-reminders-9PezfU`
- Deadlines: `https://www.todoist.com/help/articles/introduction-to-deadlines-uMqbSLM6U`

可借鉴点：
- 自动提醒 / 自定义提醒 / 重复提醒 / 位置提醒的清晰分层
- 提醒支持“任务前多久”这类 relative rule
- 明确区分 `date` 与 `deadline`
  - `date`：计划何时开始做
  - `deadline`：真正不能错过的硬截止

启发：
- Todoist 最值得借的是**时间语义拆分**。这能大幅减少“今天做”与“必须今天交”的混乱。

### 3. Things（官方提醒支持页）
来源：`https://culturedcode.com/things/support/articles/2803585/`

可借鉴点：
- 把提醒定义成“gentle nudge”，不是持续轰炸
- 支持 10 / 30 / 60 分钟稍后提醒
- 明确强调：提醒会打断专注，不应该滥用

启发：
- Things 最值得借的是**提醒克制哲学**：提醒不是越多越专业，而是越准确、越少打断越高级。

---

## 六、提醒系统优化方案

## 6.1 产品原则
下一阶段提醒系统不建议单纯对标某一个竞品，而是组合三家的长处：
- **TickTick 的能力完整度**
- **Todoist 的时间语义清晰度**
- **Things 的提醒克制感和专注友好**

一句话原则：
**提醒要更强，但界面要更克制；能力要更完整，但默认不要更吵。**

## 6.2 方案拆分

### Phase A：先把“可用性”补齐（优先）
目标：把当前 demo 级提醒做成真正能每天用的提醒。

建议落地：
1. **补持久化 reminder inbox**
   - 让提醒 feed 不只是内存数组
   - 至少保留最近触发记录、稍后记录、关闭记录

2. **补标准 snooze presets**
   - `10 分钟`
   - `30 分钟`
   - `1 小时`
   - `今天晚上`
   - `明天上午`

3. **补“开始时提醒 / 截止前提醒”两类模板**
   - 让用户少手填 reminder value
   - 也能把相同提醒模型用于 timeline / calendar / quick create

4. **补 desktop-first 真实通知链路**
   - packaged desktop 端优先承接系统通知与声音
   - web 端保留能力，但承认浏览器声音限制

### Phase B：把“时间语义”做对（高价值）
目标：让提醒不再依赖模糊的 `dueAt` 单字段语义。

建议落地：
1. **新增 `deadlineAt`**
   - `startAt`：计划开始
   - `dueAt`：计划完成 / 当天安排
   - `deadlineAt`：真正不可错过的硬截止

2. **提醒规则跟时间语义绑定**
   - 开始前提醒：围绕 `startAt`
   - 截止前提醒：围绕 `deadlineAt` 或 `dueAt`
   - 自动提醒模板：跟用户默认偏好绑定

3. **详情栏文案明确区分**
   - 不再让“开始时间”“计划日期”“截止日期”混成一组

### Phase C：把“产品完成度”拉上去（增强）
目标：把 reminder 从“能响”升级成“有系统感”。

建议落地：
1. **提醒中心分状态**
   - 待处理
   - 已稍后
   - 已完成
   - 已忽略

2. **通知动作化**
   - 完成
   - 稍后 10m
   - 稍后 30m
   - 打开详情

3. **每日回顾 / 次日预告**
   - 晚上给一个“明日重点”摘要
   - 早上给一个“今天安排”摘要

4. **后续再评估位置提醒**
   - 这是锦上添花，不是当前 release blocker

---

## 七、建议的下一阶段排期

### 本轮已完成
- 跨视图任务数量不一致主问题修复
- 数量一致性回归补齐
- 存储 / 更新机制复核结论输出
- 提醒系统优化方案输出

### 接下来最值得排的 3 件事
1. **把 selection 规则从前端 / repository 双写收成一套 contract**
2. **把 reminder center 做成持久化状态机，而不是内存提示条**
3. **在 desktop 打包环境做一轮真实通知 / 声音 / 稍后提醒 smoke**

---

## 最终判断
本轮严重 bug 的主问题已经收口，当前产品重新回到一个更可信的状态：
- 左侧数字和主视图卡片口径重新对齐
- calendar 子模式不再各挂各的日期
- 存储 / 查询 / 更新机制的边界更清楚了

但提醒系统还没有达到“像正式产品一样可靠和讲究”的水准。

如果只允许给一个产品判断：
**任务一致性问题这轮可以关；提醒系统问题这轮只能算方案定稿，下一轮必须进入落地。**
