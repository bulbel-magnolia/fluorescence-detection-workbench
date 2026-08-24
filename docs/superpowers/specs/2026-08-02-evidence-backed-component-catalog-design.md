# 有证据元件库与网络设计候选卡规格

**日期：** 2026-08-02
**状态：** 已批准设计，待实施
**适用端：** Windows 荧光检测工作台的 BIO-NET 网络设计页
**目录版本：** `evidence-backed-components@2026-08-02.1`

## 1. 目标与边界

本规格为 BIO-NET 建立一个独立、可审计、可版本化的有证据生物元件候选库。当前 `src/features/modeling/partLibrary.ts` 保留为演示部件库；有证据候选库不覆盖演示参数，也不把文献数据写入演示仿真引擎。

首批目录固定为 27 个审核候选，分成 5 个 QS 系统、9 个污染物传感系统和 13 个控制/输出元件或家族。每个候选首先是一张有来源的候选卡，不能被描述为团队已验证、可直接下单、可直接装配或已获得实验结果。目录记录中的 `reviewStatus: "passed"` 只表示资料足以进入软件候选卡，不表示团队实验通过。

本规格不改变 BLE、检测记录、背景校正、浓度换算、质量评价或当前 `BIONET-SIM-DEMO-0.2` 的科学边界。文献中的 EC50、Hill 系数、LOD、动态范围、折叠变化和响应时间只作为带来源和实验上下文的观察值保存；它们不能自动转成模型 edge weight、节点 `km`、`hill`、`gain` 或阈值。

## 2. 首批 27 个审核候选

清单是目录的固定契约。新增条目需要新的目录版本和单独评审，不能在本版本中替换、拆分或合并条目。条目的实体粒度在表中明确；“家族”或“系统”不是一条可直接订购的单一 DNA 序列。

### 2.1 QS 系统（5 个）

| 稳定 ID | 系统/别名 | 实体粒度 | 主要角色与信号边界 |
| --- | --- | --- | --- |
| `qs.cin` | CinI/CinR–pCin | `system` | AHL 产生、受体感知和 pCin 响应；具体 AHL 链长与启动子序列逐值引用来源，未核实字段为 `unknown`。 |
| `qs.tra` | TraI/TraR–pTra | `system` | AHL 产生与 TraR 依赖的转录激活；信号、宿主和载体按来源上下文记录。 |
| `qs.rhl` | RhlI/RhlR–pRhl | `system` | RhlI 产生信号、RhlR 感知并激活 pRhl；天然信号与交叉反应谱单独记录。 |
| `qs.esa` | EsaI/EsaR–PesaR/PesaS | `system` | EsaR 的 PesaR 去抑制与 PesaS 激活两种调控架构；AHL 依赖方向按来源分别记录，不能合并成固定作用方向。 |
| `qs.aub` | AubI/AubR–pAub | `system` | Aub 系统的信号产生、受体和响应启动子；具体配体、宿主和序列状态以原始来源为准。 |

### 2.2 污染物传感系统（9 个）

| 稳定 ID | 系统/别名 | 实体粒度 | 主要目标或输入 | 评审约束 |
| --- | --- | --- | --- | --- |
| `sensor.cadr` | CadR 模块 | `system` | 镉相关输入（以来源定义的配体与选择性为准） | 必须从原始论文补充资料精确抽取最佳同源物、调控启动子和序列状态；不能误写成 *S. aureus* CadC/PcadA。 |
| `sensor.chrb` | ChrB/Pchr | `system` | 铬酸根/铬相关输入 | 记录调控方向、离子价态、宿主和 promoter 版本，不能把名称推断为一个通用 ChrB 序列。 |
| `sensor.merr` | MerR/Pmer | `system` | 汞相关输入 | 记录金属种类、响应启动子和来源菌株；不同 MerR 同源物分开作为后续版本。 |
| `sensor.cuer` | CueR/PcopA | `system` | 铜相关输入 | 记录 CueR 同源物、PcopA 架构、配体选择性和宿主背景。 |
| `sensor.narx-narl` | NarX/NarL/Pnar | `system` | 硝酸盐/亚硝酸盐相关输入 | NarX 感知、NarL 调控和 promoter 版本必须作为同一来源上下文保存。 |
| `sensor.nahr` | NahR/Psal | `system` | 水杨酸或相关芳香化合物输入 | 记录 Psal 的具体构型和配体范围；不能把文献中的单一 EC50 当成项目权重。 |
| `sensor.xyls` | XylS/Pm | `system` | 芳香污染物或其代理输入 | 记录 XylS 同源物、Pm 版本、诱导物和宿主；“芳香物”不等于所有污染物。 |
| `sensor.dmpr` | DmpR/Po | `system` | 酚/芳香化合物输入 | 记录 DmpR 的激活物、Po promoter 版本及是否需要辅助调控。 |
| `sensor.phnr` | PhnR/PphnA | `system` | 膦酸乙酸（phosphonoacetate）相关输入 | 记录调控方向、磷源条件和宿主；缺少直接定量值时保留 `unknown`。 |

### 2.3 控制/输出元件或家族（13 个）

| 稳定 ID | 元件/家族 | 实体粒度 | 主要角色 |
| --- | --- | --- | --- |
| `control.mutalik-bcd-library` | Mutalik BCD translation-initiation library | `library` | 连续翻译起始调节；库成员不是一条通用 RBS。 |
| `control.anderson-j231-library` | Anderson BBa_J23100–BBa_J23119 | `library` | 组成型 σ70 转录强度家族；每个成员的测量上下文独立保存。 |
| `control.phlf` | PhlF | `part` | TetR 家族负调控器，适用于 NOT/NOR 等控制关系。 |
| `control.srpr` | SrpR | `part` | 正交负调控器；响应启动子与 repressor 必须成对记录。 |
| `control.bm3r1` | BM3R1 | `part` | 正交负调控器；逻辑功能不能脱离其 promoter/operator 架构。 |
| `control.qacr` | QacR | `part` | 正交负调控器；诱导物、operator 和宿主条件单独记录。 |
| `control.amtr` | AmtR | `part` | 正交负调控器；氮/培养条件可能影响观察值。 |
| `control.star` | STAR small transcription-activating RNA family | `family` | RNA 转录激活器；具体 STAR 序列与 terminator 架构单独建卡。 |
| `control.toehold-switch` | Toehold switch family | `family` | trigger RNA 控制翻译；开关和 trigger 是一对设计对象。 |
| `control.ssra-asv-aav-family` | ssrA ASV/AAV degradation-tag family | `family` | 利用蛋白酶降解调节输出时间常数；标签不能代表所有蛋白的同一半衰期。 |
| `control.riboj` | RiboJ 5′-UTR insulator | `part` | 通过自切核酶降低上下文效应；不是一个独立的传感器或 edge weight。 |
| `output.sfgfp` | sfGFP（不将 GFP-LVA 作为新条目） | `part` | 荧光输出报告；成熟、折叠和降解信息按 E. coli 条件记录。 |
| `output.mneongreen` | mNeonGreen | `part` | 高亮荧光输出报告；N 端和 mRNA 结构优化是上下文的一部分。 |

## 3. 规范数据模型

### 3.1 JSON 组织

有证据候选库使用静态、可审阅的 canonical JSON，不依赖网络服务。三类数据分开存放，便于并行评审和避免不同子代理写入同一个文件：

```text
src/features/modeling/catalog/
├─ catalogManifest.json
├─ qsSystems.json
├─ pollutantSensors.json
└─ controlOutputParts.json
```

四个文件共同组成 `evidence-backed-components@2026-08-02.1`。Manifest 只保存 schema 版本、目录版本、类别计数、生成时间和数据文件名；三类 JSON 各保存同一版本字段和 `entries` 数组。JSON 只包含来源已经支持的内容，未知内容必须使用统一的 unknown 表达，不能用空字符串、虚构序列或看似精确的默认数值掩盖缺失。

### 3.2 未知值约定

TypeScript schema 定义 `Known<T> | UnknownValue`：

```ts
type UnknownValue = {
  state: 'unknown';
  reason?: string;
};

type Known<T> = {
  state: 'known';
  value: T;
};

type CatalogValue<T> = Known<T> | UnknownValue;
```

数组字段在确实没有任何记录时使用 `{ state: 'unknown' }`，而不是把“没有发现”和“来源明确为空”混为一谈。Loader 必须保留 unknown；UI 显示“未知 / Unknown”及原因。`null`、空白字符串、`0` 不能作为未知值的替代。

### 3.3 `CatalogEntry` 必填字段

Loader 的手写 type guard 负责检查以下结构；不引入运行时 schema 新依赖。

```ts
type CatalogEntityType = 'part' | 'device' | 'system' | 'library' | 'family';
type CatalogCategory = 'qs-system' | 'pollutant-sensor' | 'control-output';
type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'unknown';
type ReviewStatus = 'passed' | 'needs-review' | 'withdrawn';
type SequenceStatus =
  | 'available-public-accession'
  | 'partial-public'
  | 'not-reported'
  | 'restricted'
  | 'unknown';
type ModelingCompatibility =
  | 'qualitative-only'
  | 'parameterizable-after-calibration'
  | 'normalized-demo-only'
  | 'not-compatible'
  | 'unknown';
type EffectDirection = 'positive' | 'negative' | 'mixed' | 'unknown';
```

每个 `CatalogEntry` 必须包含：

- `id`：小写、稳定、全局唯一的 ID；不得因中英文名称切换而变化。
- `catalogId` 与 `catalogVersion`：必须与 Manifest 一致。
- `entityType`：明确是 `part`、`device`、`system`、`library` 或 `family`；`family` 表示一组需要具体成员/序列才能构建的候选。
- `name`：中文名、英文名和别名数组；别名用于搜索，不用于生成序列。
- `category` 与 `roles`：只能使用三类首批分类和受控角色词。
- `mechanism`：机制摘要、调控步骤和需要配对的部件；未知机制分段标记。
- `signals`：`inputs`、`outputs`、信号分子或调控量、作用方向、单位和是否为直接观测。单一系统可有多个输入/输出。
- `context`：宿主物种、菌株、载体/复制子、培养基、温度、诱导条件、生长阶段、测量读出和其他实验上下文；每个未知子字段显式标记。
- `evidence`：`grade`、`reviewStatus`、证据范围、是否直接在 E. coli 观察、评审记录和边界说明。
- `literature`：一条或多条可追溯引用，至少包含作者/年份或数据库名称、DOI/PMID/稳定 URL 中的可用项、来源类型和关联字段。
- `quantitativeObservations`：逐值保存指标、数值/单位或 unknown、来源引用 ID、实验上下文快照、原文语义、可迁移性说明和是否可用于当前演示模型。每个已知数值必须有来源和上下文。
- `sequence`：序列状态、accession/Registry/Addgene/NCBI 等外部 ID、序列类型、版本、方向、来源引用和是否为完整序列。缺失时为 `unknown`，不得按家族名称推导序列。
- `modeling`：`compatibility`、允许的模型表示、可展示的信号映射、禁止自动映射的字段、需实测的参数和校准要求。
- `curation`：目录版本、评审日期、评审角色、变更说明和撤回原因（如适用）。

节点侧的文献候选引用与现有演示节点数据保持独立。`ModelNode.part` 继续使用现有 schemaVersion 1 结构和行为；它不承载目录字段，也不因候选引用而被替换。目录引用使用单独的可选 sibling 字段：

```ts
type LiteratureCandidateReference = {
  catalogId: string;
  catalogVersion: string;
  entryId: string;
  displayNameSnapshot: string;
  sourceStatus?: ReviewStatus;
  boundaryNote?: string;
};

type ModelNodeCatalogFields = {
  catalogReference?: LiteratureCandidateReference;
};
```

实现时将 `ModelNodeCatalogFields` 合并到现有 `ModelNode`，不改变 `part`、`parameters` 或其他既有字段的类型。

### 3.4 定量观察与模型边界

定量观察使用以下语义：

```ts
type QuantitativeObservation = {
  metric: string;
  value: CatalogValue<number>;
  unit: CatalogValue<string>;
  sourceRef: string;
  context: {
    host: CatalogValue<string>;
    strain: CatalogValue<string>;
    vector: CatalogValue<string>;
    culture: CatalogValue<string>;
  };
  originalMeaning: string;
  transferability: string;
};
```

具体记录的 `sourceRef` 必须对应目录中的实际文献引用；`unit` 只有来源明确时才使用 known，无法确认的数值、单位或上下文使用 `CatalogValue` 的 unknown 分支。首批 JSON 不得填入没有核实的数字。Loader 和 UI 必须将以下三层区分开：

1. **来源观察值**：文献在特定宿主、构型、培养条件下的结果。
2. **候选卡展示值**：对来源观察值的忠实转录和单位说明。
3. **模型运行值**：当前节点已有的演示参数，或后续经项目底盘校准后另行版本化的参数。

应用候选卡时只写入版本化引用，不复制 `quantitativeObservations` 到节点参数。尤其不允许将 EC50、Hill、LOD 或 fold change 直接写成连接权重或阈值。家族/系统条目不产生一条默认 DNA 序列；需要具体构建时必须另建具体序列条目并重新审核。

## 4. Loader、索引与校验

### 4.1 文件边界

计划新增以下文件；本规格本身不修改这些文件：

```text
src/features/modeling/catalog/catalogManifest.json
src/features/modeling/catalog/qsSystems.json
src/features/modeling/catalog/pollutantSensors.json
src/features/modeling/catalog/controlOutputParts.json
src/features/modeling/catalog/catalogTypes.ts
src/features/modeling/catalog/catalogValidator.ts
src/features/modeling/catalog/catalogLoader.ts
src/features/modeling/catalog/catalogIndex.ts
src/features/modeling/catalog/catalogIndex.test.ts
```

`catalogTypes.ts` 定义类型、受控枚举和 unknown 联合；`catalogManifest.json` 固化 schema、目录版本和计数契约；`catalogValidator.ts` 负责字段、来源上下文和清单约束；`catalogIndex.test.ts` 先提供 schema/validator 测试骨架。上述契约和测试骨架必须在三类数据编写前建立。三类 JSON 可由不同实施代理独立维护；数据通过 validator 后，再完善 `catalogLoader.ts` 和 `catalogIndex.ts` 的解析、合并及索引。Loader 不生成默认参数，不访问网络，不对序列做推断。

### 4.2 必须拒绝的输入

- Manifest 版本与任一分类文件不一致；
- 三类计数不是 5、9、13，合计不是 27；
- ID 重复、分类不符或出现首批清单之外的条目；
- 缺少名称、实体粒度、证据、来源引用、序列状态或建模兼容性字段；
- 已知定量值缺少 `sourceRef`、单位或实验上下文；
- 序列状态为公开可用却没有可追溯 accession/Registry 等标识；
- 家族/系统条目声称是完整单一序列；
- 将 `quantitativeObservations` 映射为 `weight`、`km`、`hill`、`gain` 或阈值的载荷。

未识别的未来字段可以保留并忽略；核心字段结构错误应使有证据候选索引进入不可用状态，而不是静默修正。错误显示翻译后的原因和下一步，开发日志记录字段路径。演示部件索引继续可用。

### 4.3 降级与版本处理

- 静态 JSON 解析或校验失败：显示“文献元件库暂不可用 / Evidence-backed catalog unavailable”，保留当前模型和演示部件，不清空用户数据。
- 当前目录版本不支持：详情显示只读的版本信息，禁止从该卡写入新引用；已有模型引用保留原 ID、版本和节点数值。
- 旧模型没有 `catalogReference` 字段：按现有 `partLibrary.ts` 的部件 ID 读取为演示部件，不进行候选推断，不改写 `part`、节点参数、位置、连接、`enabled` 或 `outputNodeId`。
- 旧模型含未知目录 ID：显示“历史引用不可用 / Historical reference unavailable”，仍保留该 ID、版本、名称快照和数值参数，允许用户移除引用后重新选择。
- 某一条目缺少可选来源数值：显示 unknown，不阻止浏览；缺少必填来源和实体粒度则该条目不通过 Loader。

## 5. 网络设计页交互

### 5.1 元件库入口与浏览

网络设计页工具栏新增“文献元件库 / Evidence-backed library”入口，与现有“演示部件 / Demo parts”入口并列。入口打开可键盘操作的侧栏或对话框，默认显示候选总数和目录版本。

浏览功能必须支持：

- 按稳定 ID、中文名、英文名、别名、污染物名称、QS 信号和文献标识搜索；
- 按类别（QS、污染物传感、控制/输出）、实体粒度、宿主/菌株、证据等级、序列状态和建模兼容性筛选；
- 显示当前筛选条件、结果数量、无结果原因和清除筛选操作；
- 详情页展示机制、输入/输出信号、方向、宿主/载体/培养条件、证据边界、逐值观察、来源链接、序列状态/accession 和建模兼容性；
- unknown 使用文本标签和原因，不用空白或颜色暗示“未验证”；
- 详情提供“作为文献候选附加 / Attach literature candidate”操作，仅对可读、`reviewStatus: passed` 的卡片开放。

### 5.2 节点选择器与应用规则

节点选择器分成两个明确分区：

1. **演示部件 / Demo parts**：继续使用 `partLibrary.ts` 的示意参数。`ModelNode.part` 的现有结构和行为保持不变；应用演示部件可以按当前规则替换同类型参数，并保留节点 ID、位置、连接和输出选择。
2. **文献候选 / Literature candidates**：只在节点上新增独立的 `catalogReference?: LiteratureCandidateReference`，保存 `{ catalogId, catalogVersion, entryId, displayNameSnapshot }` 等版本化引用，以及来源状态和边界说明。一个节点可以同时保留演示 `part` 与文献候选引用。附加只新增 `catalogReference`，取消附加只删除该字段；两种操作都不得改写 `part`、`parameters`、节点 `id`、`x/y`、边列表、边 `weight`、`enabled` 或 `outputNodeId`。

文献候选详情可以展示来源中的 EC50、Hill、LOD 等观察值，但必须标为“来源上下文观察 / Source-context observation”，并显示“不会自动成为模型参数 / Not applied as model parameter”。用户若要进行示意仿真，继续直接编辑节点现有归一化参数；若要导入实测参数，需另行建立算法/校准版本，不属于本规格。

`ModelNode.part` 不扩展目录字段，继续保留现有 schemaVersion 1 的 `id`、`sourceKey`、`evidenceStatus` 及其行为。目录候选只通过同级的可选 `catalogReference?: LiteratureCandidateReference` 保存；旧字段缺失时按照旧数据规则处理，不得依赖 `as` 断言把旧记录强制当作新候选。

## 6. 数据流与状态变化

```text
四个静态 JSON
  → catalogValidator / catalogLoader type guard
  → ID/别名/引用索引
  → 网络设计页搜索与筛选
  → 候选详情与证据边界
  → 仅新增或删除版本化 `catalogReference`
  → 不可变更新当前 NetworkModel
  → 保留 `ModelNode.part`、`parameters`、`id`、位置、边列表、边 `weight`、`enabled`、`outputNodeId`
  → modelingRepository 保存项目/运行快照
```

候选附加只在目标节点新增 `catalogReference`，取消附加只删除该字段；两者都保持 `ModelNode.part`、`parameters`、节点 `id`、位置、边列表、边 `weight`、`enabled` 和 `outputNodeId` 不变。附加、取消附加、旧引用不可用、目录不可用和版本不支持都写入现有会话追溯事件；事件记录对象 ID、目录版本、结果和错误类别，不写入完整序列或私有数据。运行快照保存当时的候选引用快照，但不把文献数值复制成运行参数。检测历史仍保持 `reference-only`。

## 7. 证据与审阅规则

证据等级沿用统一定义：

- **A**：有可追溯序列/构型和 E. coli 直接定量观察；
- **B**：有 E. coli 功能或构建证据，但定量上下文不完整；
- **C**：其他底盘、间接迁移或只提供部分序列/功能证据；
- **D**：预测、二手汇总或仅设计推断；
- **unknown**：当前来源不足以分级。

`passed` 评审只检查候选卡是否可追溯、字段是否完整、边界是否清楚。它不表示：

- BIT-CHINA 团队在当前菌株和载体中完成实验；
- 序列已由团队合成、测序或验证；
- 文献的动态范围、EC50、Hill、LOD 可直接用于项目模型；
- 候选可直接用于环境释放、诊断、监管检测或工程构建。

CadR 条目是首批特别审查对象：实施时必须回到原始论文 SI，记录最佳同源物、调控启动子、物种/菌株和序列 accession；任何无法确认的字段写 `unknown`，不使用名称相近的 *S. aureus* CadC/PcadA 代替。

## 8. 旧数据兼容与持久化

现有 `fluorescence-desktop.modeling-project.v1`、`fluorescence-desktop.modeling-runs.v1` 和 schemaVersion 1 的模型继续可读。实施时：

1. Loader 先读取旧 `nodes[].part` 结构，再读取同级可选 `nodes[].catalogReference` 字段；
2. 旧演示部件按原 ID 显示，数字参数保持原值；
3. 文献候选引用作为 `catalogReference` 可选元数据保存，不要求升级整个模型 schema；一个节点可以同时保留演示 `part` 和该引用；
4. 运行快照复制候选引用和名称快照，保证目录更新后历史记录仍可解释；
5. 导入失败只拒绝无效目录引用，不能删除节点、边、阈值或检测记录引用；
6. 保存时不自动把文献观察值写入参数，也不把旧演示部件升级成有证据候选；附加/取消附加不能改变 `part`、`parameters`、节点 `id`、位置、边列表、边 `weight`、`enabled` 或 `outputNodeId`。

## 9. 中英文文案与可访问性

新增用户可见文字全部进入 `src/i18n/locales/zh-CN.ts` 和 `src/i18n/locales/en-US.ts`，包括入口、类别、实体粒度、证据等级、序列状态、unknown、版本不支持、库不可用、候选附加成功/失败和“仅来源卡片，不代表团队验证”等说明。文案键按语义命名，不在组件中硬编码中英文。

交互要求：

- 入口、搜索、筛选、关闭、清除条件和附加操作可用键盘完成；
- 打开侧栏后焦点进入标题或搜索框，`Escape` 关闭并归还入口焦点；
- 结果卡和详情使用语义标题、表头、`aria-label` 和可见焦点；
- 证据、序列状态和作用方向同时使用文字、图标和颜色，不依赖颜色单独传达；
- unknown、错误和版本状态具有足够对比度；
- 中英文切换后长名称、DOI/URL 和 accession 使用省略与可展开全文，不破坏布局；
- `prefers-reduced-motion` 下不使用依赖动画才能理解的候选状态。

## 10. 测试与验收

### 10.1 单元测试

- 三类 JSON 的 type guard、unknown 联合和 Manifest 版本检查；
- 固定计数 5 + 9 + 13 = 27、ID 唯一性和三类清单完整性；
- CadR 的审查约束不会接受 S. aureus CadC/PcadA 替代值；
- 定量值缺来源、单位或上下文时拒绝；家族/系统条目不得宣称单一序列；
- 搜索别名、类别/宿主/证据/序列状态/实体粒度筛选和空结果；
- 旧 schemaVersion 1 模型读取；未知目录 ID 与目录缺失时保留原始字段；
- 附加 literature candidate 只新增 `catalogReference`；取消附加只删除该字段；前后深度比较 `ModelNode.part`、`parameters`、节点 `id`、位置、边列表、边 `weight`、`enabled` 和 `outputNodeId` 均完全相同；
- 一个节点同时持有演示 `part` 与 `catalogReference` 时，两者可独立读取、保存和清除；
- 应用 demo part 继续满足现有同类型兼容和示意参数行为；
- 运行快照和模型导入导出保留候选引用版本。

### 10.2 组件与人工检查

- 网络设计页入口、详情、附加/取消附加和错误降级；
- 中文/英文完整巡检、长名称和 DOI/URL 展示；
- 键盘焦点、Esc、屏幕阅读器标签、对比度和减少动态效果；
- 目录 JSON 解析失败时演示部件和当前模型仍可用；
- 旧本机模型、旧运行记录和带检测引用的模型均不丢失数据。

### 10.3 工程验收标准

1. Loader 仅接受目录版本一致、字段完整且计数为 5/9/13 的首批 27 条目。
2. UI 可从网络设计页进入文献元件库，完成搜索、类别/宿主/证据/序列状态筛选和详情查看。
3. 27 条目均显示实体粒度；家族和系统没有被当作单一序列。
4. 每个 `passed` 候选至少有可追溯引用；未知值显示 unknown 及原因。
5. Literature candidate 应用只新增版本化 `catalogReference`，取消应用只删除该字段；不改写 `ModelNode.part`、节点数值参数、位置、连接、边权重、`enabled` 或 `outputNodeId`。
6. 文献 EC50、Hill、LOD、动态范围等值不会进入 edge weight 或演示仿真参数。
7. 旧模型和旧本机数据可读取，未知引用可保留并给出降级说明。
8. 中英文文案、键盘操作、非颜色状态表达和 reduced-motion 检查通过。
9. 相关单元/组件测试、TypeScript 检查、Lint、项目测试和 Windows 构建按仓库实际脚本运行并记录结果。

## 11. 单一实施计划与文件边界

实施按 schema-first 的单一计划顺序推进，同时保持三类数据文件可并行评审：

1. **Schema/契约与测试骨架**：先新增 `catalogTypes.ts`、`catalogManifest.json` 的 schema/版本/计数契约、受控枚举、`catalogValidator.ts` 和 `catalogIndex.test.ts` 测试骨架；先锁定 unknown、来源上下文和 27 条目校验规则，不等待数据稳定。
2. **三类 JSON 并行编写**：由三名代理分别完成 `qsSystems.json`、`pollutantSensors.json`、`controlOutputParts.json`；每个代理只修改自己负责的 JSON，所有已知值逐值绑定来源，CadR 先完成 SI 精确抽取。Manifest 的实际计数由维护者依据 validator 结果更新。
3. **Loader 与索引**：三类 JSON 通过 validator 后，完善 `catalogLoader.ts` 和 `catalogIndex.ts`，执行解析、合并、ID/别名/引用索引和只读目录构建；不生成默认参数、不访问网络、不推断序列。
4. **模型适配**：在 `types.ts`、`partLibrary.ts`、`modelingCore.ts`、`modelingRepository.ts` 中加入同级可选 `catalogReference` 和旧数据迁移；`ModelNode.part` 与演示部件行为保持原样，附加/取消附加只增删 `catalogReference`，不改 `part`、`parameters`、节点 ID、位置、边、边权重、`enabled` 或 `outputNodeId`。该阶段不写 JSON。
5. **浏览与选择器**：在 `ModelingPage.tsx` 及其组件中接入索引、搜索、筛选、详情和候选附加；仅增删版本化 `catalogReference`，不改仿真公式。新增中英文键集中写入两个 locale 文件，避免多个代理同时修改同一个 locale 段。
6. **文档与验证**：更新 `README.md`、`docs/modeling.md`、`docs/testing.md`，运行目录、兼容性、可访问性和构建测试。每个阶段提交前执行 `git diff --check`，检查是否混入序列、个人数据、构建产物或无来源参数。

本规格实施不引入新的运行时依赖、不创建云端同步接口、不读取实验室私有数据库；所有有证据候选数据在代码审阅中以静态 JSON 版本化。

## 12. 非目标

- 不把 27 条目扩展为未经评审的推荐市场或采购清单；
- 不生成 DNA 序列、引物、质粒图、装配方案或实验步骤；
- 不把文献定量值自动映射到当前演示模型或真实 HC-08D 信号；
- 不宣称候选已在 BIT-CHINA 底盘、菌株、载体或培养条件下验证；
- 不修改 BLE 协议、检测记录科学边界、背景校正、浓度公式或质量阈值；
- 不引入自动化 Cello 编译、实验配方优化、云端模型训练或生物安全审批流程；
- 不删除、覆盖或静默迁移旧模型、旧运行快照和旧本机数据。
