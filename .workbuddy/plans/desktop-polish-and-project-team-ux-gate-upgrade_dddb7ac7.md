---
name: desktop-polish-and-project-team-ux-gate-upgrade
overview: 收口桌面端剩余 3 个 P2 体验问题，并升级 multi-role-project-team 技能与项目本地治理，让项目经理主导、体验官以独立且极致挑剔的标准反复打回并驱动迭代，直到达到发布级完成度。
todos:
  - id: align-acceptance
    content: 用 [skill:brainstorming] 和 [subagent:code-explorer] 固化 P2 验收与治理边界
    status: completed
  - id: polish-app-logic
    content: 修改 web/src/App.tsx 收口搜索、日历创建和键盘语义
    status: completed
    dependencies:
      - align-acceptance
  - id: polish-app-style
    content: 修改 web/src/index.css 和 ux-review-runner.mjs 完成交互回归
    status: completed
    dependencies:
      - polish-app-logic
  - id: upgrade-skill-docs
    content: 用 [skill:multi-role-project-team] 升级 roles、SOP、治理规则和 SKILL 说明
    status: completed
    dependencies:
      - align-acceptance
  - id: repair-skill-runtime
    content: 修改 bootstrap、router、state_machine 落地本地角色覆盖与持久化
    status: completed
    dependencies:
      - upgrade-skill-docs
  - id: sync-project-governance
    content: 同步 .agent-team 本地配置、状态和 UX 制品并完成闭环
    status: completed
    dependencies:
      - polish-app-style
      - repair-skill-runtime
---

## User Requirements

- 在现有桌面端和网页端基础上，把仍未收口的 3 个体验问题优化完成：搜索输入节奏、日历创建命中策略、卡片键盘焦点一致性。
- 补充完善 project team skills，让项目经理、产品经理、设计、前端、QA、体验官形成更严格的反复迭代闭环。
- 体验官需要先快速了解 PRD，再以独立、挑剔、极高审美标准的真实用户身份体验产品；PRD 功能高标准实现只是基础，还要继续挑刺并持续打回团队优化，直到达到极致完成度。
- 升级全局 skill 与当前项目本地治理副本，让这套规则不只停留在说明文字，而能在当前项目里立即生效。

## Product Overview

- 当前产品保持现有待办管理工作台形态不变，重点提升桌面端细节完成度：搜索更顺、日历创建更克制、卡片键盘操作更完整，整体交互更像成熟应用。
- 团队治理上，项目团队交付后由体验官独立把关；体验问题进入正式返工和复审循环，直至体验门禁通过。

## Core Features

- 收口桌面端 3 个剩余 P2 问题，补齐输入、创建、键盘交互体验。
- 强化体验官角色定义、评审步骤、问题定级、打回机制和复审闭环。
- 强化项目经理的编排责任，确保问题分派、返工、复测、复审全链路闭环。
- 让全局 skill 规则、项目本地配置、角色副本和运行脚本保持一致并可落地执行。
- 继续复用现有 UX 审查产物体系，输出可追踪、可复审的最新体验结论。

## Tech Stack Selection

- 前端交互层沿用当前项目的 Vite + React + TypeScript，核心修改仍集中在 `web/src/App.tsx`。
- 样式层沿用现有全局样式文件 `web/src/index.css`，不引入新的样式体系。
- 桌面端继续基于现有 Tauri 包装形态收口交互问题，不改动既有桌面架构方向。
- 团队治理层沿用当前 `multi-role-project-team` 的 Python 脚本加 YAML / Markdown / JSON 配置模式；全局 skill 源在 `/Users/turbo/.workbuddy/skills/multi-role-project-team/`，项目本地副本在 `.agent-team/`。
- 回归证据链继续复用现有 Playwright 脚本 `/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit/ux-review-runner.mjs`。

## Implementation Approach

### 实施策略

本次改动分成两条线并行收口：一条线处理桌面端剩余 3 个 P2 交互问题，直接复用现有 pointer 拖拽、卡片 badge、反馈样式和视图组织；另一条线升级项目团队 skill，把“体验官独立把关、项目经理驱动反复迭代”的规则落到角色定义、SOP、同步机制和运行时加载逻辑里。

### 关键技术决策

- **搜索 debounce 不新建复杂状态层**：在现有 React 状态基础上拆分“输入态”和“查询态”，仅对查询态做 120 到 180ms 级延迟触发，避免每次击键都驱动桌面派生查询。
- **日历创建命中策略不推翻现有视图结构**：沿用当前日历月 / 周 / agenda 视图和点击链路，只收紧创建触发条件，优先显式入口，避免与拖拽、查看、选中行为冲突。
- **键盘焦点统一复用现有卡片组件根节点**：在列表、看板、四象限卡片根节点补语义、焦点可视化和 Enter / Space 行为，内部 badge 与按钮继续阻止事件串扰，避免引入新的交互模型。
- **skill 升级优先兼容现有用法**：全局 `roles.yaml`、SOP、治理规则增强后，`router.py` 优先读项目本地角色副本，缺失时再回退全局配置，降低现有项目和旧会话的破坏面。
- **治理状态改为真正持久化**：`state_machine.py` 需要读取并写回 `project-state.v1.json`，否则 UX gate 只能停留在文档层，无法形成可验证的流程约束。

### Performance 与 Reliability

- 搜索链路从“每次输入都触发一次查询”收敛为“每次停顿触发一次查询”，将高频输入阶段的派生计算和重渲染显著减少；单次状态更新仍为 O(1)。
- 日历创建命中与键盘焦点改动只作用于当前交互入口，不增加新的全局扫描或昂贵监听。
- 路由与状态机改动只在低频治理操作时读写配置和状态文件，I/O 开销可接受；关键是保证幂等和回退兼容。
- 治理配置同步采用“项目本地优先、全局回退”的策略，避免一次 skill 升级影响所有既有项目的运行稳定性。

## Implementation Notes

- 继续复用 `web/src/App.tsx` 中已有的 pointer 阈值、click suppress、拖拽预览和 badge 交互模式，不做无关重构。
- 搜索 debounce 只延迟查询，不延迟输入框显示；避免把“打字手感”与“查询结果更新”绑死。
- 日历命中收紧时要避开已有任务卡片、拖拽态和显式按钮，防止修复误触时反而破坏现有改期能力。
- 键盘语义补齐时要区分“卡片主操作”和“卡片内子控件”，避免 Enter / Space 同时触发详情打开和属性修改。
- skill 侧不要静默覆盖已存在的项目本地配置；应保留安全回退与受控同步逻辑。
- 治理产物遵循现有命名规则和 artifact registry 记录方式，尽量避免直接覆写已批准文件。

## Architecture Design

### 系统结构

- **产品交互层**：`WorkspaceApp` 及其列表、日历、看板、四象限视图继续承载用户操作收口。
- **体验回归层**：现有 `ux-review-runner.mjs` 扩展为覆盖搜索、日历创建和键盘焦点的新证据脚本。
- **治理源配置层**：全局 skill 的 `roles.yaml`、`ux-governance-rules.md`、`ux-review-sop.md`、`SKILL.md` 定义团队规则。
- **项目本地运行层**：`.agent-team/configs/global/` 和新增的 project-local role 副本承接当前项目立即生效的规则。
- **运行时治理层**：`bootstrap.py` 负责同步，`router.py` 负责角色加载与路由，`state_machine.py` 负责持久化状态和 UX gate 执行。

```mermaid
flowchart LR
  A[Global skill references] --> B[bootstrap.py sync]
  B --> C[Project local configs and roles]
  C --> D[router.py and state_machine.py]
  D --> E[项目经理编排返工]
  E --> F[体验官独立评审]
  F -->|打回| E
  F -->|通过| G[release_preparation]
```

## Directory Structure

## Directory Structure Summary

本次实现同时覆盖产品交互收口和团队治理升级，两部分都严格复用现有目录与命名方式；只有在当前结构已存在明显缺口时，才新增 project-local role 副本文件。

```text
/Users/turbo/.workbuddy/skills/multi-role-project-team/
├── SKILL.md  # [MODIFY] 更新 skill 总说明，明确体验官先快读 PRD、再以独立用户身份极致挑刺，并补齐闭环与本地同步说明。
├── references/
│   ├── roles.yaml  # [MODIFY] 强化项目经理、产品经理、设计、前端、QA、体验官职责与协作边界，明确极致体验闭环。
│   ├── ux-governance-rules.md  # [MODIFY] 提升体验门禁标准，强调“高标准实现只是基础”和持续打回迭代要求。
│   ├── ux-review-sop.md  # [MODIFY] 明确体验官先快速理解 PRD，再切换为独立挑剔用户进行完整体验与复审。
│   ├── router-config.yaml  # [MODIFY] 增补 `ux_review` 阶段优先角色与更清晰的体验治理路由偏好。
│   └── state-machine.yaml  # [MODIFY] 收紧 UX gate 描述与状态约束，确保发布前必须经过体验门禁。
├── scripts/
│   ├── bootstrap.py  # [MODIFY] 补 project-local roles 同步与受控升级逻辑，保持初始化幂等。
│   ├── router.py  # [MODIFY] 优先加载项目本地 role 配置，保留全局回退，并接入阶段优先路由。
│   └── state_machine.py  # [MODIFY] 读取和写回 `project-state.v1.json`，让状态流转真正持久化并可审计。

/Users/turbo/WorkBuddy/20260330162606/
├── web/
│   └── src/
│       ├── App.tsx  # [MODIFY] 收口搜索 debounce、日历创建命中、列表/看板/四象限卡片键盘语义与事件边界。
│       └── index.css  # [MODIFY] 补键盘焦点可视化、显式创建入口反馈与新交互态样式，保持现有桌面质感一致。
├── .workbuddy/
│   └── browser-audit/
│       └── ux-review-runner.mjs  # [MODIFY] 扩展回归脚本，新增搜索节奏、日历创建、键盘焦点和 Enter/Space 场景验证。
└── .agent-team/
    ├── roles/
    │   └── roles.v1.yaml  # [NEW] 项目本地角色副本，承接当前项目立即生效的 role override 能力。
    └── configs/
        └── global/
            ├── ux-governance-rules.v1.md  # [MODIFY] 同步升级后的体验治理规则到当前项目。
            ├── ux-review-sop.v1.md  # [MODIFY] 同步新的体验官工作流与复审要求。
            ├── router-config.v1.yaml  # [MODIFY] 同步 `ux_review` 路由与阶段优先规则。
            ├── state-machine.v1.yaml  # [MODIFY] 同步新的 UX gate 状态约束。
            └── project-state.v1.json  # [MODIFY] 作为持久化状态文件，记录本轮治理流转与后续复审状态。
    ├── artifacts/
    │   ├── registry/
    │   │   └── artifact-registry.v1.json  # [MODIFY] 登记本轮新增或升级的治理与 UX 产物版本。
    │   └── by-type/
    │       ├── UX_REVIEW_REPORT/
    │       │   └── UX_REVIEW_REPORT--ART-UX_REVIEW_REPORT-0003--v1.0.0.md  # [MODIFY] 更新本轮桌面端问题关闭结论与复审说明。
    │       └── UX_ISSUE_LOG/
    │           └── UX_ISSUE_LOG--ART-UX_ISSUE_LOG-0003--v1.0.0.md  # [MODIFY] 关闭 UX-012/013/014 或转为下一版本明确状态。
```

## Agent Extensions

- **brainstorming**
- Purpose: 在实现前收束剩余 3 个 P2 问题和治理升级的验收边界。
- Expected outcome: 得到可执行、可复审的交互标准和角色协作标准。
- **multi-role-project-team**
- Purpose: 复用现有 CR / IA / UX gate 体系设计 skill 升级、角色闭环和项目治理同步。
- Expected outcome: 形成更严格的体验官终审机制和项目经理返工编排机制。
- **code-explorer**
- Purpose: 精准确认 `web/` 与 skill 源文件、本地治理副本之间的实际修改链路。
- Expected outcome: 降低误改和漏改风险，让实现严格落到已验证路径。