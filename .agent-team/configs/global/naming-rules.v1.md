# Naming Rules — Multi-Role Agent Team

所有 ID、文件名、目录结构的命名约定。

## Artifact ID

格式：`ART-{TYPE}-{NNNN}`

- `TYPE`: 大写下划线产物类型（如 `PRD`、`API_SPEC`、`TEST_PLAN`）
- `NNNN`: 四位流水号，从 0001 开始
- 示例：`ART-PRD-0001`、`ART-API_SPEC-0003`

## Artifact 文件名

格式：`{TYPE}--{ARTIFACT_ID}--{VERSION}.{EXT}`

- 示例：`PRD--ART-PRD-0001--v1.0.0.md`
- 存放路径：`artifacts/by-type/{TYPE}/`

## Change Request ID

格式：`CR-{YYYYMMDD}-{NNN}`

- 按日期 + 当日流水号自动生成
- 示例：`CR-20260401-001`

## Impact Assessment ID

格式：`IA-{YYYYMMDD}-{NNN}`

- 示例：`IA-20260401-001`

## Rollback Record ID

格式：`RB-{YYYYMMDD}-{NNN}`

- 示例：`RB-20260401-001`

## Baseline Tag

格式：`BL-{YYYYMMDD}-{NNN}`

- 示例：`BL-20260401-001`
- 存储在 `configs/baselines/baseline.current.v1.json`
- 历史追加到 `configs/baselines/baseline.history.v1.jsonl`

## Version

语义化版本：`v{MAJOR}.{MINOR}.{PATCH}`

- 新建产物：`v1.0.0`
- 内容修改：`v1.1.0`、`v1.2.0`
- 格式或 typo：`v1.0.1`
- 重大改版：`v2.0.0`

## Role ID

全部小写 + 下划线，与 `roles.yaml` 中的 key 保持一致。

| Role | ID |
|------|----|
| 项目经理 | `project_manager_orchestrator` |
| 产品经理 | `product_manager` |
| UI/UX 设计师 | `ui_ux_designer` |
| 系统架构师 | `system_architect` |
| 前端开发 | `frontend_engineer` |
| 后端开发 | `backend_engineer` |
| 测试工程师 | `qa_engineer` |
| 用户体验官 | `user_experience_officer` |
| 运维工程师 | `devops_engineer` |
| 数据分析师 | `data_analyst` |
| 安全/合规 | `security_compliance_engineer` |
