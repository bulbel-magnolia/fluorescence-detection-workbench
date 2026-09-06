# BFN Dynamic Gain Analysis

该功能对应 Batch 13.4。实现状态为 `CANDIDATE / implementation complete / awaiting Master Review / not FROZEN`。它提供 selected Output Monitor 在一个显式工作点和一个正周期下的 nominal analytic small-signal dynamic gain；它不表示仿真轨迹、Bode 曲线、全局频响扫描、新实验结果或不确定性传播。

## 来源与范围

`calculateBfnDynamicGain()` 先执行 Batch 13.4 admission，再调用 corrected `calculateBfnNetworkInfluence()`。Batch 13.2 仍是 target closure、external source order、module order、baseline output、local static gains、ValidityDomain、Context 和 Evidence 的唯一基线来源。Batch 13.4 不重新解析 source closure，不实现第二套 response evaluator，也不调用 simulation runtime。

请求使用 `contractVersion = 1.0`、`scope = network_dynamic_periodic_gain`、exact Output Monitor、Batch 13.2 同一 external operating point 语义，以及 `perturbation.periodHours > 0`。结果 readonly、ephemeral，并且只使用 nominal parameters。

## 传递函数

对 quasi-static module input，local transfer 为 `H = g + 0j`。正增益相位为 `0 deg`，负增益相位为 `180 deg`，精确零幅值保持 available magnitude `0`，相位标记为 unavailable `zero_magnitude`。

对 first-order module input，生产方程固定为 `tau dy/dt = f(x) - y`。在周期 `T` 下使用 `omega = 2*pi/T`，local transfer 为：

```text
H(j*omega) = g / (1 + j*omega*tau)
```

其中 `tau` 只读取 active dynamic model 的 exact nominal `tau.value`，单位必须为 `h` 且大于 0。不会复用 simulation 中用于旧轨迹计算的 tau floor，也不会读取 `initialState`、`durationHours`、`timeStepHours`、`dynamicMetrics.frequencyGain` 或 run snapshot。

## 网络传播

Batch 13.4 沿 Batch 13.2 admitted target DAG 传播 complex sensitivity。Input Source 对自身初始化为 `1 + 0j`，对其他 source 初始化为 `0 + 0j`。每条 relevant Edge 只应用 unit coordinate scale：

```text
convertUnit(1, sourceUnit, targetUnit) - convertUnit(0, sourceUnit, targetUnit)
```

Edge 不拥有 gain、weight、phase 或 dynamic field。module local transfer 只来自对应 Batch 13.2 local differential gain 和 module dynamic kind。多输入与 branch/convergence 使用 complex sum/product。不可用局部导数只传播到实际到达该输入的 source；精确零 upstream sensitivity 与精确零 local transfer 按 Batch 13.2 containment 规则保留可计算结果。

Accumulator / Signal Pool 由于缺少 reference state 与普通 transfer 函数，target closure 内 admission 返回 `integrator_reference_state_unavailable`。target feedback 返回 `feedback`。off-target Accumulator、feedback、Context mismatch 或 applicability caveat 不进入所选目标的动态结果。

## Evidence、Context 与适用性

每个 module transfer 保留 static model ID/version、dynamic kind、Evidence、Context reference 和 ValidityDomain。first-order module 同时保留 dynamic model ID/version、exact tau、dynamic Evidence、source datasets、provenance 与 Context。结果不创建 synthetic network Evidence grade，不传播 uncertainty，不记录 ValidityDomain caveat 为结果字段之外的新语义。

`baselineOutput` 直接来自 Batch 13.2 network influence result。`applicability` 与 `contextApplicability` 同样继承 Batch 13.2；Context mismatch、uncertain 或 unavailable 是非阻断解释提示。

## UI 表达

入口位于 selected Output Monitor Inspector，中文为“动态响应分析…”，英文为 “Dynamic Response Analysis…”。只有 dynamic network mode 可启用；static mode、target Accumulator、feedback、missing input 与 response invalid 均显示自然禁用原因。

Drawer 展示分析对象、周期、相关 external Input Source 条件、基线输出、逐 source dynamic gain magnitude 与 phase、适用性、Context caveat，以及折叠的分析依据。输入值只从 exact same-unit dynamic `constant` 预填；周期默认空白。编辑 baseline 条件或周期立即清除旧结果，关闭 Drawer 或切换 Project 丢弃暂存结果。普通 UI 不显示 raw complex number、internal issue code、Laplace notation、Bode、simulation、duration/timeStep 或 direction column。

## 实现文件

- `complexMath.ts`：最小 pure complex helper；
- `dynamicGainTypes.ts`：Batch 13.4 request/admission/result/calculation unions；
- `dynamicGainValidation.ts`：dynamic mode、period、target closure 与 model metadata admission；
- `dynamicGain.ts`：baseline-delegated complex gain propagation；
- `dynamicGainPresentation.ts`：Output Monitor availability 与 conservative prefill；
- `BfnDynamicGainDrawer.tsx`：selected Output Monitor Dynamic Response Analysis workflow。

Batch 13.4 不修改 BFN-IR schema、BFN-SIM runtime、Accumulator runtime、Signal Pool runtime、unit enum、response equations、existing ANN range-fit、Local ANN approximation overlay、persistence、export schema 或 package dependencies。
