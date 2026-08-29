# BFN-IR 2.1 用户模块表示扩展

## 状态与目的

BFN-IR 2.1 是 Batch 12.0.1 的项目对象 schema。它只补齐 Batch 12.0 已审定的表示缺口，使项目能够如实保存用户定义来源、自由文本、项目自定义 Entity、缺失 Context、缺失 uncertainty、通用 provenance 和 implementation maturity。

本批不提供用户模块编辑器、materialization、Designed Sender、Signal Pool、新模型族、任意公式、动态自定义模块或可复用模块库。数学可执行性、Evidence basis 与 Implementation maturity 继续作为独立维度。

## Schema 变更

当前项目标识为：

```text
schema = BFN-IR
schemaVersion = 2.1
```

2.1 增加以下结构：

- `BfnFunctionalModule.authoring?`：显式保存 `origin = user_defined`、verbatim `name` 和 nullable verbatim `description`；内置模块与 Catalog 模块不补造该对象。
- `BfnRegistry.entities`：保存项目定义的 Entity ID、用户显示名和 nullable description。`BfnPort.entity` 继续保存稳定 ID；内置或 Catalog Entity 不要求复制到该 registry。
- `BfnContext.documentationState`：`recorded | partial | not_recorded`。全部科学事实字段允许以 `null` 表达真实缺失。
- `BfnModelVariantBase.contextId` 与 `BfnValidityDomain.contextId`：允许 `null`。输入有效范围不因 Context 缺失而删除。
- `BfnUncertaintyMethod`：在既有四种方法之外增加 `none | not_recorded`。
- `BfnRegistry.provenanceRecords`：通用 `dataset | publication | repository_record | user_note` 来源声明。
- `BfnModelVariantBase.provenanceIds`：引用通用 provenance；既有 `sourceDatasetIds` 保持独立。
- `BfnBiologicalImplementation.maturity`：`not_recorded | designed | candidate | reported | validated`，并增加 `provenanceIds`。
- `BfnFunctionalModule.implementationState`：在上述 maturity 之外增加 `unspecified`，明确区分没有实现引用与实现成熟度未记录。

`labelKey`、`descriptionKey` 和现有 localized display fields 为兼容既有界面而保留。它们不是用户自由文本的权威存储位置。

## Context 语义

Context 文档状态遵守以下约束：

- `not_recorded`：全部科学事实为 `null`；
- `partial`：至少记录一项科学事实，且 Host、Strain、Medium、Temperature 四项可比较事实中至少一项缺失；
- `recorded`：四项可比较事实均有明确值。该状态只表示项目记录中存在事实，不表示实验验证。

新 2.1 数据使用 `null` 表示缺失，不使用 `unknown`、`N/A`、`not recorded`、`unspecified` 或空字符串作为科学事实占位符。2.0 recorded Context 的既有文本在迁移中逐字保留，不被追溯解释或静默改写成 `null`；该兼容规则不会为新 partial/not-recorded Context 生成占位符。

Legacy placeholder text 可以为审计目的保留原始存储值，但不获得正向科学事实权威。Context Applicability projection 对文本执行 trim 后的 case-insensitive placeholder 判断，并将上述词值、空字符串与纯空白字符串投影为 `null`。因此 `unknown` 与 `unknown`、`N/A` 与 `N/A` 均为 missing-information comparison，结果是 `uncertain`，不会因为文字相同而得到 `matched`。

模型 `contextId = null` 时，Context Applicability 生成四项未知可比较事实，因此结果为 `uncertain`，不会伪造 `mismatched`。Partial Context 中已知且相等的事实可以匹配，缺失事实保持 uncertain，已知的 canonical 温度冲突仍为 mismatched。普通真实 reported text 继续沿用 Batch 10 规则；本批不扩大 canonicalization，也不增加同义词推断。Catalog-backed Receiver 继续从可信 Catalog reference 的精确 `parameterContextId` 解析 Context，不被项目用户 Context 覆盖。

## Uncertainty 语义

- `none`：作者明确声明没有提供 uncertainty model；
- `not_recorded`：项目没有记录 uncertainty 信息。

两者都不表示零不确定性。2.0 项目已有的 `parameter_interval_envelope`、`posterior_samples`、`bootstrap` 或 `covariance` 在迁移中原值保留。

## Provenance 语义

通用 provenance record 只表示项目提供了结构化来源声明。它不表示来源已经科学核实、获得 Catalog trust、构成充分证据或取得 runtime authorization。迁移不执行网络查询，也不从 Dataset、Port label、Catalog presentation 或自由文本推断来源。

`sourceDatasetIds` 继续专门引用项目 Dataset。DOI、出版物、仓库记录和用户笔记通过 `provenanceIds` 引用通用 registry；两类引用不互相替代。

## Implementation maturity

Module 与 implementation record 显式区分：

- `implementationIds = []` 对应 module `implementationState = unspecified`；
- 存在 legacy implementation reference 时迁移为 module `implementationState = not_recorded`；
- legacy implementation record 的 `maturity` 为 `not_recorded`，不会因记录存在而推断为 reported 或 validated。

未来的 designed、candidate、reported 和 validated 状态需要后续授权流程明确写入。BFN-IR 2.1 只提供无损表示能力。

## 2.0 → 2.1 中央迁移

`src/features/bfn/bfnIrMigration.ts` 是唯一的项目对象升级入口。迁移具备 deterministic、idempotent 和 non-mutating 性质，并执行以下保守映射：

| 2.0 字段或状态                     | 2.1 结果                                           |
| ---------------------------------- | -------------------------------------------------- |
| `schemaVersion = 2.0`              | `2.1`                                              |
| 无 Entity registry                 | `entities = []`                                    |
| 无通用 provenance registry         | `provenanceRecords = []`                           |
| 既有 Context                       | 保留全部事实，增加 `documentationState = recorded` |
| model/domain Context ID            | 原字符串保持不变                                   |
| model provenance                   | `provenanceIds = []`                               |
| model uncertainty                  | 原方法保持不变                                     |
| module authoring metadata          | 保持缺席                                           |
| 空 implementation IDs              | `implementationState = unspecified`                |
| 非空 implementation IDs            | `implementationState = not_recorded`               |
| implementation maturity/provenance | `not_recorded` / `[]`                              |

Parser/import 接受合法 BFN-IR 2.0 与 2.1，并始终返回经校验的 2.1 深拷贝。`2.2`、`3.0` 等未知版本 fail closed。新建、保存与导出的项目只产生 2.1。

## Workspace 迁移

IndexedDB 与 localStorage fallback 的 Draft 读取都经过同一中央迁移。旧 2.0 Version 在读取或恢复时暴露为迁移后的 2.1 copy；读取不会改写底层不可变历史 snapshot。恢复到 Current Draft 后保存的是 2.1。

本批没有新增 object store 或 index，因此 Workspace IndexedDB database version 保持 `1`。既有 storage key 名称也保持不变，以继续发现旧数据。

## 计算与兼容保证

- BFN-SIM 保持 `BFN-SIM-2.0`；
- Edge 继续执行 instantaneous、lossless、identity propagation；
- Port 合同继续为 `P = (E, Q, U)`，`production_rate → concentration` 继续 hard block；
- Receiver evaluator、Catalog trust、20 条 runnable Receiver 和 inverse-design 行为不变；
- Sender V1.2 继续为 53 条 evidence、0 admitted，Sender Runtime Admission 不变；
- Temporal policy、Ontology assignments 和仿真公式不变；
- 没有新增依赖或 Workspace 结构迁移。

Computation signature 继续包含实际科学事实、端口、网络、active model、参数、有效域与分析设置。项目的实际 `schemaVersion`、authoring metadata、Entity display metadata、provenance declarations、implementation maturity 和 `documentationState` 不进入签名；序列化结果保留 legacy 2.0 compatibility marker 与原 Context 属性顺序，使已持久化的 2.0 Run signature 和迁移后 2.1 项目精确一致。
