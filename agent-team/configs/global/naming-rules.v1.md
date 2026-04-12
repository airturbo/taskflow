# Naming Rules v1.0

## 文件名

正式文件统一使用：

```text
<artifact-type>--<artifact-id>--v<major>.<minor>.<patch>.<ext>
```

示例：
- `PRD--ART-PRD-0001--v1.2.0.md`
- `ARCHITECTURE_DOC--ART-ARCH-0001--v2.0.0.md`
- `RELEASE_MANIFEST--ART-REL-0001--v1.0.1.yaml`

## 标识符

- Artifact ID：`ART-<TYPE>-<4位序号>`
- Change Request ID：`CR-YYYYMMDD-<3位序号>`
- Rollback ID：`RB-YYYYMMDD-<3位序号>`
- Baseline Tag：`BL-<stage>-YYYYMMDD-<nn>`

## 强约束

- 不允许静默覆盖旧版本
- 正式变更必须产生新版本
- 回退不能删除历史文件，只能新增回退记录
- `approved` 版本才能作为默认下游输入
