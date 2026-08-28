# BFN 时间语义、端口兼容性与实验适用性合同

## 合同范围

Batch 10.0 在 BFN-IR 2.0 外建立只读派生合同；Batch 10.1 将同一合同接入生产验证、仿真溯源与科学界面。四个合同分别回答四个问题：

| 问题                     | 权威合同                 | 结果维度                                                     |
| ------------------------ | ------------------------ | ------------------------------------------------------------ |
| 两个端口能否直接连接     | Port Compatibility       | compatible / uncertain / incompatible                        |
| 模块怎样处理时间         | Temporal Execution       | steady-state / quasi-static / stateful dynamic / unsupported |
| 时间行为有多少已记录证据 | Temporal Evidence        | T0 / T1 / T2 / T3 / not recorded                             |
| 实验背景如何对应         | Scientific Applicability | matched / uncertain / mismatched                             |

四个维度彼此独立。Ontology 描述生物功能，Catalog 管理运行信任与来源，现有模型解析器决定当前合法模型。时间与兼容性合同不授予运行资格，不验证 Catalog，不修改模型、端口、上下文、参数、连线或仿真结果。

核心原则为：信息缺失不等于已知冲突；证据缺失降低科学解释强度，不自动破坏已有计算可用性；实体、量类型、单位量纲和方向的明确数学冲突保持硬边界。

## Temporal Execution Modes

`resolveBfnModuleTemporalCapability(project, module)` 直接读取现有 `resolveEffectiveBfnModel()` 的选择结果，不建立第三套模型选择逻辑。

| Execution Mode     | 解析条件                                                               | 计算语义                            |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------- |
| `steady_state`     | Static network + active static model                                   | `y = F(x)`                          |
| `quasi_static`     | Dynamic network + 无 active dynamic model + 可执行 active static model | 每个时刻计算 `y(t) = F(x(t))`       |
| `stateful_dynamic` | Dynamic network + active dynamic model                                 | 当前一阶模型为 `τ·dy/dt = F(x) - y` |
| `unsupported`      | 当前分析模式下没有合法可执行模型                                       | 不提供该模块的时间计算              |

Quasi-static 模块可以接收时变输入，模块本身没有内部状态、响应延迟或历史记忆。它不构成真实有状态动力学。Stateful dynamic 只描述数学执行方式；同一当前输入在不同历史状态下可以产生不同输出。

解析依据同步记录为：

- `active-static`
- `active-dynamic`
- `dynamic-static-fallback`
- `no-executable-model`

动态网络可以同时包含 stateful dynamic 与 quasi-static 模块。现有 Simulation 已按选中模型分别执行一阶状态更新与即时静态响应，Batch 10.0 只命名和评估该行为，不改变数值路径。

## Temporal Evidence Tiers

时间证据与执行方式独立：

| Evidence Tier                 | 当前软件合同中的含义                                            |
| ----------------------------- | --------------------------------------------------------------- |
| `t0_steady_state`             | 当前纳入的证据只支持稳态或剂量—响应执行合同                     |
| `t1_time_resolved`            | 已记录时间分辨实验，证据不足以形成正式参数化动态模型            |
| `t2_phenomenological_dynamic` | 已记录证据支持现象学动态模型，例如实验拟合的一阶时间常数        |
| `t3_mechanistic_dynamic`      | 已记录证据支持带明确状态、过程和生物/物理参数来源的机制动态模型 |
| `not_recorded`                | 当前软件合同没有明确记录时间证据                                |

T0 描述软件当前纳入的执行证据，不声称原始论文不存在动态实验。`not_recorded` 是合法证据状态，不等于 `unsupported`。

当前 Catalog-backed static Receiver 的执行证据为 `t0_steady_state`；放入 Dynamic network 时，其 Execution Mode 为 `quasi_static`。当前 Built-in first-order Demo 可以执行为 `stateful_dynamic`，其时间证据保持 `not_recorded`。`first_order` family、`mechanistic_model_only` evidence grade 或 dynamic model 的存在都不会自动生成 T2/T3 结论。

## Port Compatibility

`assessBfnPortCompatibility(sourcePort, targetPort)` 按端口计算合同依次评估：

1. Source 必须为 `output`，Target 必须为 `input`。
2. Entity 必须精确相同。
3. Quantity Type 必须精确相同。
4. Unit Dimension 必须兼容。

任一检查明确冲突时，整体结果为 `incompatible`。当前 `BfnPort` 强制保存四项核心语义，正常类型输入原则上只产生 `compatible` 或 `incompatible`；`uncertain` 为未来更丰富的端口元数据保留。端口或节点无法解析属于结构错误，不转换为 `uncertain`。

Entity 不执行 contains、alias、名称相似或 Ontology 自动桥接。`AHL` 与 `3OC6-HSL` 不会被猜测为同一实体。功能拓扑看起来合理也不能覆盖 Quantity Type 或 Unit Dimension 冲突。

## Unit representation 与 Ideal Edge

同一实体、同一量类型、同一单位量纲可以直接连接。例如 concentration 的 `nM → M` 为 compatible，并记录 `requiresUnitNormalization = true`。现有 `valueAcrossEdge()` 将数值换算到 Target 的单位表示。

该换算保持同一个 canonical physical quantity：

```text
physical_value_source = physical_value_target
```

它是数值表示转换，不是 Edge gain，也不是运输、延迟、降解、结合、积分或其他生物过程。Ideal Edge 继续表示同一 canonical physical quantity 的拓扑恒等传递；单位换算不需要 Functional Module。

## 数学硬边界与未来 Sender

以下连接为 hard incompatible：

```text
Source: AHL production_rate, nM/h
Target: AHL concentration, nM
```

`dC/dt` 与 `C` 是不同量类型。Port Compatibility 不自动积分，也不根据 signal production 与 signal response 的 Ontology 关系放宽端口合同。

未来 Sender 的 production rate 需要显式 Signal Pool / Accumulation Module，例如：

```text
dC/dt = r - kC
```

该模块负责积累与清除过程，并输出 concentration。Batch 10.0 只记录这一建模要求，不实现 Signal Pool。

## Scientific Applicability

`assessBfnContextApplicability(evidenceContext, projectContext)` 比较四项事实：

- Host Species
- Host Strain
- Medium
- Temperature Celsius

每个文本事实显式声明 `canonical` 或 `reported_text` comparison basis。Temperature 使用明确的 Celsius 数值作为 canonical comparable fact。

比较规则如下：

- 任一侧缺失或为空字符串：`uncertain`
- 两个 canonical 值相同：`matched`
- 两个 canonical 值明确不同：`mismatched`
- reported text 经 trim、大小写与空白归一后相同：`matched`
- reported text 不同：`uncertain`
- 两个明确 Celsius 数值相同：`matched`
- 两个明确 Celsius 数值不同：`mismatched`

Reported text 不执行同义词推断。`E. coli` 与 `Escherichia coli`、`LB` 与 `Luria-Bertani` 的文本差异默认产生 `uncertain`，不产生硬冲突。

整体状态按以下优先级聚合：任一可靠字段 mismatched 时整体为 `mismatched`；否则任一字段 uncertain 时整体为 `uncertain`；四项全部 matched 时整体为 `matched`。结果保留逐字段 assessment，不生成百分比、置信分数或等级排名。

不同 `contextId` 只说明两条记录身份不同，不能单独证明 Host、Strain、Medium 或 Temperature 冲突。Batch 10.1 的生产 Validation 已停止新发粗粒度 `context_mismatch`；该 code 只为旧记录兼容保留。新连接只发 `context_applicability_uncertain`、`context_applicability_mismatch` 或 `context_applicability_unavailable`，并继续允许连接与仿真。

## Missing 与 Mismatch

示例：

```text
Evidence: Host=E. coli, Strain=TOP10, Medium=missing, Temperature=37
Project:  Host=E. coli, Strain=TOP10, Medium=LB,      Temperature=37
```

逐字段结果为 matched、matched、uncertain、matched，整体为 `uncertain`。缺失 Medium 不转换为 `mismatched` 或 runtime error。

两个 canonical Host 分别为 `Escherichia coli` 与 `Saccharomyces cerevisiae` 时，Host 与整体均为 `mismatched`。该结果描述科学适用性，不在 Batch 10.0 自动阻断 Simulation。

## 只读与持久化边界

Temporal Capability、Port Compatibility 和 Context Applicability 核心评估都保持确定性的只读派生结果：

- 相同输入产生完全相同的 assessment；
- 返回对象与逐项检查被冻结；
- Project、Module、Port 与 Context Facts 保持不变；
- computation signature 保持不变；
- 不写入 BFN-IR Project、Workspace 或 computation signature；
- BFN-IR 继续为 2.0，BFN-SIM 继续为 2.0，Workspace IndexedDB 继续为 v1。

Batch 10.1 在一次成功运行中把上述评估结果复制为可选、不可回算的 Run provenance。该持久化发生在仿真编排层，不改变三个核心评估函数的只读性质。

## Batch 10.1 Runtime Integration

### Validation 与执行边界

`checkIdealConnection()` 通过 `assessBfnPortCompatibility()` 取得端口结论，再映射到既有 `source_port_direction`、`target_port_direction`、`entity_mismatch`、`quantity_mismatch` 与 `unit_dimension_mismatch`。结构性检查仍独立处理节点/端口缺失、重复连接、自连接、已占用输入和静态环路。同一冲突不会同时由旧逻辑与新合同重复发出。

输出监视器的上游可达模块由 `findBfnOutputReachableModuleIds()` 确定。可达模块为 `unsupported` 时发出 `temporal_execution_unsupported` error 并阻止运行；孤立的 unsupported 模块不阻止运行。Catalog model 已存在但其冻结来源校验失败时，Catalog trust error 继续作为执行权威，不被时间错误替代。

Dynamic network 可以执行纯 quasi-static、纯 stateful dynamic 或两者混合的输出路径。数值求值、参数场景、时间步进、点值、上下界、中间模块输出与动态派生指标均沿用原实现。

### Context Integration Adapter

上下文适配只比较 Functional Module → Functional Module 的 enabled edge。Input Source → Module 与 Module → Output Monitor 返回 `not_applicable`，不生成上下文 Validation issue，也不进入运行的 comparable-edge 快照。

Built-in model 使用其有效模型的 exact `contextId` 在 Project registry 中查找记录。Host、Strain 与 Medium 作为 `reported_text`，数值 Temperature 作为 `canonical`。Catalog-backed model 只使用当前 trusted ReleaseCatalogPresentation 中 `catalogReference.parameterContextId` 的 exact 记录；Host、Strain 与 `canonical.details.cultureMedium` 作为 `reported_text`。Catalog 的 Temperature 保留为来源自由文本，适配器不使用正则或单位猜测把它解析成数值，因此 comparable Temperature 为 null 并产生 uncertain。

Catalog presentation 加载失败、信任失败或 exact parameter-context ID 缺失时，集成状态为 `unavailable`。适配器不会回退到 BFN `model.contextId`、显示名称或复制字段。该状态只表示上下文比较不可用；Catalog runtime trust 仍由既有 verifier 独立执行。

### Run provenance

BFN-SIM 继续使用 `engineVersion: BFN-SIM-2.0`，并新增两个可选快照：

- `temporalSnapshot`：scope 固定为 `output_reachable`，只保存输出可达模块的 module ID、运行时选中 model ID、Execution Mode、Evidence Tier 与 Resolution Basis；
- `contextApplicabilitySnapshot`：scope 固定为 `output_reachable_module_edges`，只保存输出可达、enabled 的 Module → Module edge，以及 matched / uncertain / mismatched / unavailable 状态和可用的逐字段 checks。

快照不保存汇总计数、分数或百分比。界面和导出在读取时从快照派生摘要。旧运行没有快照时继续加载；界面显示“时间处理未记录”和“实验上下文未记录”，不会借用当前 Project 重新计算历史语义。

### Scientific UX

Module Inspector 在 Functional Classification 后显示 Time Behavior，分别呈现 Execution Mode 与 Temporal Evidence。Quasi-static 明确说明时变输入在每个时间点使用稳态响应，模块没有内部延迟或状态记忆。

Connection Builder 与 Edge Inspector 分为 Signal Compatibility 和 Experimental Context。兼容的 `nM → M` 显示自动数值表示换算；相同单位不显示冗余的“无换算”。`production_rate → concentration` 明确要求显式累积/清除过程，不自动积分、插入模块或修改上下文。Context uncertain、mismatched 与 unavailable 都保留连接能力，并可展开逐字段状态。

Dynamic Result 从运行快照显示 Time Handling summary。全部 quasi-static 时，指标标题改为 Time-trajectory descriptors，并界定这些值来自时变准静态轨迹，不是模块动力学参数；混合路径明确标记部分模块使用瞬时稳态近似。Run Provenance 显示时间执行、时间证据和上下文适用性摘要，并可展开模块明细。

历史对比资格仍由既有 `compatibleBfnRuns()` 决定。两条兼容运行的时间执行摘要不同或任一快照缺失时，只显示非阻断提示，不改变曲线比较资格。
