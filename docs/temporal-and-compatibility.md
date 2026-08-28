# BFN 时间语义、端口兼容性与实验适用性合同

## 合同范围

Batch 10.0 在 BFN-IR 2.0 外建立只读派生合同，分别回答四个问题：

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

不同 `contextId` 只说明两条记录身份不同，不能单独证明 Host、Strain、Medium 或 Temperature 冲突。Batch 10.0 不修改现有粗粒度 validation warning。

## Missing 与 Mismatch

示例：

```text
Evidence: Host=E. coli, Strain=TOP10, Medium=missing, Temperature=37
Project:  Host=E. coli, Strain=TOP10, Medium=LB,      Temperature=37
```

逐字段结果为 matched、matched、uncertain、matched，整体为 `uncertain`。缺失 Medium 不转换为 `mismatched` 或 runtime error。

两个 canonical Host 分别为 `Escherichia coli` 与 `Saccharomyces cerevisiae` 时，Host 与整体均为 `mismatched`。该结果描述科学适用性，不在 Batch 10.0 自动阻断 Simulation。

## 只读与持久化边界

Temporal Capability、Port Compatibility 和 Context Applicability 都是确定性的只读派生结果：

- 相同输入产生完全相同的 assessment；
- 返回对象与逐项检查被冻结；
- Project、Module、Port 与 Context Facts 保持不变；
- computation signature 保持不变；
- 不写入 BFN-IR、BFN-SIM、Run、Workspace、localStorage 或 IndexedDB；
- BFN-IR 继续为 2.0，BFN-SIM 继续为 2.0，Workspace IndexedDB 继续为 v1。

## Batch 10.1 延期项

下一阶段再把合同接入生产展示与警告：

- Simulation provenance 与 mixed dynamic execution summary
- Module Inspector 时间行为
- Result Panel 时间处理说明
- Connection compatibility UX
- Context applicability warning
- 用逐字段事实替换粗粒度 `contextId` mismatch warning

Batch 10.0 不修改 Simulation、Connection Validation、Result schema、Module Inspector、Connection UX、Result UI、Catalog trust、Ontology 或 BFN-IR。
