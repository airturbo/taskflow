# Agent Team LLM Adapters

## 目标

`agent-team` 现在不仅能编译 `execution_payload`，还可以：

- 通过内置 provider adapter 直接执行
- 以 `dry_run` 方式输出标准请求结构
- 自动读取项目根目录下的 `.env`
- 对常见瞬时失败做基础重试退避
- 支持标准化流式事件输出与 CLI 实时显示

## 当前内置 Provider

- `mock`
- `openai`
- `anthropic`
- `gemini`

如果未显式传入 `adapter`，系统会根据 `execution_payload.model.provider_family` 与 `model_alias` 自动推断 provider。

## 模型覆盖与当前限制

`model-config.v1.json` 现在支持两类显式覆盖：

- `artifact_overrides`
- `task_overrides`

当宿主传入 `task_id` 或 `artifact_ids` 时，模型选择优先级为：

- `artifact_override > task_override > handoff_recommendation > role_default > global_default`

当前 provider 执行层 **只支持** `execution_mode="single"`。
如果 payload 中出现 `fallback / parallel_compare / compare_and_merge` 等模式，`build_adapter()` 会直接报错，而不会静默退化为单模型执行。

## 环境变量

### 推荐做法

1. 复制 `.env.example` 为 `.env`
2. 填入你要用的 provider key
3. 按需调整超时与重试参数

### OpenAI

- `OPENAI_API_KEY`
- `AGENT_TEAM_OPENAI_API_KEY`
- 可选：`OPENAI_BASE_URL`

### Anthropic

- `ANTHROPIC_API_KEY`
- `AGENT_TEAM_ANTHROPIC_API_KEY`
- 可选：`ANTHROPIC_BASE_URL`
- 可选：`ANTHROPIC_VERSION`
- 可选：`AGENT_TEAM_ANTHROPIC_MAX_TOKENS`

### Gemini

- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`
- `AGENT_TEAM_GEMINI_API_KEY`
- 可选：`GEMINI_BASE_URL`

### CodeBuddy

- 不需要额外 API Key
- `adapter=codebuddy` 不会直接发起外部网络请求
- `setup-codebuddy` 会为当前工作区生成项目级 Orchestrator Agent、角色级 Agentic Subagents 与 MCP 配置文件
- 总入口 Agent 会同步 Orchestrator 默认模型；角色 Subagents 会同步各自角色默认模型到 frontmatter
- 如果 `agent-team` 位于工作区子目录，可传 `setup-codebuddy --workspace-root <工作区根目录>`
- 在仅走 CodeBuddy 宿主执行时，frontmatter 模型与 `execution_payload.model` / `model_context` 一起构成宿主侧模型选择依据；其中 `execution_payload.model` 才是 `agent-team` 的 override / 审计真源，不代表平台一定百分百强绑定到该模型

### 通用执行参数

- `AGENT_TEAM_LLM_TIMEOUT_SECONDS`
- `AGENT_TEAM_LLM_MAX_RETRIES`
- `AGENT_TEAM_LLM_INITIAL_BACKOFF_SECONDS`
- `AGENT_TEAM_LLM_MAX_BACKOFF_SECONDS`
- `AGENT_TEAM_LLM_RETRY_STATUS_CODES`

## 推荐接法

### 宿主自己调用模型

1. 调 `prepare_role_session`
2. 读取 `execution_payload.messages`
3. 用 `execution_payload.model` 选择宿主侧模型
4. 执行后把结果回传给用户

### 让 `agent-team` 直接执行

#### 有现成 payload 时

1. 先调 `prepare_role_session` 或 `orchestrate_change_flow`
2. 拿到 `execution_payload`
3. 调 `execute_prepared_payload`
4. 如果宿主是 CodeBuddy，可优先传 `adapter="codebuddy"` 生成宿主 handoff 契约

#### 只有自然语言输入时

1. 先调 `get_llm_adapter_status`
2. 如果 provider 已配置，可直接调 `execute_role_with_provider`
3. 首次联调建议先传 `dry_run=true`
4. 确认无误后再切到 `dry_run=false`

## Dry Run 的意义

`dry_run=true` 时不会发出真实网络请求，但会返回：

- provider 名称
- 是否缺少凭证
- 将要访问的 URL
- 已脱敏的请求头
- 请求 body
- 当前超时配置
- 当前重试策略

这非常适合：

- 在 CodeBuddy / WorkBuddy / OpenClaw 里做首次接线
- 检查 provider 推断是否正确
- 核对模型名与 API 结构
- 先验证 prepared payload 是否满足预期

## 重试退避

当前版本会对常见瞬时错误做基础重试：

- 默认状态码：`408, 409, 429, 500, 502, 503, 504`
- 默认最大重试：`2`
- 默认初始退避：`1s`
- 默认最大退避：`8s`

返回结果里会包含：

- `attempts`
- `response_headers`
- `request.retry_policy`

## 流式输出

当前内置的 `openai / anthropic / gemini / mock` 都支持统一的流式事件格式。

### 统一事件结构

- `event=start`：流开始
- `event=delta`：文本增量，字段在 `text`
- `event=complete`：流结束，包含 `finish_reason / usage / attempts`

### CLI 直接看实时输出

```bash
.venv/bin/agent-team execute "看看当前PRD的进展" --adapter mock --stream
```

### CLI 输出 JSONL 事件流

```bash
.venv/bin/agent-team execute "看看当前PRD的进展" --adapter mock --stream-jsonl
```

### MCP / SDK 侧拿结构化事件

给 `execute_prepared_payload` 或 `execute_role_with_provider` 传 `stream=true`，返回结果里的 `result.events` 就是按顺序缓冲好的事件数组。

## CLI 示例

```bash
cd /Users/turbo/CodeBuddy/agent-team
./scripts/setup_venv.sh
cp .env.example .env
```

### 查看 provider 状态

```bash
.venv/bin/agent-team adapter-status
```

### 从自然语言直接 dry-run

```bash
.venv/bin/agent-team execute "看看当前PRD的进展" --dry-run
```

### 先生成 payload 再执行

```bash
.venv/bin/agent-team payload "看看当前PRD的进展" > /tmp/payload.json
.venv/bin/agent-team execute-payload /tmp/payload.json --dry-run
```

## 典型 MCP 调用顺序

### 只读查询

1. `route_request`
2. `prepare_role_session`
3. `execute_prepared_payload(dry_run=true)`
4. 验证通过后，改为 `dry_run=false`

### 正式变更

1. `route_request`
2. `orchestrate_change_flow`
3. `execute_prepared_payload(dry_run=true)`
4. 验证通过后，改为 `dry_run=false`

## 当前边界

当前实现聚焦通用 HTTP JSON provider：

- 已支持标准请求拼装
- 已支持响应文本提取
- 已支持最小错误处理
- 已支持基础重试退避
- 已支持 `.env` 自动加载
- 已支持标准化流式事件输出

尚未覆盖：

- 多轮会话记忆裁剪
- Tool calling / function calling
- CodeBuddy 内核私有直调 SDK / transport
- 真实生产凭证下的流式回归压测
