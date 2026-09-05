# BFN 局部神经网络近似

## 功能定位

神经网络近似把已有生物网络在一个明确输入工作点附近表示为权重与近似偏置，帮助用户比较各模块及外部输入在当前条件下的局部作用。完整 biological network 始终是 source of truth；近似结果是 `BFN-INTERPRETATION 1.0` 的只读派生视图。

该功能对应 Batch 13.3，状态为 `CANDIDATE / implementation complete / awaiting Master Review / not FROZEN`。它不表示 trained neural network、learned model、全局生物学真值、新实验结果或 working-range regression。

## 请求与单一计算路径

`BfnLocalAnnApproximationRequestV1` 固定包含：

- `contractVersion = 1.0`；
- `scope = network_local_ann_approximation`；
- exact `outputMonitorId`；
- selected target 全部 relevant external Input Sources 的 explicit operating point。

source discovery、target closure、structural admission、unit-coordinate propagation、ValidityDomain 与 Context semantics 全部复用 corrected Batch 13.2。UI prefill 同样委托 Batch 13.2：仅 exact same-unit static `fixed_value` 或 dynamic `constant` 可以自动填写；不同单位即使可换算也保持空白。

calculator 直接调用 `calculateBfnNetworkInfluence()`。后者逐模块委托 `calculateBfnLocalInfluence()`，所以 Batch 13.3 不增加 response evaluator、derivative implementation、source-closure algorithm 或 network sensitivity propagation。

## Module 局部表示

对 module response `y = f(x1, …, xn)` 及当前工作点 `x0`，每个 input weight 直接等于 Batch 13.1 local differential gain：

```text
wi = local differential gain for input i
b  = y0 - Σ wi xi0
```

每条 input record 保留 exact `inputPortId`、operating value/unit 与 `BfnDerivedGainUnit`。multi-input module 具有多个有身份的 weights 和一个 bias，不压缩为单一“module weight”。bias 可以为正、负或零，必须 finite，单位等于 module output unit。

在当前工作点满足重构不变量：

```text
Σ wi xi0 + b ≈ y0
```

近似偏置只表示 affine intercept。它不等同于 basal expression、leak、constitutive expression、environmental background、threshold shift 或 initial state。

## Network 总体表示

对 selected external inputs `Us` 与 Output Monitor output `Y`，每个 overall weight `Ws` 直接等于 corrected Batch 13.2 `totalDifferentialGain`：

```text
B = Y0 - Σ Ws Us0
Y ≈ Σ Ws Us + B
```

global bias 从当前 network output、external operating point 与 total source gains 直接计算，不把 module biases 相加。其单位等于 Output Monitor unit；每个 overall weight 的单位为 Output Monitor unit / Input Source output port unit。

在当前工作点满足：

```text
Σ Ws Us0 + B ≈ Y0
```

## 单位语义

Module-local weight 始终以 downstream module input coordinate 求导：

```text
module output unit / target module input unit
```

若 upstream output port 与 downstream input port 使用不同但兼容的单位，Edge 上的 numeric coordinate conversion 不折入 module-local weight。overall source weight 才沿 Batch 13.2 的网络传播自然包含 source-to-target coordinate changes。`BfnUnit` 不扩展 compound enum；所有 weight unit 使用既有 output/input pair。

## 完整性与 fail-closed 边界

Batch 13.3 只生成完整 local ANN approximation。任一 relevant module active input 的 analytic local differential gain unavailable 时，整个近似拒绝，即使该模块位于某个精确零 upstream sensitivity 后方、Batch 13.2 仍能形成部分 external source effect。

- `outside_recorded_domain`：不生成结果；
- `applicability_not_recorded`：保留数学结果并显示范围记录不完整；
- Context mismatch / uncertain / unavailable：继承 Phase 0 target-scoped snapshot，保留结果并显示必要 caveat；
- Accumulator / Signal Pool：没有普通 static input-output response，不构造 weight 或 bias；
- feedback：不执行 closed-loop linearization、stability 或 solver；
- first-order module：只使用 steady-state static response，τ 不进入 weight 或 bias；
- direct Input Source→Monitor：生成 overall mapping，`moduleApproximations` 保持空数组，不伪造 module。

计算只使用 underlying model nominal parameters。当前合同不传播 weight uncertainty、bias uncertainty 或近似质量半径。

## 与既有 range-fit ANN 的隔离

`src/features/bfn/annApproximation.ts` 的既有能力对 working domain 采样并进行 least-squares affine fit，使用 R²、NRMSE 与 `analysis.annThresholds` 判断 accepted/rejected。Batch 13.3 使用 one explicit operating point 与 analytic local gains，两者的 request、result、threshold 和 UI 语义完全分离。

Batch 13.3 不调用 `buildAnnApproximation()`，不复用或修改 `BfnAnnApproximation`，不读取 `analysis.annThresholds`，不生成 fit-quality badge。

## 用户工作流

入口只位于 selected Output Monitor Inspector：

- 中文：神经网络近似 / 生成神经网络近似…；
- English: Neural Network Approximation / Build neural network approximation…。

Drawer 依次展示 selected output、relevant external input conditions、overall input weights、近似偏置、current output、local-only boundary、紧凑 module weights/biases 表与折叠的 underlying model Evidence。普通界面使用“权重”和“近似偏置”，不展示 Jacobian、Taylor expansion、chain rule、matrix、R²、NRMSE、training、loss 或 optimizer vocabulary。

域外与不完整局部线性化显示自然模块名和可理解原因，不暴露 raw internal issue code。first-order、direct transmission、applicability not recorded 与 Context caveat 均靠近结果表达，并使用文字而非只依赖颜色。

## Canvas 派生覆盖

成功结果启用“生物网络 / 神经网络近似”切换。ANN view 复用现有 topology、node positions 与 canvas engine。每个 label 的科学身份固定为：

```text
targetModuleId
targetInputPortId
derived local weight + unit
edgeId (positioning only)
```

signed numeric weight 显示在对应 incoming connection 附近，完整 output/input unit 存在于 accessible label/tooltip 与 Drawer table。相关图正常显示，目标外图可适度淡化。Canvas 不用 line thickness、bright magnitude color、glow 或 heatmap 编码数值大小。module bias 留在 Drawer，避免网络画布拥挤。

Overlay 不修改 `BfnIdealEdge`，不提供 weight/bias 编辑、拖动、保存或“应用到生物模型”操作。画布图例明确说明：连线旁数值表示下游模块在当前条件下的局部权重；原网络连接本身不带权重。

## 生命周期与纯度

result 与 overlay 均固定 `persistence = ephemeral`。修改任一分析条件、关闭 Drawer 或切换 Project 会清除旧结果和覆盖，并回到 Biological Network view。

Calculator pure、deterministic、non-mutating，不访问网络、localStorage、IndexedDB、Workspace 或 Module Library。它不修改 Project、Input Source specification、Module、ModelVariant 或 Edge，也不扩展 BFN-IR 2.3、BFN-SIM 2.2 或 persistence schema。

## 实现文件

- `localAnnApproximationTypes.ts`：request/result/issue contract；
- `localAnnApproximation.ts`：Batch 13.2 result 到完整 affine representation 的纯转换；
- `localAnnApproximationPresentation.ts`：Batch 13.2 availability 与 conservative prefill 委托；
- `localAnnApproximationOverlay.ts`：只读 canvas presentation state；
- `BfnLocalAnnApproximationDrawer.tsx`：target conditions、result、caveat 与视图切换；
- `BfnNetworkCanvas.tsx`：existing graph 上的 optional derived labels。
