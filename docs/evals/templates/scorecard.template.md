# Agent Team Lightweight Evaluation Scorecard Template

## 本次评测

- **A组**: {{LABEL_A}}（`{{PROJECT_A_ROOT}}`）
- **B组**: {{LABEL_B}}（`{{PROJECT_B_ROOT}}`）
- **Run ID**: `{{RUN_ID}}`
- **评测日期**: `{{DATE}}`

## 自动评分总览（满分 80，另有人审 20）

| 维度 | A组 | B组 | 差值 |
|---|---:|---:|---:|
| 结构快照 |  |  |  |
| 共享治理链路 |  |  |  |
| 前端 lane |  |  |  |
| 后端 lane |  |  |  |
| **自动总分** |  |  |  |
| 人工复核（待补） | 20 | 20 | 0 |

## 结构快照对照

| 指标 | A组 | B组 |
|---|---|---|
| `roles_count` |  |  |
| `artifacts_count` |  |  |
| `current_state` |  |  |
| `baseline_tag` |  |  |
| `artifact_projection.exists` |  |  |
| `EXPERIENCE_REVIEW` 命中数 |  |  |

## Golden Cases 对照

| Case | Lane | A组 | B组 | 差值 | 备注 |
|---|---|---:|---:|---:|---|
| FE-1 | frontend |  |  |  |  |
| FE-2 | frontend |  |  |  |  |
| BE-1 | backend |  |  |  |  |
| BE-2 | backend |  |  |  |  |
| GOV-1 | shared |  |  |  |  |
| GOV-2 | shared |  |  |  |  |

## 硬门槛检查

- 守卫状态是否仍被正确阻断：
- baseline / artifact registry 是否可见：
- `experience_review` / `ux_review` 是否无割裂：
- FE / BE 关键 case 是否都未明显倒退：

## 待补人工复核（20 分）

| 项目 | A组(1-5) | B组(1-5) | 备注 |
|---|---:|---:|---|
| 可理解：是否容易看懂当前状态与责任人 |  |  |  |
| 可追溯：是否容易追到 artifact / baseline / change 线索 |  |  |  |
| 可接力：前后端角色是否容易继续承接 |  |  |  |
| 可复盘：是否更容易解释为什么这样路由/推进 |  |  |  |

## 最终结论

1. **融合后是否更好**：
2. **收益主要落点**：
3. **下一步要补的弱链路**：
