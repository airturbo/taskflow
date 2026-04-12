# Agent Team 轻量评测目录

这个目录用于保存融合前后 `agent-team` 的轻量 A/B 评测结果。

## 推荐目录结构

```text
docs/evals/
├── README.md
├── templates/
│   ├── scorecard.template.md
│   └── cases.template.jsonl
└── <run-id>/
    ├── snapshot-a.json
    ├── snapshot-b.json
    ├── cases.jsonl
    └── scorecard.md
```

## 什么时候用

适合回答两个问题：

- **融合后的 `agent-team` 是否比独立版更好？**
- **收益主要落在前端、后端，还是共享治理层？**

## 推荐跑法

### 1. 直接用 CLI

```bash
.venv/bin/agent-team eval-lightweight \
  --project-a /path/to/agent-team-baseline \
  --project-b /path/to/fused-agent-team \
  --label-a 独立版 \
  --label-b 融合版 \
  --output-dir /path/to/docs/evals/2026-04-08-run-001
```

### 2. 用脚本包装器

```bash
./scripts/lightweight_eval.sh \
  /path/to/agent-team-baseline \
  /path/to/fused-agent-team \
  --label-a 独立版 \
  --label-b 融合版 \
  --output-dir /path/to/docs/evals/2026-04-08-run-001
```

## 自动产物说明

- `snapshot-a.json`: A 组结构快照
- `snapshot-b.json`: B 组结构快照
- `cases.jsonl`: 6 个 Golden Cases 的逐条结果
- `scorecard.md`: 自动汇总分数、差值、硬门槛风险和人工复核留空表

## 人工复核建议

自动脚本主要负责：

- 结构快照
- 共享治理链路
- 前端 / 后端关键 case

最终是否判定“更好”，仍建议在 `scorecard.md` 里补完这 4 个轻人工问题：

- 可理解
- 可追溯
- 可接力
- 可复盘

## 模板文件

如果你想手工补一轮评测，优先从 `templates/` 里的两个模板开始：

- `templates/scorecard.template.md`
- `templates/cases.template.jsonl`
