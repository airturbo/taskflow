# logs/

项目治理日志的统一落点。

## 子目录

| 目录 | 用途 |
|------|------|
| `change-requests/` | 变更请求 `CR-{YYYYMMDD}-{SEQ}.json` |
| `impact-assessments/` | 影响评估 `IA-{YYYYMMDD}-{SEQ}.json` |
| `rollbacks/` | 回退记录 `RB-{YYYYMMDD}-{SEQ}.json` |
| `audit/` | 审计流水 `audit-log.v1.jsonl`（仅追加） |

## 约束

- 变更请求与影响评估按日期 + 序号命名，不可覆盖
- 审计日志为 append-only，禁止修改历史条目
- 回退记录必须包含 `rollback_from_version`、`rollback_to_version` 与验证结果
