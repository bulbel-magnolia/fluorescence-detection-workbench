# BFN 网络作用分析

## 功能定位

网络作用分析回答一个目标明确的问题：在用户给定的外部输入条件下，各网络输入对所选 Output Monitor 的当前输出产生多强的总体局部作用，以及作用方向为何。该能力属于 `BFN-INTERPRETATION 1.0` 派生解释层，结果不改变网络模型，也不构成新的实验事实。

Batch 13.2 的状态为 `CANDIDATE / implementation complete / awaiting Master Review / not FROZEN`。Batch 13.1 Correction 的状态为 `CANDIDATE / correction implementation complete / awaiting Master Correction Review / not FROZEN`。

## 分析对象与条件

一次请求使用 `BfnNetworkInfluenceRequestV1` 绑定：

- `contractVersion = 1.0`；
- `scope = network_static_output`；
- 一个 exact `outputMonitorId`；
- 该目标上游实际参与 active response 的外部 Input Source 工作点。

每个外部输入值绑定 exact `inputSourceId` 和 Input Source output port 的 exact unit，并满足完整、有限、非负。用户不直接填写内部 Module input，内部工作点由网络传播产生。结果中的外部输入顺序沿用 `project.network.inputSources` 的稳定顺序。

分析条件只存在于 Drawer 组件状态和本次纯函数调用中。关闭 Drawer 后条件丢弃，不修改 Input Source specification、Project、Workspace、localStorage 或 IndexedDB。

界面只在 Project 已记录唯一分析值时预填：static Project 的 `fixed_value`，以及 dynamic Project 的 `constant`。`working_range`、`step`、`pulse`、`periodic` 和 `custom_time_series` 保持空白。

## 目标闭包与结构准入

结构准入从所选 Output Monitor input 沿 enabled Edge 反向遍历。每个相关 Functional Module 先通过 `assessBfnLocalInfluenceRequest()` 解析 active static response 的实际输入，再继续访问这些输入。Module 上未参与 active response 的端口和目标外分支不进入闭包。

目标闭包要求：

- Output Monitor identity 唯一；
- 每个 active-response input 恰有一条 enabled incoming Edge；
- Edge endpoint、direction 与 identity mapping 完整；
- source/target port 的 Entity 与 quantity type 完全一致；
- source/target unit 可由冻结 unit system 换算；
- 每个相关 Module 存在 Batch 13.1 支持的 static 或 first-order steady-state response；
- 目标闭包为 DAG。

缺失或重复 incoming Edge、未知 endpoint、科学量不一致、目标反馈环路和无可解释 response 均 fail closed。准入在临时的目标闭包子图上复用 `topologicalModuleOrder()`；网络其他区域的环路、损坏模块或未连接输入不阻断当前目标。

Accumulator / Signal Pool 表示动态积分过程，不具有本批所需的普通 static input-output response。目标闭包包含此类模块时，分析以自然说明禁用，不跳过模块，也不构造有限 static gain。

## 工作点传播

给定外部工作点后，计算器按目标闭包的拓扑顺序传播实际值：

```text
Input Source output = explicit user value
Edge target value   = convertUnit(source value, source unit, target unit)
Module output       = calculateBfnLocalInfluence(module operating point).output
Monitor output      = convertUnit(final upstream value, upstream unit, monitor unit)
```

每个 Module 都调用 `calculateBfnLocalInfluence()`。生产 `evaluateStaticResponse(..., estimate)`、解析导数、局部适用性和 model evidence 继续由 Batch 13.1 的单一计算路径提供。网络层不实现第二套 response evaluator，也不调用 `annApproximation.ts` 或 `analysis.annThresholds`。

## 总体作用传播

对每个外部 Input Source `u`，Input Source output 处初始化 `du/du = 1`，对其他外部源初始化为 `0`。Edge 只进行数值单位坐标换算：

```text
unitCoordinateScale
= convertUnit(1, sourceUnit, targetUnit)
  - convertUnit(0, sourceUnit, targetUnit)
```

Functional Module 的每个输出敏感度使用 Batch 13.1 局部增益进行前向组合：

```text
dy/du = Σi (∂y/∂xi)(dxi/du)
```

分支在各自下游传播，汇合时通过上述和式自然组合。主总体作用不依赖路径枚举。

对于一个特定外部源，当 `dxi/du === 0` 时，该输入的一阶贡献为零，局部不可导状态不会污染该源。`dxi/du !== 0` 且对应局部增益 unavailable 时，该外部源的下游作用标记 unavailable；其他外部源保持独立结果。局部增益为精确零时也可阻断上游 unavailable 状态的传播。

## 单位与方向

总体响应增益继续使用 `BfnDerivedGainUnit`：

```text
outputUnit = Output Monitor input port unit
inputUnit  = Input Source output port unit
```

单位换算比例只描述 numeric coordinate。它不属于 Edge biological gain，不写入 Edge，不在普通 UI 中显示为 weight、gain 或 sensitivity。Ideal Edge 仍为 instantaneous、lossless、identity topology。

方向严格由总体增益符号决定：正值为增强，负值为抑制，精确零表示当前条件下无局部变化，unavailable 表示当前条件下无法计算。实现不使用 near-zero epsilon threshold。

相对敏感度采用同一工作点上的：

```text
E = (u / y)(dy / du)
```

gain unavailable、`u <= 0` 或 `y <= 0` 时按 Batch 13.1 的稳定原因返回 unavailable。

## 稳态范围

普通 static Module 使用 active static response。包含配对 first-order model 的 Module 使用其 steady-state static response。动态 Project 在目标闭包为 DAG、所有相关 Module 均可作 static/steady-state interpretation 且不含 Accumulator 时可执行本分析。结果只描述稳态响应关系，不包含时间过程、τ、frequency gain 或 transfer function。

目标闭包存在反馈环路时直接拒绝。本批不执行 fixed-point iteration、closed-loop gain、stability analysis 或 feedback solver。

## 适用性

每个相关 Module 在传播到的实际内部工作点执行自己的 `BFN-INTERPRETATION 1.0` applicability admission。

- 所有相关输入位于已记录闭区间内：network applicability 为 `within_recorded_domain`；
- 至少一个相关 response 未完整记录范围，且没有域外模块：保留数学结果，network applicability 为 `applicability_not_recorded`；
- 任一相关输入位于 recorded range 外：阻断整个正式网络结果。

域外错误保留 module、input port、当前值和记录范围，界面将这些 identity 转换为自然模块名与输入名。目标外模块的 applicability 不进入当前结果。

## Evidence 与不确定性

结果逐模块保留 active static model 的 ID/version、Evidence grade、uncertainty method、model provenance、source dataset、Context、ValidityDomain、catalog mapping identity 和 interpretation basis。Implementation-only provenance 不提升为 model evidence。

网络层不创建合成 `networkEvidenceGrade`，也不按最高、最低或平均等级概括多个模型。界面把“分析依据”作为次级详情，按相关模块列出模型依据。

计算使用 nominal parameters。不执行 network gain confidence interval、Monte Carlo、posterior、Sobol 或其他数值 uncertainty propagation；component model uncertainty metadata 保留在对应模块记录中。

## 用户界面

入口位于 selected Output Monitor Inspector，中文为“分析网络作用…”，英文为 “Analyze network influence…”。右侧 Drawer 依次展示分析对象、相关网络输入条件、当前输出、每个外部输入的作用方向、总体响应增益、相对敏感度、适用性和折叠的分析依据。

输入不完整时分析按钮禁用；编辑任一输入立即清除旧结果。Drawer 支持 Escape、focus trap、关闭后的焦点恢复、独立滚动、表格语义和非颜色状态文本。普通界面不显示公式、Jacobian、chain rule、topological sorting、unit scale、raw ID 或内部 issue code。

## 当前边界

Batch 13.2 未实现 path contribution breakdown。总体响应增益已经覆盖 branching 与 convergence，并完全由前向敏感度传播产生；后续如增加路径明细，将作为不改变总体结果的次级审计视图，并设置完整性安全上限。

本批也不实现 feedback/static steady-state solver、dynamic/frequency analysis、network uncertainty propagation、ANN local view、analysis persistence、cache 或 export schema。Batch 13.3 与 Batch 13.4 保持 `PLANNED / NOT AUTHORIZED`。
