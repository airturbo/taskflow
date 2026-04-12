# WorkBuddy `agent-team` 侧车初始化记录

**Date:** 2026-04-08  
**Status:** Completed  
**Reference:** `2026-04-08-workbuddy-vs-codebuddy-agent-team-repo-comparison-and-fusion-plan-v3.md`

---

## 本次实际执行内容

本次不是使用 skill 参考骨架，而是直接复用用户指定的真实仓库：`/Users/turbo/CodeBuddy/agent-team`。

执行前先备份了当前工作区的 `.codebuddy/`：

- `.workbuddy/backups/2026-04-08-codebuddy-sidecar-bootstrap/pre-bootstrap-codebuddy.tar.gz`

随后执行了真实仓库 CLI：

```bash
cd /Users/turbo/CodeBuddy/agent-team
./.venv/bin/agent-team --project-root /Users/turbo/CodeBuddy/agent-team init-project /Users/turbo/WorkBuddy/20260330162606
```

---

## 实际生成结果

当前工作区已新增并确认存在：

- 顶层 `agent-team/` 侧车目录
- `.codebuddy/agents/` 项目级 orchestrator 与角色 subagents
- `.codebuddy/agent-team/mcp.json`
- `.codebuddy/agent-team/README.md`

同时确认以下原有内容未被覆盖：

- ` .agent-team/ `
- ` .workbuddy/ `
- `.codebuddy/rules/anydev/`

---

## 健康检查结果

在新生成的 `agent-team/` 内执行：

```bash
./.venv/bin/agent-team --project-root /Users/turbo/WorkBuddy/20260330162606/agent-team healthcheck
```

结果摘要：

- `roles_count = 11`
- `current_state = intake`
- `artifacts_count = 0`
- `workflows_count = 0`
- `role_sessions_count = 0`
- `handoffs_count = 0`

这说明：**侧车内核已经可运行，但当前仍是“新初始化状态”，尚未桥接 WorkBuddy 既有历史治理数据。**

---

## 当前语义边界

当前工作区进入双根结构：

- ` .agent-team/ `：WorkBuddy 历史真相层
- `agent-team/`：CodeBuddy `agent-team` 侧车治理内核
- `.codebuddy/agents/` 与 `.codebuddy/agent-team/`：CodeBuddy 宿主接线层

因此在 bridge 完成前，需要明确：

1. `agent-team/state/` 不是 WorkBuddy 历史项目状态全量镜像  
2. `agent-team/artifacts/` 不是 WorkBuddy 既有制品库  
3. `agent-team/logs/` 不是 WorkBuddy 既有 CR/IA/审计日志全集  
4. 查询 WorkBuddy 历史治理事实时，仍应优先查看 ` .agent-team/ ` 与既有 `docs/plans/`

---

## 下一步推荐

建议按 `V3` 方案继续补最小 bridge：

1. `roles materializer`：把 `.agent-team/roles/roles.v1.yaml` 投影到 `agent-team/roles/<role>/...`
2. `state mirror`：把 WorkBuddy 当前项目状态摘要同步到 `agent-team/state/project-state.v1.json`
3. `artifact view / registry bridge`：给 `agent-team` 提供对 WorkBuddy 既有制品注册表的只读投影视图
4. `UX 语义映射`：建立 `ux_review` / `UX_*` 与 `experience_review` / `EXPERIENCE_*` 的映射层

在这些 bridge 落地前，当前状态应视为：**“真实 CodeBuddy agent-team 已接入工作区，但尚未完成与 WorkBuddy 真相层的深度融合。”**
