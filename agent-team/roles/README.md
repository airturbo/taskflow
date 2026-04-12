# roles/

标准版 11 角色的独立配置目录，其中 `独立体验官` 默认被视为项目团队之外的体验把关角色。

## 每个角色子目录包含

| 文件 | 用途 |
|------|------|
| `role.profile.json` | 角色画像：ID、显示名、模型、阶段归属、主责产物 |
| `permissions.yaml` | 权限矩阵：可读 / 可写 / 可批准 / 可阻断 / 禁止 |
| `query-playbook.yaml` | 只读查询手册：查询范围、升级条件、禁止动作 |
| `prompt.system.md` | 系统 Prompt：角色身份、固定约束、输出重点 |

## 角色清单

1. `project-manager-orchestrator/`
2. `product-manager/`
3. `ui-ux-designer/`
4. `user-experience-officer/`
5. `system-architect/`
6. `frontend-engineer/`
7. `backend-engineer/`
8. `qa-engineer/`
9. `devops-engineer/`
10. `data-analyst/`
11. `security-compliance-engineer/`

## 约束

- 新增角色必须同时创建以上 4 个文件
- 修改角色配置必须走 `CHANGE_REQUEST → IMPACT_ASSESSMENT` 流程
- 删除角色必须先确认无下游依赖
- `独立体验官` 负责以高标准体验视角挑刺，不应与项目团队的设计、研发、测试职责混用
