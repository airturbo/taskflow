# Master Preferences Knowledge

本目录用于把跨项目偏好引入当前项目，并补充当前项目的个性化偏好。

## 文件说明

- `master-preferences.snapshot.md`：从共享偏好库同步过来的快照
- `project-overrides.md`：当前项目额外补充的偏好与验收口径

## 当前共享来源

- `/Users/turbo/.codebuddy/agent-team/master-preferences/master-preferences.md`

## 运行方式

`agent-team` 在生成 `execution_payload` 时，会自动把上述两份文件注入角色上下文。
因此角色在回答和产出制品时，会优先参考这些偏好。
