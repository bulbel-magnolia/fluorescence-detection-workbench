# 用户定义功能模块科学与计算合同

## 1. 状态与边界

本文定义 Batch 12.0 的 User-defined Functional Module Authoring Contract，并审计 BFN-IR 2.0 的无损表示能力。Batch 12.0 只交付合同、纯验证器、机器可读表示审计和测试：

- BFN-IR 保持 `2.0`；
- BFN-SIM 保持 `2.0`；
- Workspace IndexedDB 保持 `v1`；
- 不创建编辑器、表单、Drawer 或 Add to Network 入口；
- 不把 draft materialize 为项目对象；
- 不注册 Catalog、Demo、Ontology assignment、Run 或 Workspace record；
- 不修改仿真、模型解析、生产验证、计算签名或持久化解析器。

User-defined 描述作者来源。Functional Module 描述网络中的计算对象。后续 materialization 的目标仍是 `BfnFunctionalModule`，不会引入 `CustomNode`、`SenderNode` 或 `UserNode` 等平行节点类型。

## 2. 五个独立判定面

合同对同一个 draft 分别回答以下问题：

| 判定面         | 问题                                         | 状态                                 |
| -------------- | -------------------------------------------- | ------------------------------------ |
| Semantic       | 科学身份、端口、数学形式和适用域是否定义完整 | `valid` / `invalid`                  |
| Representation | BFN-IR 2.0 能否无损保存全部声明              | `lossless` / `requires_ir_extension` |
| Runtime        | 当前静态数值能力能否计算该模型               | `supported` / `unsupported`          |
| Evidence       | 证据等级与结构化来源记录是否按各自规则声明   | basis + provenance state + issues    |
| Implementation | 现实实现处于何种状态                         | maturity state + issues              |

合同不生成 confidence、readiness、quality 或 admission score，也不产生一个覆盖全部维度的 `overall` 状态。

一个数学完整的用户假设可以同时满足：

- Runtime：`supported`；
- Evidence：`proposed_unbuilt_design`；
- Implementation：`unspecified`。

这表示模型可以参与数值计算，不表示它已被实验测量、外部验证或完成生物构建。相对地，Batch 11 的文献 Sender 可以具有明确来源，同时因缺少可执行函数或授权而不能进入运行时。

## 3. Authoring Draft 合同

### 3.1 身份

每个 draft 明确保存：

- 稳定 draft/module ID；
- 用户可见名称；
- 可空的用户描述；
- `origin = user_defined`。

Origin 不从 ID prefix、`labelKey`、`displayName` 或名称文本推断。

### 3.2 Port

每个 Port 保存稳定 Port ID、稳定 Entity ID、用户可见 Entity label、用户可见 Port label、Quantity Type、Unit 和 Direction。

网络连接的科学合同继续是 `P = (E, Q, U)`。Display label 只用于呈现，不能代替 Entity identity，也不能通过大小写归一、同义词或名称相似度获得连接兼容性。

第一版只接受现有 `BfnQuantityType` 和 `BfnUnit`。其中包括 `concentration`、`production_rate`、`expression_level`、`activity`、`flux`、`M`、`mM`、`uM`、`nM`、`pM`、`nM/h`、`uM/h`、`RPU` 和 `dimensionless`。`nmol gDW^-1 h^-1` 等未注册单位保持原值并返回 unsupported issue；验证器不会把它映射成 `nM/h`。

### 3.3 12.1 预备支持的静态模型

| Model family         | Input arity | Output arity | 12.1 authoring decision                                   |
| -------------------- | ----------: | -----------: | --------------------------------------------------------- |
| `hill_activation`    |           1 |            1 | 支持                                                      |
| `hill_repression`    |           1 |            1 | 支持                                                      |
| `linear_transfer`    |           1 |            1 | 仅支持 input/output 使用相同单位且 scale 为 dimensionless |
| `independent_inputs` |          ≥2 |            1 | 支持显式 `independent_unverified` 假设                    |
| `identity`           |           1 |            1 | 不开放；Ideal Edge 已执行 identity propagation            |
| `first_order`        |           1 |            1 | 延期至 12.3                                               |

当前 solver 中出现某个 family 不代表它适合作为用户 authoring capability。12.0/12.1 不接受任意 JavaScript、Python、可执行代码、表达式求值、lookup table 或任意 N 输入公式。

#### Hill

Hill 合同要求一个 input 和一个 output；`K > 0` 且单位与 input Port 相同；`n > 0` 且单位为 `dimensionless`；`ymin`、`ymax` 单位与 output Port 相同；`ymax >= ymin`。

`ymax = ymin` 在当前响应函数中得到常数输出，数值上有定义，因此合同允许相等。该情形不自动获得实验信息量或模型拟合质量声明。验证器在 authoring 边界拒绝非正 `K`/`n`，不会依赖 solver 的 epsilon clamp 修补错误参数。

#### Linear

当前 `BfnParameterEstimate.unit` 不能表达通用的 `output unit / input unit` 复合斜率单位。12.1 的最小安全范围限定为 input 与 output 使用同一单位、`scale` 为 `dimensionless`、`intercept` 使用 output unit。跨单位或跨量纲传递返回 `linear_dimension_mismatch`，并在表示审计中返回 `compound_linear_scale_unit_missing`。12.0 不扩展 Unit algebra。

#### Independent inputs

Independent-input 模型要求至少两个 input、每个 input 恰好对应一个 term、每个 term 明确 activation/repression、`K`、`n` 和 dimensionless weight。Aggregation 为 `bounded_sum` 或 `multiplicative`，interaction assumption 固定为 `independent_unverified`。该字段属于模型层科学假设，表示当前模型没有声明或验证输入间的协同、竞争、比率感知或资源耦合。

Evidence basis 是独立维度，不由 `independent_inputs` family 决定。`independent_assumption` 仍是允许的证据等级，不是该 family 的必选值。`independent_inputs + proposed_unbuilt_design` 可以直接声明；`independent_inputs + fitted_from_published_data` 和 `independent_inputs + measured_single_context` 在提供有效结构记录的 provenance 时也可以声明。

### 3.4 Validity Domain

每个 model input 恰好对应一个有效域，包含 finite `minimum`、finite `maximum` 和 unit，并满足 `minimum < maximum`。有效域单位必须与相应 input Port 一致。有效域描述用户声明或数据支持的适用范围，不表示模型已经实验验证。

### 3.5 Context

Draft 可以明确记录 `not_recorded`，也可以逐项记录 Host、Strain、Medium、Temperature 和 pH。缺少 Context 降低科学适用性判断的确定程度，不阻止一个数学完整模型执行。

合同禁止用 “unknown”、“N/A”、“not recorded”、空字符串或 Demo Context 伪造 Context facts。当前 BFN-IR 2.0 的 `BfnContext` 强制 Host、Strain、Medium 和 Temperature，`BfnModelVariantBase` 又强制 `contextId`，因此 partial/not-recorded Context 无法无损 materialize。

### 3.6 Uncertainty

Draft 区分 `reported`、`none` 和 `not_recorded`。Reported 使用一个已支持的方法并保存相应数据；none 表示作者明确未提供不确定性模型；not-recorded 表示该信息没有记录。

`none` 和 `not_recorded` 不会被改写为 parameter interval envelope、bootstrap、posterior 或 covariance。当前 `BfnStaticModel.uncertaintyMethod` 没有前两种状态，属于表示缺口。

### 3.7 Evidence

合同优先复用 `BfnEvidenceGrade`：

- 普通假设性设计：`proposed_unbuilt_design`；
- 明确的机理模型：`mechanistic_model_only`；
- 已发表数据拟合：`fitted_from_published_data`；
- 实验测量：`measured_single_context` / `measured_multiple_contexts`；
- 外部验证：`externally_validated`；
- 多输入独立作用假设：`independent_assumption`。

`measured_single_context`、`measured_multiple_contexts`、`externally_validated` 和 `fitted_from_published_data` 必须提供结构化 provenance。缺失来源只影响 Evidence assessment，不会反向改变数学公式。`sourceDatasetIds` 不能伪装成通用论文、仓库记录或用户笔记来源。

`provenanceState` 只描述结构记录是否提供：

- `not_required`：当前 evidence basis 不要求 provenance，且没有提交 provenance record；
- `provided`：已经提交 provenance record，且提交的记录均通过结构校验；
- `missing`：当前 evidence basis 要求 provenance 却没有可接受的结构记录，或任一提交记录未通过结构校验。

`provided` 只表示提供了包含非空 `id`、受支持 `kind` 和非空 `reference` 的结构化 provenance。它不表示来源已经科学核实、获得 Catalog trust、构成充分证据或取得 runtime authorization。Batch 12.0 不执行网络查询、来源真实性验证或生产 admission。

### 3.8 Implementation

Implementation state 与运行能力独立：`unspecified`、`designed`、`candidate`、`reported` 和 `validated`。

`unspecified` 要求 implementation ID 列表为空，并允许数学执行。其他状态要求引用至少一个实现记录。当前空 `implementationIds` 可以近似表达“没有引用”，无法无损区分未指定、用户设计、候选、文献报告和验证完成。

### 3.9 Temporal semantics

12.1 只允许 static user model：

- Static network：`steady_state`；
- Dynamic network：沿用现有 static fallback 时为 `quasi_static`；
- 不因用户声明“动态”而获得 `stateful_dynamic`；
- 不自动获得 T1、T2 或 T3 temporal evidence；
- 未提供时间证据时保持 `not_recorded`。

## 4. 合同证明夹具

### Designed Sender

纯单元测试使用以下 synthetic draft：

| Field                 | Contract value                    |
| --------------------- | --------------------------------- |
| Input                 | Inducer X, `concentration`, `nM`  |
| Output                | C8-HSL, `production_rate`, `nM/h` |
| Model                 | Hill activation                   |
| Evidence              | `proposed_unbuilt_design`         |
| Implementation        | `unspecified`                     |
| Context / uncertainty | `not_recorded`                    |

该 draft 的 Semantic 与 Runtime 状态可以通过，同时 Representation 返回 `requires_ir_extension`。它不是文献 Sender，不进入 Sender V1.2、Catalog、Demo、UI、Project 或 Simulation。

输出保持 `production_rate`。Batch 10 的端口合同仍会 hard-block `production_rate -> concentration`；未来必须通过显式 Signal Pool / Accumulation 过程表达积累与清除。

### 普通静态响应

第二个 synthetic draft 表达 `3OC6-HSL concentration (nM) -> normalized activity (RPU)` 的 Hill activation，并验证 Port、参数单位、有效域、假设证据和未指定实现。该 fixture 同样只存在于合同测试。

## 5. 机器可读 assessment

`src/features/bfn/user-defined/userModuleValidation.ts` 的 assessment：

- 输入为只读 draft；
- 输出五个独立、深冻结的 assessment；
- issue 具有 axis、稳定 code 和字段 path；
- 相同输入产生相同结果；
- 不补造 Context、Uncertainty、Provenance 或 Implementation；
- 不返回 materialized module；
- 不写浏览器存储或任何持久化层。

## 6. BFN-IR 2.0 Representation Audit

| Requirement                   | Current BFN-IR support       | Problem                                                                   | 12.1 impact                                    | Recommended action                                               | Schema impact                           |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Explicit user-defined origin  | No                           | 无 origin 字段；prefix/label 推断不可靠                                   | 无法无损标记 authoring provenance              | 增加显式 authoring metadata                                      | Required extension                      |
| User-visible name             | Partial                      | `labelKey` 强制存在；`displayName` 需要固定双语结构                       | 单语用户原文与语言来源可能丢失                 | authoring metadata 保存 verbatim name，可选 locale               | Required extension                      |
| User-visible description      | No lossless path             | `descriptionKey` 指向软件翻译资源                                         | 不能保存自由文本描述                           | authoring metadata 保存 nullable description                     | Required extension                      |
| Stable custom entity identity | Partial                      | Port 的 `entity` 字符串可承载 ID，缺少实体定义权威                        | ID 存在但无法验证其注册身份                    | 增加 Project entity registry                                     | Required extension                      |
| Custom entity display label   | Partial                      | Port `displayName` 不构成实体级 registry                                  | 多 Port 可能为同一 ID 保存冲突标签             | Entity registry 保存 canonical display metadata                  | Required extension                      |
| Partial / missing context     | No                           | `BfnContext` 强制多个事实，model 强制 `contextId`                         | 会迫使系统伪造 Context                         | 增加 recorded/partial/not-recorded 状态并允许 nullable reference | Required extension                      |
| Validity domain               | Yes with linkage caveat      | Range、unit 已存在，且依赖 context ID                                     | 已记录 Context 时可表达；无 Context 时引用冲突 | 保留 range 合同，解除无记录 Context 的强制绑定                   | Small extension                         |
| No uncertainty recorded       | No                           | Static model 强制四种 uncertainty method 之一                             | 会产生虚假 uncertainty 声明                    | 增加 `none` / `not_recorded`                                     | Required extension                      |
| Generic evidence provenance   | No                           | 只有 dataset IDs 与 Catalog 专用来源结构                                  | 论文、仓库记录和用户笔记无法通用引用           | 增加 generic provenance registry/reference                       | Required extension                      |
| Implementation unspecified    | Partial                      | `implementationIds = []` 可近似表达                                       | 空数组没有显式语义                             | 增加 module-level implementation state                           | Required extension                      |
| Implementation maturity       | No                           | Implementation 没有 reported/candidate/designed/validated maturity        | 证据与构建阶段无法区分                         | 增加 maturity 字段和一致性规则                                   | Required extension                      |
| Static Hill                   | Yes                          | 响应可计算；authoring validation 原先未强制全部科学约束                   | 可作为 12.1 首版模型                           | 保留 family，使用本合同前置校验                                  | No family extension                     |
| Static Linear dimensionality  | Partial                      | scale unit 不能表达 output/input 复合单位                                 | 通用跨 quantity linear 不安全                  | 12.1 限制相同单位；Unit algebra 延期                             | No 12.1 schema change under restriction |
| Multi-input independent model | Yes with assumptions         | 支持独立 terms 和 `independent_unverified`                                | 必须防止自动推断交互                           | 保留显式 term coverage；Evidence basis 独立声明                  | No family extension                     |
| Zero-input constant module    | No                           | 仿真要求 primary input，静态 family 没有 constant response                | 组成型 Designed Sender 不能表达                | 为 12.2/Signal Source 设计 constant/process contract             | Future extension                        |
| Multiple outputs              | No lossless response binding | response 没有 output Port binding，solver 把同一 scalar 解释到输出        | 多输出语义不明确                               | 12.1 限制 exactly one output                                     | Future extension                        |
| Lookup table                  | No generic solver family     | Sender admission 中的术语不是 BFN response family                         | 不能开放自定义表格函数                         | 设计插值、域、外推和 uncertainty 合同后再评审                    | Future extension                        |
| Arbitrary formula             | No                           | 无安全表达式 AST、单位检查或执行沙箱                                      | 不能安全、可复现执行                           | 12.0/12.1 禁止 eval、Function 和脚本执行                         | Future capability                       |
| Stateful dynamics             | Built-in only                | `first_order` 存在，用户 authoring 没有状态/初值/时间证据合同             | 不能由 static draft 自称 dynamic               | 延期至 12.3                                                      | Future extension                        |
| Designed Sender               | Partial                      | Hill production-rate 数学可算，authoring/context/evidence metadata 不完整 | 无法无损 materialize                           | 先完成最小 12.1 IR extension；12.2 再实现                        | Required before 12.2                    |
| Signal Pool / Accumulation    | No                           | Rate 到 amount/concentration 需要显式状态、体积和清除                     | 不能直连 Sender rate 与 Receiver concentration | 12.4 引入显式过程模块                                            | Future extension                        |
| Reusable module template      | No                           | 当前 module 是项目实例，没有 authoring template identity/version          | 无法稳定复用和升级用户定义                     | 12.5 设计独立 library/template contract                          | Future extension                        |

审计结论：BFN-IR 2.0 无法无损表达 12.1 所需的 authoring provenance、custom entity metadata、缺失 Context、缺失 Uncertainty、通用来源和 Implementation maturity。Batch 12.0 遵守 stop rule，不修改 schema。

## 7. 建议的最小 12.1 Schema 变更

以下建议交由 Master Control 审核，尚未进入生产类型：

1. 为 user-authored module 增加一个显式 authoring metadata 对象，保存 `origin = user_defined`、稳定 draft ID、verbatim name 和 nullable description。
2. 在 Project registry 增加 Entity definition registry；现有 Port entity 值继续作为 stable ID，显示名称由 registry 提供。
3. 为 Context 增加 `recorded | partial | not_recorded` 文档状态，允许缺失事实，并允许 model 在 `not_recorded` 时使用 nullable Context reference。
4. 为 static uncertainty 增加 `none | not_recorded`，保留现有四种 reported method。
5. 增加通用 provenance record/reference，覆盖 dataset、publication、repository record 和 user note；不重载 `sourceDatasetIds`。
6. 增加明确的 module implementation state，并为具体 implementation record 增加 maturity。

12.1 继续采用以下范围限制以减少 schema 面积：

- Linear 只允许 input/output 同单位，不引入 compound Unit algebra；
- exactly one output，不增加 response output binding；
- 不增加 constant、lookup-table、arbitrary-formula 或 dynamic family；
- 不修改 Ontology；user module classification 延后，并禁止按名称推断；
- materialization、编辑 UI、持久化迁移和 Add to Network 必须在 schema 方案获批后另立任务。

## 8. 后续路线

- 12.1：Static Functional Module Authoring；
- 12.2：Designed Sender；
- 12.3：Stateful / Dynamic Custom Modules；
- 12.4：Signal Pool / Accumulation；
- 12.5：Reusable User Module Library。

Batch 12.0 到此停止，不进入 Batch 11.2、Batch 7 Calibration、网络级反向设计或上述生产实现。
