# BFN-IR 2.2 用户端口标签表示扩展

## 状态与目的

BFN-IR 2.2 是 Batch 12.0.2 的当前项目对象 schema。Batch 12.1 预检确认，冻结的 `UserModulePortDraft.name` 与 `UserModulePortDraft.entity.displayName` 是两个可独立变化的值；BFN-IR 2.1 缺少保存前者的专用位置。2.2 只补充这个表示能力。

Batch 12.0.2 当前状态为 `ACTIVE`。本批不实现 draft materialization、authoring UI、Add to Network、Catalog registration、Ontology assignment、uncertainty runtime 或新的仿真语义。

当前项目标识为：

```text
schema = BFN-IR
schemaVersion = 2.2
```

BFN-SIM 保持 `BFN-SIM-2.0`。

## Port authoring metadata

2.2 为 `BfnPort` 增加一个可选结构：

```ts
interface BfnUserAuthoredPortMetadata {
  origin: 'user_defined';
  name: string;
}

interface BfnPort {
  id: string;
  displayName?: BfnLocalizedDisplayName;
  authoring?: BfnUserAuthoredPortMetadata;
  entity: string;
  quantityType: BfnQuantityType;
  unit: BfnUnit;
  direction: 'input' | 'output';
}
```

`authoring.name` 保存用户输入的端口角色名称。结构校验要求 `name.trim().length > 0`，保存和迁移不执行 trim、翻译、大小写归一或科学身份推断。内置、Demo 与 Catalog Port 可以不提供 `authoring`。

## 四类独立语义

| 概念                 | 权威字段                              | 示例                       |
| -------------------- | ------------------------------------- | -------------------------- |
| Port authoring label | `port.authoring.name`                 | `Inducer input`            |
| Entity identity      | `port.entity`                         | `entity.user.inducer-x`    |
| Entity display label | `registry.entities[].displayName`     | `Inducer X`                |
| 本地化 Port 展示     | `port.displayName.en` / `.zh`（可选） | Catalog 或应用提供的双语名 |

这些字段不互相派生。以下对象可以无损往返，且不需要复制本地化文本：

```json
{
  "port": {
    "id": "port.user.inducer-input",
    "authoring": { "origin": "user_defined", "name": "Inducer input" },
    "entity": "entity.user.inducer-x",
    "quantityType": "concentration",
    "unit": "nM",
    "direction": "input"
  },
  "entity": {
    "id": "entity.user.inducer-x",
    "origin": "user_defined",
    "displayName": "Inducer X",
    "description": null
  }
}
```

## 中央迁移

`src/features/bfn/bfnIrMigration.ts` 继续作为唯一升级入口，接受合法 BFN-IR 2.0、2.1 与 2.2，并始终返回经验证的 2.2 深拷贝。

| 输入 | 迁移结果                                                  |
| ---- | --------------------------------------------------------- |
| 2.0  | 完整执行已经冻结的 2.0 → 2.1 保守迁移，再将版本提升为 2.2 |
| 2.1  | 只将版本提升为 2.2；所有 Port 保持没有 `authoring`        |
| 2.2  | 验证后返回深拷贝                                          |

迁移不从 localized `displayName`、Entity ID、Entity display label、quantity type、Port ID、module label 或 module authoring 推断端口名称。迁移保持 deterministic、idempotent、non-mutating；未知未来版本 fail closed。

## 计算、连接与持久化边界

- Port Compatibility 继续要求 `output → input`，科学兼容三元组保持 `P=(E,Q,U)`；Port authoring label、localized Port displayName 与 Entity display label 均不参与兼容性。
- Computation signature 排除 `port.authoring`。它继续包含 Port `id`、`entity`、`quantityType`、`unit` 与 `direction`。
- Edge 继续执行 instantaneous、lossless、identity propagation，`mapping` 保持 `identity`。
- IndexedDB 与 localStorage Draft/Version 读取继续调用中央迁移。2.0 与 2.1 历史对象暴露为 2.2 copy；读取 Version 不改写底层不可变 snapshot。
- Workspace IndexedDB structural version 保持 `1`；object store、index 和既有 storage key 均不改变。
- Receiver evaluator、Sender admission、Inverse Design、Ontology、Temporal policy、Simulation equations 与 BFN-SIM result contract 均不改变。

## 冻结草案逐字段表示审计

本审计按 Batch 12.0 已冻结、供 Batch 12.1 使用的静态单输出范围判断表示能力。`LOSSLESS NOW` 表示 BFN-IR 2.2 已有一一对应的持久化结构，不表示 materialization 或 UI 已在本批实现。

### Module — LOSSLESS NOW

- `id` → `BfnFunctionalModule.id`；
- `origin` → `module.authoring.origin`；
- `name` → `module.authoring.name`，逐字保存；
- `description` → `module.authoring.description`，逐字或 `null` 保存。

### Ports — LOSSLESS NOW

- `id` → `BfnPort.id`；
- `name` → `BfnPort.authoring.name`，逐字保存；
- `entity.id` → `BfnPort.entity`；
- `entity.displayName` → `BfnRegistry.entities[].displayName`；
- `quantityType`、`unit`、`direction` → 同名 Port 科学字段；
- input/output 归属 → `inputPorts` / `outputPorts`。

### Model — LOSSLESS NOW

- `family` → `BfnStaticModel.family`；
- `inputPortIds` → Hill/linear response 的 `inputPortId` 或 independent term 的 `inputPortId`；
- `outputPortIds` → 冻结合同要求恰好一个输出，其 ID 保存在唯一 `outputPorts` 成员中，模型输出绑定由该唯一端口确定；
- `parameters` → `BfnParameterEstimate`，包括 `value`、`unit` 与可选 `interval95`；
- `terms` → `BfnIndependentInputTerm`，其中 mode/weight 分别映射为 `direction`/`contribution`；
- `aggregation` → independent response `aggregation`；
- `interactionAssumption` → `independent_unverified`；
- 冻结的 Hill、同单位 linear transfer 与 independent-input 范围都有对应结构。

### Validity domains — LOSSLESS NOW

每个 `portId`、`minimum`、`maximum` 与 `unit` 映射到 `BfnValidityDomain.inputRanges`；Context 未记录时 `contextId` 可以为 `null`。

### Context — LOSSLESS NOW

- `not_recorded` → 显式 not-recorded/nullable Context 表示与 nullable model/domain Context reference；
- `defined` → `recorded` 或 `partial` documentation state；
- `hostSpecies`、`hostStrain`、`medium`、`temperatureCelsius`、`ph` → Context 的 host、strain、medium、temperature 与 pH 字段；
- 草案未提供的其他 Context 事实保持 `null`，不创建占位文本。

### Uncertainty — LOSSLESS NOW

- `not_recorded` → `uncertaintyMethod = not_recorded`；
- `none` → `uncertaintyMethod = none`；
- 已报告的 `parameter_interval_envelope` → 同名方法，参数 `interval95` 保存在各参数估计中。

### Evidence — LOSSLESS NOW

- `basis` → module/model `evidenceGrade`；
- `provenance` → `registry.provenanceRecords` 与 model/implementation `provenanceIds`；
- Dataset 引用继续通过独立的 `sourceDatasetIds` 表达。

### Implementation — LOSSLESS NOW

- `state` → `BfnFunctionalModule.implementationState`；
- `implementationIds` → `BfnFunctionalModule.implementationIds`；
- 被引用实现的 maturity 与 provenance 可在 `BfnBiologicalImplementation` 中独立保存。

审计结果：冻结草案的全部 mandatory Batch 12.1 字段均为 `LOSSLESS NOW`。Batch 12.1 保持 `PLANNED`，本批不启动其 materialization、runtime 或 UI 工作。
