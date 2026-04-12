# Agent Team Lightweight Evaluation Scorecard

## 本次评测

- **A组**: 独立版影子基线（`/Users/turbo/WorkBuddy/20260330162606/.workbuddy/shadow/codebuddy-agent-team-baseline/.agent-team`）
- **B组**: 当前融合版（`/Users/turbo/WorkBuddy/20260330162606/agent-team`）
- **输出目录**: `/Users/turbo/WorkBuddy/20260330162606/docs/evals/2026-04-08-live-run`
- **自动结论**: **better**
- **自动总分差值**: **+26**

## 自动评分总览（满分 80，另有人审 20）

| 维度 | A组 | B组 | 差值 |
|---|---:|---:|---:|
| 结构快照 | 9 | 15 | +6 |
| 共享治理链路 | 15 | 25 | +10 |
| 前端 lane | 10 | 20 | +10 |
| 后端 lane | 20 | 20 | +0 |
| **自动总分** | **54** | **80** | **+26** |
| 人工复核（待补） | 20 | 20 | 0 |

## 结构快照对照

| 指标 | A组 | B组 |
|---|---|---|
| `roles_count` | 11 | 11 |
| `artifacts_count` | 0 | 48 |
| `current_state` | intake | impact_assessment |
| `baseline_tag` | None | BL-20260402-001 |
| `artifact_projection.exists` | True | True |
| `EXPERIENCE_REVIEW` 命中数 | 0 | 3 |

## Golden Cases 对照

| Case | Lane | A组 | B组 | 差值 | B组观察 |
|---|---|---:|---:|---:|---|
| FE-1 | frontend | 10/10 | 10/10 | +0 | 前端角色会话与执行 payload 可正常生成 |
| FE-2 | frontend | 0/10 | 10/10 | +10 | 体验词汇桥接对前端链路可见 |
| BE-1 | backend | 10/10 | 10/10 | +0 | 后端角色会话与执行 payload 可正常生成 |
| BE-2 | backend | 10/10 | 10/10 | +0 | 后端治理守卫仍然生效 |
| GOV-1 | shared | 12/12 | 12/12 | +0 | 体验状态别名桥接可用 |
| GOV-2 | shared | 3/13 | 13/13 | +10 | 共享真相层对 sidecar 已可见 |

## B组硬门槛风险

- 无

## 待补人工复核（20 分）

| 项目 | A组(1-5) | B组(1-5) | 备注 |
|---|---:|---:|---|
| 可理解：是否容易看懂当前状态与责任人 |  |  |  |
| 可追溯：是否容易追到 artifact / baseline / change 线索 |  |  |  |
| 可接力：前后端角色是否容易继续承接 |  |  |  |
| 可复盘：是否更容易解释为什么这样路由/推进 |  |  |  |

## 建议关注点

- 当前自动评测已显示融合收益，下一步建议补 5 分钟人工复核，确认可理解 / 可追溯 / 可接力 / 可复盘。

## 产出文件

- `snapshot-a.json`
- `snapshot-b.json`
- `cases.jsonl`
- `scorecard.md`
