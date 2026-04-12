# runtime/

运行时执行器与服务入口。

## 子目录

| 目录 / 文件 | 用途 |
|-------------|------|
| `router/` | 路由执行器：意图分类 → 角色分发 → 模式切换 |
| `state-machine/` | 状态机执行器：阶段推进、guard 检查、回退 |
| `artifact-service/` | Artifact Registry 读写服务 |
| `logger/` | 变更请求 / 影响评估 / 回退 / 审计日志写入服务 |
| `bootstrap.py` | 项目初始化入口脚本 |

## 约束

- 所有执行器仅读取 `configs/` 和 `roles/` 下的配置，不硬编码角色逻辑
- 日志写入只使用 append 模式
- 运行时不修改 `configs/baselines/baseline.current.v1.json`，冻结操作由 Orchestrator 触发并走变更流程
