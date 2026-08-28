# BFN 生物功能语义本体

## Purpose

BFN-ONTOLOGY-1.0 是 BIO-NET 的独立、版本化、可审计语义覆盖层。它回答模块在网络中承担什么生物功能，以及其生物实现属于什么广义类别。语义信息在运行时从精确软件身份解析，不写入 BFN-IR、工作区快照或运行结果。

Ontology describes what an object is categorized as; it does not grant evidence, runtime, compatibility, or construction status.

本体描述对象被归入什么类别；它不授予证据等级、运行资格、兼容性或构建状态。

## Four semantic dimensions

| 维度                          | 回答的问题                         | 当前权威来源                               |
| ----------------------------- | ---------------------------------- | ------------------------------------------ |
| Functional Family             | 模块在网络中做什么                 | BFN-ONTOLOGY-1.0 assignment                |
| Biological Component Family   | 生物实现属于什么广义类别           | BFN-ONTOLOGY-1.0 assignment                |
| Mathematical Model Family     | 数学上如何计算                     | 既有 `BfnModelFamily` 与 `BfnModelVariant` |
| Runtime / Evidence Capability | 当前能否运行、证据和构建边界是什么 | 冻结 Catalog、BFN 可信运行合同与证据字段   |

四个维度可以独立变化。`hill_activation`、`linear_transfer`、`independent_inputs` 和 `first_order` 是数学模型族；static、dynamic 是模型能力；runtime-demo 是目录使用状态；literature 是来源性质。它们都不是功能本体术语。

既有 `BfnCatalogModuleSummary.familyKey` 继续表示 model-family presentation。Batch 9.0 + 9.1 不扩大范围重命名该字段，它不表示新的 Functional Family。

## Ontology version and registry

第一版 manifest 固定为：

```text
schema  = BFN-ONTOLOGY
version = 1.0
id      = bfn-semantic-ontology
```

Registry、术语、双语名称、双语描述和 assignment 均深冻结。术语按稳定 ID 排序；assignment 按 `subjectType → subjectId → ontologyId` 排序，不使用本地化名称排序。V1 保留 `parentId`，当前全部为 `null`。校验器拒绝错误 manifest、重复术语、缺失父级、跨 kind 父级、父级环、未知 assignment term、重复 assignment、空 subject ID、错误 basis、非稳定顺序和当前对象的错误类别基数。

## Functional Families

| Stable ID                            | English                 | 中文           | V1 当前实例                       |
| ------------------------------------ | ----------------------- | -------------- | --------------------------------- |
| `functional.signal_response`         | Signal response         | 信号响应       | Catalog receiver、内置 AHL Sensor |
| `functional.signal_production`       | Signal production       | 信号产生       | Catalog sender                    |
| `functional.expression_transfer`     | Expression transfer     | 表达响应       | 内置 Reporter                     |
| `functional.multi_input_integration` | Multi-input integration | 多输入整合     | 内置 Dual Input                   |
| `functional.molecular_conversion`    | Molecular conversion    | 分子转化       | 仅定义，当前无 assignment         |
| `functional.transport`               | Transport               | 运输与交换     | 仅定义，当前无 assignment         |
| `functional.binding_interaction`     | Binding interaction     | 结合与相互作用 | 仅定义，当前无 assignment         |
| `functional.degradation_clearance`   | Degradation / clearance | 降解与清除     | 仅定义，当前无 assignment         |
| `functional.unclassified`            | Unclassified            | 未分类         | 未知模块的显式安全结果            |

Functional Family 只描述模块功能，不定义允许的下游类别、拓扑模板、图文法或端口兼容。连接仍严格依据实体、量类型和单位量纲。

## Biological Component Families

| Stable ID                    | English                          | 中文              |
| ---------------------------- | -------------------------------- | ----------------- |
| `bio.ahl_receiver_regulator` | AHL receiver / regulatory system | AHL 接收/调控系统 |
| `bio.ahl_synthase`           | AHL synthase system              | AHL 合成系统      |
| `bio.reporter_system`        | Reporter system                  | 报告表达系统      |
| `bio.unclassified`           | Unclassified                     | 未分类            |

`bio.ahl_receiver_regulator` 和 `bio.ahl_synthase` 是当前 AHL/HSL Catalog scope 与 canonical role 支持的广义类别。它们不构成 LuxR、LuxI、同源性或系统发育家族声明。V1 不根据名称、别名、正则表达式或人工直觉建立更具体的生物家族。

## Assignment rules

Assignment subject 只有 `catalog_component` 与 `builtin_module`。来源 basis 只有 `canonical_field` 与 `curated`。

Catalog assignment 只读取可信 `ReleaseCatalogPresentation` 中由冻结 canonical component type 投影的 role：

| Canonical role | Functional                     | Biological                   | Basis             |
| -------------- | ------------------------------ | ---------------------------- | ----------------- |
| `receiver`     | `functional.signal_response`   | `bio.ahl_receiver_regulator` | `canonical_field` |
| `sender`       | `functional.signal_production` | `bio.ahl_synthase`           | `canonical_field` |

组件名称、别名、双语显示名、搜索词、response curve 和 port label 不参与 assignment。当前冻结 release 的全部 42 个 Component 由其真实 role 规则化生成 assignment；代码不把 42 写成永久业务上限。

内置模块使用显式 curated 表：

| Built-in ID       | Functional                           | Biological                   |
| ----------------- | ------------------------------------ | ---------------------------- |
| `ahl-sensor`      | `functional.signal_response`         | `bio.ahl_receiver_regulator` |
| `reporter`        | `functional.expression_transfer`     | `bio.reporter_system`        |
| `dual-input-gate` | `functional.multi_input_integration` | `bio.unclassified`           |

BFN-IR 当前不保存内置 template ID。解析器使用稳定 `labelKey` 到 Built-in ID 的窄范围 exact equality 映射；不使用 `includes`、`startsWith`、翻译文本或模型族推断。

## Resolver behavior

公共读取 API 包括：

```text
getBfnOntologyTerm(id)
listBfnOntologyTerms(kind)
resolveCatalogComponentSemanticProfile(componentId, presentation?)
resolveBuiltInModuleSemanticProfile(catalogModuleId)
resolveBfnModuleSemanticProfile(module)
```

Catalog-level resolver 默认加载 `loadReleaseCatalogPresentation()`，也接受测试注入。注入对象必须通过 `isTrustedReleaseCatalogPresentation()`；不可信 presentation 以 `catalog-presentation-untrusted` fail closed，精确 component ID 不存在时返回 typed `catalog-component-not-found` 错误。

已实例化 Catalog Module 优先从 active model、随后从可用 model 的结构化 `catalogReference.componentId` 解析。解析器不从 display name、curve、port 或 entity 反推 Component。没有 Catalog identity 时，解析器再尝试内置 `labelKey` 精确映射。

返回的 `BfnSemanticProfile` 深冻结，包含 functional terms、biological component terms、来源 assignments 与 classification status。两个维度都有具体类别时为 `classified`；只有一个维度具体分类时为 `partially-classified`；两个维度均回退时为 `unclassified`。

## Unclassified rule

普通模块既没有精确 Catalog reference，也没有已知内置 label key 时，解析器不抛错，显式返回 `functional.unclassified` 与 `bio.unclassified`。未知模块的 `displayName` 即使是 `LuxR Sensor`，数学模型即使是 `hill_activation`，也不会产生分类。未知对象没有审定 subject assignment，因此 profile 的 `assignments` 为空，两个 family 数组仍始终包含显式 fallback term。

Trust failure 与 unknown classification 不同：不可信 Catalog presentation 表示来源合同失效，必须 fail closed；普通未知模块只是尚无分类，是合法结果。

## Scientific boundaries

Classification is descriptive, not evidentiary. 所属类别不表示 runnable、validated、construction-ready、compatible、quantitatively supported 或 experimentally verified。

- Catalog sender 可分类为 signal production 与 AHL synthase，冻结 V1.1 的 sender output 仍为 0，不获得定量发送函数。
- Built-in Reporter 可分类为 expression transfer 与 reporter system，证据仍为 `mechanistic_model_only`。
- Built-in Dual Input 可分类为 multi-input integration，生物类别仍为 unclassified，`interactionAssumption` 仍为 `independent_unverified`；分类不升级为协同、AND gate 或 cooperative。
- AHL Sensor 的静态 Hill 与动态 first-order variant 共享 signal response 功能类别；模型模式不改变分类。

本体不授予运行资格、Add eligibility、兼容性或构建资格，也不生成推荐、自动拓扑或 connection validation 例外。

## BFN-IR, simulation, and workspace isolation

Batch 9.0 + 9.1 不向 `BfnFunctionalModule`、`BfnModelVariant`、`BfnCatalogModelReference`、Project、Version 或 Run snapshot 增加 ontology 字段。BFN-IR 保持 2.0，BFN-SIM 保持 2.0，Workspace IndexedDB 保持 v1。

语义解析是纯读取操作，不修改 Project、computation signature、Undo/Redo、Run 或 Workspace。Simulation、Catalog runtime candidate 和实例化路径不读取 Ontology；即使语义层不可用，既有可信计算路径仍保持独立。Registry 是内置版本化资源，不写 localStorage 或 IndexedDB。

## Deferred Batch 9.2

Catalog semantic presentation、Functional Family 筛选、Full Detail semantic labels、Module Inspector semantic profile、内置目录措辞清理、family-aware search、Ontology Browser、拓扑模板和 network-level inverse design 约束均延期到 Batch 9.2 或以后。Batch 9.0 + 9.1 没有可见 UI 变化。
