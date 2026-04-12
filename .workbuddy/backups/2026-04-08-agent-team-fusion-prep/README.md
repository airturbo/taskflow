# 2026-04-08 Agent-Team Fusion Prep Backup

## 备份目的

在编写 `WorkBuddy × CodeBuddy agent-team` 融合改造方案之前，先冻结当前项目治理真相层，确保后续若需要试验性改造，可快速恢复到当前基线。

## 备份内容

- `agent-team.tar.gz`
  - 来源：`.agent-team/`
  - 用途：恢复本地角色、状态机、基线、制品注册表、CR/IA 日志、UX 治理规则与当前产物。

- `workbuddy-plans-memory.tar.gz`
  - 来源：`.workbuddy/plans/`、`.workbuddy/memory/`
  - 用途：恢复 WorkBuddy 的工作记忆、计划文档与上下文沉淀。

- `docs-governance.tar.gz`
  - 来源：`docs/plans/`、`docs/pm/`
  - 用途：恢复现有计划文档与 PM 协调记录。

## 恢复命令

在工作区根目录执行：

```bash
cd /Users/turbo/WorkBuddy/20260330162606
tar -xzf .workbuddy/backups/2026-04-08-agent-team-fusion-prep/agent-team.tar.gz -C /Users/turbo/WorkBuddy/20260330162606
tar -xzf .workbuddy/backups/2026-04-08-agent-team-fusion-prep/workbuddy-plans-memory.tar.gz -C /Users/turbo/WorkBuddy/20260330162606
tar -xzf .workbuddy/backups/2026-04-08-agent-team-fusion-prep/docs-governance.tar.gz -C /Users/turbo/WorkBuddy/20260330162606
```

## 建议的回滚粒度

- **只回滚治理配置**：只恢复 `agent-team.tar.gz`
- **只回滚计划与记忆**：只恢复 `workbuddy-plans-memory.tar.gz`
- **只回滚文档方案**：只恢复 `docs-governance.tar.gz`
- **完全回到备份时刻**：依次恢复三份压缩包

## 说明

- 本次备份是“备份优先、原文件不覆盖”的方式，不会修改已有治理文件。
- 之后若新增融合方案文档，可保留本备份目录作为长期回滚点。
