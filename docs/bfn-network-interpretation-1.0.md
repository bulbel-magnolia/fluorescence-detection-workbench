# BFN-INTERPRETATION 1.0 网络作用解释合同

## 状态与目的

本合同定义 BIO-NET Phase III 的派生网络解释层。Batch 13.0、Batch 13.1 与 Batch 13.2 均已完成 Master Correction Review，状态保持 `CANDIDATE / not FROZEN`。Batch 13.2 reviewed correction 为 `f62babfa2af09156c711792d362fab687270f42c`。Batch 13.3 reviewed implementation `e0ce3a1cee0eff68a28a40edb4bfbd8a66ac3f44` 已通过 Master Review，状态为 `CANDIDATE / not FROZEN`。

Batch 13.0 建立分析条件、局部响应增益、相对敏感度、适用性、Evidence 继承以及局部 ANN weight/bias 的科学语义。Batch 13.1 实现 module-local 静态输入作用计算与用户工作流。Batch 13.2 在同一局部真值上实现 Output Monitor 目标闭包、工作点传播和外部输入总体作用分析。Batch 13.3 将这些结果转换为同一 operating point 的完整局部权重与近似偏置视图。

解释层使用独立版本 `BFN-INTERPRETATION 1.0`。BFN-IR 保持 `2.3`，BFN-SIM 保持 `2.2`，Workspace IndexedDB、Module Library IndexedDB 与 Module Template 的版本均保持不变。

## 派生解释边界

解释结果来自现有模型在指定分析条件附近的数学性质，不构成新的生物网络物理对象或实验事实。

- Module 承担 transformation / computation。
- Edge 保持 instantaneous、lossless、identity propagation，仅表示 topology。
- weight、gain、bias 和 sensitivity 只能存在于 ephemeral analysis result 或未来 analysis overlay。
- 解释结果不写回 Project、Module、ModelVariant、Edge、Workspace Draft/Version 或 Module Library。
- 计算只使用模型参数的 nominal `value`。区间、posterior、bootstrap 和 covariance 元数据继续作为来源上下文保留，不在本合同中传播为 gain uncertainty。

## 与当前生产运行时的关系

### 正式静态响应 family

`BfnStaticResponse` 当前包含五类正式响应：

1. `hill_activation`
2. `hill_repression`
3. `linear_transfer`
4. `identity`
5. `independent_inputs`

`module_static_response` v1 只接收 exactly-one-output module。当前 `BfnStaticResponse` 没有 explicit output binding，多 output module 无法从单位、quantity、Entity、display name、请求选择或数组位置可靠推断 response 所属 output，因此 admission 直接返回 `model_contract_invalid / static_output_arity_invalid`。请求的 `outputPortId` 必须与该唯一 output 完全一致。

`identity` 只有在 input/output 的 Entity、quantity type 和 unit 三者完全相同时才表示科学恒等关系。equal unit alone 不足以建立 identity；例如同为 `dimensionless` 的 activity 与 expression level 仍是不同科学量。违反该规则时 admission 返回 `model_contract_invalid / identity_contract_invalid`。

唯一通用纯静态求值器为 `responseMath.ts` 中的 `evaluateStaticResponse()`。生产方程如下。

令：

```text
x+ = max(0, x)
K+ = max(Number.EPSILON, K)
n+ = max(Number.EPSILON, n)
H(x) = x+^n+ / (K+^n+ + x+^n+)
```

则：

```text
hill_activation: y = ymin + (ymax - ymin) H(x)
hill_repression: y = ymax - (ymax - ymin) H(x)
linear_transfer: y = clamp(intercept + scale x, outputMinimum, outputMaximum)
identity: y = x
```

`linear_transfer` 未声明下界或上界时分别使用负无穷和正无穷。

对于 `independent_inputs`，每个输入先形成独立项：

```text
activation term: ti = contribution_i H_i(xi)
repression term: ti = contribution_i (1 - H_i(xi))
```

随后按已记录的 aggregation 计算：

```text
bounded_sum:
  combined = basal + Σ ti

multiplicative:
  combined = basal + (outputMaximum - basal) (1 - Π(1 - ti))

output:
  y = clamp(combined, min(0, basal), outputMaximum)
```

解释层严格沿用这些方程，不引入 synergy、competition、ratio sensing、resource coupling 或底层模型未表示的 cross term。

### Catalog Receiver

Catalog Receiver 实例保存 materialized `hill_activation`：`ymin=0`、`ymax=1`、`K=EC50`、`n=Hill coefficient`。现有生产运行时先核验 frozen catalog identity、来源参数、端口、Context 和 ValidityDomain，再通过可信 Receiver evaluator 执行同一归一化响应。

解释层以当前 active BFN static response 为唯一响应来源。`catalogReference` 继续保存 catalog、release、response、component、signal、Context 和 source identity，用于来源与映射审计；解释层不重新读取 `sourceParameters` 生成第二套响应真值。

### 既有 ANN approximation

`annApproximation.ts` 中的既有 ANN 表示是静态工作域采样后的 least-squares affine fit：

```text
y ≈ WΩ x + beff
```

`BfnAnalysisSettings.annThresholds.minimumR2` 与 `maximumNrmse` 只判断该区间拟合是否 accepted。它们不表示局部响应增益阈值，不参与 operating-point linearization，也不进入 Batch 13.3 的 local ANN approximation。局部近似不调用 `buildAnnApproximation()`，不复用 `BfnAnnApproximation`，不产生 R²、NRMSE 或 accepted/rejected fit status。

## 分析条件合同

`BfnLocalInfluenceRequestV1` 明确绑定：

- `contractVersion = 1.0`；
- `scope = module_static_response`；
- exact `moduleId`；
- exact `outputPortId`；
- 完整 `operatingPoint`。

每个工作点输入包含 exact `portId`、finite numeric `value` 和 exact Port `unit`。身份解析不使用 Entity display name、模块显示名或数组位置。

active response 使用的每个输入必须恰好出现一次。缺失、重复、多余、未知端口、output port 冒充 input、unit 不一致、NaN、正负 Infinity 和负值均被拒绝。负值拒绝延续当前 BFN 输入规格的非负科学值约束。

admission API 为：

```text
assessBfnLocalInfluenceRequest(project, request)
```

该函数 pure、deterministic、non-mutating，不访问 storage，不执行网络，不调用 UI，不求模型输出或导数。普通 malformed request 返回稳定 issue，不通过异常承担正常控制流。

## active static model 解析

解释目标只通过 `module.activeModelIds.static` 解析，并要求该 ID 在 `modelVariants` 中唯一对应一个 static model。Dormant variant 不参与解析。重复 module identity、重复或错误 active model identity 直接 fail closed。

含 active static 与 active first-order dynamic model 的模块必须保持 `dynamic.steadyStateResponse` 与 active static `response` 一致。该模块的 Batch 13.0 解释类型为 `first_order_steady_state_static_response`。网络当前处于 static 或 dynamic mode 不改变这项解析规则。

## 局部响应增益

对于：

```text
y = f(x1, x2, ..., xn)
```

在分析条件 `x0`，输入 `xi` 的局部响应增益定义为：

```text
wi = ∂y/∂xi |x0
```

每个输入分别形成一个增益。增益绑定同一 Project snapshot、module、active static model、nominal parameters、output port 和 operating point。增益允许为正、负或零；正式 available 值必须 finite。

Batch 13.1 只允许由生产方程推导的 analytic derivative。数值差分、epsilon、step size、tolerance 和 perturbation 不属于生产合同。有限差分可作为测试 oracle，不构成结果来源。

### 可微性边界

- `identity` 在有限输入处导数为 1。
- Hill family 在正输入和有效正 `K`、`n` 下按解析式可微。`max(0,x)` 的分支点 `x=0` 必须检查两侧导数是否一致；非唯一或非有限时返回 unavailable。
- bounded linear response 在线性区导数为 `scale`，在严格 clamp 区导数为 0。进入或离开 clamp 的边界点只有在两侧导数一致时才形成唯一导数。
- `independent_inputs` 先对每个正式 Hill term 求偏导，再严格传播其既有 aggregation。最终 output clamp 的切换点采用同一唯一导数规则。
- 任何 branch、min/max、saturation 或 clamp 的 kink 都不选择左导数或右导数代替正式结果。

Batch 13.1 的 `calculateBfnLocalInfluence(project, request)` 实现上述解析规则。它先执行 admission，仅在 supported request 上调用生产静态求值器与解析导数路径。一个 input 的 Hill 导数不可用时，只影响该 input；其他独立输入继续按各自解析偏导计算。

Batch 13.1 correction 将 Hill derivative 的 parameter safeguard 与生产求值器完全对齐：所有 Hill activation/repression 与 `independent_inputs` term 都先使用 `safeK = max(Number.EPSILON, K)` 和 `safeN = max(Number.EPSILON, n)`，再执行零点分类与解析导数。该修正不改变 `responseMath.ts` 的生产语义，也不引入 numerical derivative fallback。

## 增益单位

增益单位由 output/input 单位对组成：

```text
outputUnit = module output port unit
inputUnit  = corresponding input port unit
```

例如 `(nM/h)/uM` 表示为 `{ outputUnit: 'nM/h', inputUnit: 'uM' }`。该表示属于解释层，不扩展 `BfnUnit`。

## 相对敏感度

相对敏感度采用标准 log elasticity：

```text
Ei = (xi / y) (∂y/∂xi)
```

结果 dimensionless。available 至少要求 `xi > 0`、`y > 0` 且局部响应增益 finite。失败原因稳定区分：

- `input_not_positive`
- `output_not_positive`
- `derivative_unavailable`

模型输出 `y0=f(x0)`、gain、elasticity 和未来 ANN bias 必须来自同一分析快照与同一 operating point。

## ValidityDomain 与适用性

请求单位必须与 Port 单位完全一致。ValidityDomain range 可使用同量纲 BFN unit；比较时沿用冻结 unit conversion。

每个 active-response input 的 recorded range 采用闭区间：

```text
minimum <= value <= maximum
```

适用性状态为：

- `within_recorded_domain`：每个必要输入均有唯一合法 range，且值位于闭区间内；
- `applicability_not_recorded`：模型合同有效，至少一个必要输入没有 recorded range；数学解释可形成，同时保留适用范围未记录状态；
- `outside_recorded_domain`：至少一个值超出 recorded range，阻止正式 interpretation result。

`applicability_not_recorded` 不表示 unbounded 或 universally valid。损坏、重复、未知端口或量纲不兼容的 range 属于 `model_contract_invalid`。

## Context、Evidence 与 Provenance

解释结果继承 active static model 自己声明的：

- model ID 与 version；
- evidence grade；
- uncertainty method；
- `sourceDatasetIds`；
- `provenanceIds`；
- Context reference；
- ValidityDomain reference；
- Catalog mapping identity（适用时）。

解释不创建更高 Evidence grade。Model `provenanceIds` 是结果的 model provenance 范围；BiologicalImplementation 自己的 `provenanceIds` 不进入 model evidence。Catalog source IDs 保持 catalog mapping/provenance identity，不伪装成 BFN registry model provenance。

普通 BFN model 的非空 Context ID 必须唯一解析到 Project Context。`contextId = null` 明确表示 not recorded。Catalog-backed model 使用 catalog parameter Context reference。Batch 13.0 不增加第二套 host、medium、temperature compatibility system。

## first-order 静态解释

first-order module 的静态解释只描述 active static response 的 steady-state/local response：

```text
∂ steady-state output / ∂ input
```

该量不命名为 DC gain、frequency gain、dynamic transfer 或 transfer function。τ、initial state 和时间输入不进入 Batch 13.1 静态局部解释。界面明确标记当前显示的是动态模块的稳态响应关系。

## Accumulator 排除

Accumulator / Signal Pool 的运行方程为：

```text
dC/dt = r
```

其 BFN-SIM 2.2 合同要求单个 production-rate input、单个同 Entity concentration output，并支持 `nM/h → nM` 或 `uM/h → uM`。Accumulator 没有普通 static input-output response，admission 返回 `static_interpretation_unsupported`。Batch 13.1 Inspector 禁用该操作，并以自然语言说明 Signal Pool 是动态积分过程。积分器和频率相关解释属于 Batch 13.4。

## 局部 ANN weight 与 bias

指定 operating point 下：

```text
weight_i = local differential gain_i at the same operating point
```

局部线性近似为：

```text
y ≈ y0 + Σ wi (xi - xi0)
  ≈ Σ wi xi + b

b = y0 - Σ wi xi0
```

weight 是派生解释量，不是 Edge 属性、Module parameter 或实验系数。bias 属于 ANN approximation layer，单位等于 module output unit。basal expression、leak、constitutive output、threshold shift、environmental background 和 initial state 继续作为底层生物或状态量，不重命名为 ANN bias。

本地导数线性化与既有 working-range least-squares affine fit 是两类不同分析，结果、阈值和语义不混用。

## Result 合同

`BfnLocalInfluenceResultV1` 是 Batch 13.1 calculator 返回的 readonly、ephemeral envelope，表达：

- exact module、active static model、model version、response family 和 output port；
- 完整 operating point 与同点 output value；
- 每个 input 的 available/unavailable local differential gain；
- output/input gain unit pair；
- 每个 input 的 available/unavailable log elasticity 及 internal reason；
- `within_recorded_domain` 或 `applicability_not_recorded`；
- model Evidence、uncertainty、Provenance、Context、ValidityDomain 与 Catalog identity。

域外请求在 admission 阶段阻断，不形成看似正常的 result。Result 不包含用户界面文案。

## Batch 13.2 网络组合合同

`BfnNetworkInfluenceRequestV1` 绑定 `contractVersion = 1.0`、`scope = network_static_output`、exact `outputMonitorId`，以及该目标上游实际参与 active response 的全部外部 Input Source 工作点。每个工作点包含 exact `inputSourceId`、finite non-negative value 和 Input Source output port 的 exact unit。用户不填写内部 Module input。

纯 `assessBfnNetworkInfluenceRequest()` 从 selected Output Monitor 沿 enabled Edge 反向解析目标闭包。它对每个相关 Module 调用 local admission 取得实际 active-response inputs，并要求每个必要 input 恰好一条 enabled incoming Edge。目标外 Input Source、Module、Edge、环路和 applicability 不进入当前请求。目标闭包的 missing/duplicate input、unknown endpoint、科学 identity 不一致、unit 不兼容、Accumulator 或 directed cycle 均 fail closed。

纯 `calculateBfnNetworkInfluence()` 按目标闭包拓扑顺序传播工作点。每个 Module 通过 `calculateBfnLocalInfluence()` 取得同一点 production output、analytic local gains、applicability 和 Evidence。网络层不建立第二套 static evaluator。

对 external source `u`，source 处初始化 `du/du = 1`。单位坐标经过 Edge 时使用：

```text
unitCoordinateScale
= convertUnit(1, sourceUnit, targetUnit)
  - convertUnit(0, sourceUnit, targetUnit)
```

Module output 使用 forward sensitivity propagation：

```text
dy/du = Σi (∂y/∂xi)(dxi/du)
```

Branching 和 convergence 由该和式组合。主 total influence 不以 path enumeration 计算。对特定 source，`dxi/du === 0` 时该 input contribution 为零，即使对应 local derivative unavailable 也不污染该 source；非零 upstream sensitivity 遇到 unavailable local derivative 时只将该 source 标记 unavailable。精确零 local gain 同样形成零贡献。

Edge 仍是 instantaneous、lossless、identity topology。`unitCoordinateScale` 只改变 numeric derivative coordinate，不是 biological Edge gain，不能保存或显示为 `edge.weight`、`edge.gain` 或 `edge.sensitivity`。

网络结果以 Project Input Source 顺序返回每个相关外部源的总体响应增益、exact-sign direction 与相对敏感度。增益单位继续用 `BfnDerivedGainUnit` 表示 Output Monitor unit / Input Source output unit。直接 Input Source → Output Monitor 支持同一科学量的 identity transmission 与单位坐标换算。

每个 relevant Module 的 `outside_recorded_domain` 阻断正式网络结果，并保留 module/input/current/range 供自然展示。只出现 `applicability_not_recorded` 时保留数学结果，并将 network applicability 记为 `applicability_not_recorded`。

结果逐模块保留 active model ID/version、Evidence、uncertainty method、model provenance、Context、ValidityDomain、Catalog identity 与 interpretation basis，不创建 synthetic network Evidence grade。Batch 13.2 只使用 nominal parameters，不进行 numerical uncertainty propagation。

Batch 13.2 correction 同时收紧输入预填并保留 Context caveat。static `fixed_value` 或 dynamic `constant` 只有在 specification unit 与 Input Source output port unit exact equal 时才可预填；不同单位即使量纲兼容也保持空白。成功结果只对 selected target relevant closure 内 enabled Module→Module Edge 复用既有 Context applicability 比较，并保留 exact per-edge state/checks。mismatch、uncertain 与 unavailable 作为非阻断 scientific caveat 跟随结果，目标外 Context 差异不进入快照。

Path contribution breakdown 在当前实现中未提供。总体作用已覆盖分支与汇合；未来路径明细只能作为 secondary audit detail，并保持与 forward-propagated total 的一致性和完整性安全上限。

## Batch 13.3 局部神经网络近似合同

`BfnLocalAnnApproximationRequestV1` 使用 `contractVersion = 1.0`、`scope = network_local_ann_approximation`、exact Output Monitor 和 Batch 13.2 的同一 external operating point 语义。入口 availability、target closure、source discovery 与 conservative prefill 均直接委托 Batch 13.2 presentation/admission；calculator 将请求直接交给 corrected `calculateBfnNetworkInfluence()`。它不重新求导，不重新传播 network gain。

每个相关 Module 的 input weight 直接引用 Batch 13.1 返回的 local differential gain。对同一 module operating point：

```text
b = y0 - Σ wi xi0
```

其中 `wi` 的单位仍为 module output unit / downstream module input coordinate unit，bias unit 等于 module output unit。unit-coordinate conversion 不折入 module-local weight。每个 multi-input module 保留全部 input identity、多个 weights 和一个 bias。模块重构满足 `Σ wi xi0 + b ≈ y0`。

所选外部 Input Source 到 Output Monitor 的 overall weight 直接引用 corrected Batch 13.2 `totalDifferentialGain`。network bias 由当前网络输出和 external operating point 直接计算：

```text
B = Y0 - Σ Ws Us0
```

它不由 module biases 相加。global weight 单位为 Output Monitor unit / Input Source output port unit，global bias unit 为 Output Monitor unit；网络重构满足 `Σ Ws Us0 + B ≈ Y0`。

`BfnLocalAnnApproximationResultV1` 保留 target、operating point、current output、module approximations、network approximation、ValidityDomain applicability、Phase 0 Context snapshot、underlying module Evidence 与 interpretation basis，且固定 `persistence = ephemeral`。bias 是局部 affine intercept，不等同于 basal expression、leak、background、threshold shift 或 initial state。结果只使用 nominal parameters，不创建 ANN Evidence grade，也不传播 weight/bias uncertainty。

完整近似要求每个相关 Module 的每个 active input 都存在 finite analytic local differential gain。任一局部导数 unavailable 时 fail closed，即使 Batch 13.2 因 upstream sensitivity 精确为零仍能形成某个 external total gain。域外工作点不生成结果；Accumulator / Signal Pool、feedback 与 numerical differentiation fallback 继续排除。direct Input Source→Monitor 可形成 overall mapping，同时保持 `moduleApproximations = []`。paired first-order module 只采用 steady-state response，τ 不成为 weight 或 bias。

该结果是 one explicit operating point 附近的 local first-order explanatory view。它不是 trained/learned ANN、全局替代模型、新实验结果或 range-fitted regression；当前 Batch 不定义近似质量半径。

## Batch 13.4 动态增益合同

`BfnDynamicGainRequestV1` 使用 `contractVersion = 1.0`、`scope = network_dynamic_periodic_gain`、exact Output Monitor、Batch 13.2 的同一 external operating point 语义，以及 `perturbation.periodHours > 0`。static 与 dynamic Project 均可进入分析；支持性由 selected target closure 内实际 effective model kinds 决定。

calculator 先调用 corrected `calculateBfnNetworkInfluence()`，并直接复用其 target closure、source/module order、baseline output、local static gains、ValidityDomain、Context 和 Evidence。Batch 13.4 不重新求 source closure，不实现第二套 response evaluator，不调用 simulation runtime。

quasi-static module input 的 local transfer 为 `H = g + 0j`。first-order module input 使用固定生产语义 `tau dy/dt = f(x) - y`，在 `omega = 2*pi/T` 下采用 `H(j*omega) = g / (1 + j*omega*tau)`。`tau` 只读取 active dynamic model 的 exact nominal `tau.value`，单位必须为 `h` 且大于 0；不复用 simulation trajectory 的 tau floor，不读取 `initialState`、`durationHours`、`timeStepHours`、run snapshot 或 `dynamicMetrics.frequencyGain`。

网络传播沿 Batch 13.2 admitted target DAG 执行 complex sensitivity sum/product。Edge 只应用 `convertUnit(1) - convertUnit(0)` 的 numeric coordinate scale，不拥有 gain、weight、phase 或 dynamic field。static-only target 的 complex gain 对周期不敏感。Batch 13.2 继续保留 per-source unavailable containment；Batch 13.4 在 complex propagation 前要求 target closure 内每个 relevant active input 的 local differential gain available，任一 unavailable 均整体 fail closed，包括 exact-zero upstream sensitivity 后方的 unavailable derivative。

结果包含 baseline output、per-source formal signed DC gain、current-period dynamic gain magnitude 与 phase、module transfer details、applicability、Context caveat 和 Evidence references。`dcGain` 直接来自同一 Batch 13.2 source 的 `totalDifferentialGain`，不重新计算。module details 按 input 保留 signed local static gain、dynamic kind、exact first-order tau、current magnitude 与 phase。正 quasi-static gain phase 为 `0 deg`，负 gain phase 为 `180 deg`，精确零幅值相位 unavailable。结果 readonly、ephemeral、nominal，不创建 synthetic network Evidence grade，不传播 uncertainty。

Accumulator / Signal Pool 在 target closure 内返回 `integrator_reference_state_unavailable`；target feedback 返回 `feedback`。off-target Accumulator、feedback、Context mismatch 或 applicability caveat 不进入所选目标结果。

## Batch 13.1 UI 表达

入口位于 selected-module Inspector，中文为“分析输入作用…”，英文为 “Analyze input influence…”；它打开沿用科研工作台视觉语言的右侧 Drawer。

普通用户界面围绕当前任务展示分析对象、分析条件、固定端口单位、已记录范围、当前输出、作用方向、局部响应增益、相对敏感度、适用性和模型依据。输入值初始为空，关闭 Drawer 后丢弃；编辑任一输入立即清除旧结果。域外条件只显示阻断原因与允许范围，不显示正式 gain。适用范围未完整记录时保留数学结果，并在结果附近明确说明。

公式、Jacobian、gradient、partial derivative、chain rule、matrix notation、OperatingPointVector 和 differentiation terminology 不进入默认主界面。本合同文档中的公式不构成 UI 展示要求。

## Batch 13.2 UI 表达

入口位于 selected Output Monitor Inspector，中文为“分析网络作用…”，英文为 “Analyze network influence…”。目标闭包支持时打开右侧科研 Drawer；Accumulator、反馈、必要输入缺失和 response invalid 分别显示自然禁用原因。

Drawer 只列出目标闭包实际使用的外部 Input Sources。static `fixed_value` 与 dynamic `constant` 仅在 specification/port unit exact equal 时使用 Project value 预填，其余输入规格和不同单位配置保持空白。结果展示当前输出、逐外部源作用方向、总体响应增益、相对敏感度、network applicability、必要 Context caveat 和折叠的逐模块分析依据。编辑任一条件清除旧结果，关闭后丢弃全部条件并恢复焦点。

域外工作点不展示总体结果，同时显示自然 module/input 名称、当前值和 recorded range。first-order 路径统一显示一次 steady-state boundary；直接传递路径说明没有功能模块转换。普通 UI 不显示内部公式、raw identity、unit-coordinate scale 或 issue code。

## Batch 13.3 UI 表达

selected Output Monitor Inspector 提供“神经网络近似 / 生成神经网络近似…”入口；英文为 “Neural Network Approximation / Build neural network approximation…”。Drawer 先明确 target output 和当前 external input conditions，再展示 overall input weights、近似偏置、current output、local-only boundary、紧凑 module weight/bias table 与折叠的分析依据。普通 UI 不显示 Jacobian、Taylor expansion、matrix、R²、NRMSE、training 或 solver terminology。

成功结果启用“生物网络 / 神经网络近似”视图切换。ANN view 复用原 topology、node positions 和 graph engine，只把 derived module-input weights 以 signed numeric labels 放在对应 incoming connection 附近；完整 unit 同时存在于 Drawer table 与 accessible tooltip/label。`edgeId` 仅用于定位，overlay identity 绑定 `targetModuleId + targetInputPortId`。Edge 不拥有 weight，画布不以线宽、发光、热图或颜色强度编码 magnitude。module bias 保持在 Drawer 中，避免画布拥挤。

Overlay readonly、ephemeral、non-editable。改变任一条件、关闭 Drawer 或切换 Project 都会清除 result 和 overlay，并回到 Biological Network view。Context mismatch/uncertain、applicability not recorded、first-order 与 direct transmission 以简洁自然文案跟随；outside domain 或不完整局部线性化不生成覆盖。

## Batch 13.4 UI 表达

selected Output Monitor Inspector 提供“分析动态作用…”入口；英文为 “Analyze dynamic influence…”。Drawer 标题为“动态作用分析 / Dynamic Influence Analysis”。static-only valid target 可直接分析；target Accumulator、feedback、missing input 与 response invalid 显示自然禁用原因。Drawer 展示 target output、周期、external input conditions、基线输出、signed slow-change effect、current response magnitude、phase relation、applicability、Context caveat、折叠动态模块明细与独立分析依据。

输入值委托 Batch 13.2 prefill：static exact same-unit `fixed_value` 与 dynamic exact same-unit `constant` 可预填，其他 specification 或单位不匹配保持空白。动态模块明细按 input 显示瞬时/一阶类型、signed local static gain、时间常数、current magnitude 与 phase；完整线性化失败显示自然模块名。周期默认空白且必须大于 0 h。编辑任一 baseline 条件或周期立即清除旧结果。关闭 Drawer 或切换 Project 丢弃暂存结果。普通 UI 不显示 raw complex number、internal issue code、Laplace notation、Bode、simulation、duration/timeStep 或 direction column。

## 稳定 admission issue

当前内部 issue 至少覆盖：

```text
module_not_found
module_identity_conflict
static_model_missing
static_interpretation_unsupported
dynamic_only_model
input_value_missing
input_value_duplicate
unexpected_input
input_port_invalid
output_port_invalid
unit_mismatch
value_non_finite
value_negative
outside_validity_domain
applicability_not_recorded
model_contract_invalid
request_contract_invalid
```

这些 code 服务于内部控制流和测试，不直接作为普通用户文案。

## 当前实现与后续边界

Batch 13.1 已实现 nominal analytic derivative calculator、ephemeral local influence result、selected-module Drawer、中文/英文文案与 applicability admission；correction 已将 Hill derivative 的 `safeK/safeN` 语义和 production evaluator 对齐。Batch 13.2 已实现 target-scoped network admission、工作点与前向敏感度传播、ephemeral network result、selected-monitor Drawer、逐模块 Evidence 保留及自然 fail-closed 说明；本轮 correction 增加 exact-unit conservative prefill 与 target-scoped Context snapshot。Batch 13.3 已实现完整 local ANN affine contract、Output Monitor workflow 与 existing-canvas derived overlay。Batch 13.4 已实现 selected Output Monitor dynamic gain analysis、complex small-signal propagation、first-order phase/magnitude 与双语 Drawer。

当前未实现范围包括：

- numerical differentiation production fallback；
- network uncertainty propagation、confidence interval、posterior、Monte Carlo、Sobol 或 global sensitivity；
- path contribution breakdown、feedback solver 与 closed-loop interpretation；
- frequency sweep、Bode plot、closed-loop dynamic solver 与 simulation snapshot linearization；
- approximation-quality radius 与 local weight/bias uncertainty；
- interpretation persistence、cache、export schema。

Batch 13.0、Batch 13.1 与 Batch 13.2 均为 `Master Correction Review PASS / CANDIDATE / not FROZEN`。Batch 13.2 reviewed correction 为 `f62babfa2af09156c711792d362fab687270f42c`。Batch 13.3 为 `Master Review PASS / CANDIDATE / not FROZEN`，reviewed implementation 为 `e0ce3a1cee0eff68a28a40edb4bfbd8a66ac3f44`。Batch 13.4 original candidate `11f931ef0bbdeb031f5b337dcf22a9b600fbacfc` 的 Master Review 结论为 FIX；当前 correction 为 `CANDIDATE / correction implementation complete / awaiting Master Correction Review / not FROZEN`，不进入 unified freeze。
