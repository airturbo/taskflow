# configs/

全局配置与基线管理。

## 子目录

| 目录 | 用途 |
|------|------|
| `global/` | 模型策略、路由规则、状态机、命名规范 |
| `baselines/` | 当前基线快照与基线变更历史 |

## 约束

- 所有 JSON / YAML 文件遵守 `naming-rules.v1.md` 中的命名规范
- 修改任何全局配置前必须创建 `CHANGE_REQUEST`
- `baselines/baseline.current.v1.json` 只能在基线冻结流程中被替换
