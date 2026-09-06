# BFN Dynamic Influence Analysis

该功能对应 Batch 13.4“动态作用分析 / Dynamic Influence Analysis”。reviewed correction `bbf28d649f91dc39c3624a066969e71f9e538265` 已通过 Master Correction Review；经 Batch 13 Unified Final Review 后，现随统一 freeze checkpoint 正式登记为 `FROZEN`。它在显式工作点和正周期下计算 selected Output Monitor 的 nominal analytic small-signal dynamic influence，不表示仿真轨迹、Bode 曲线、频率扫描、新实验结果或不确定性传播。

## 来源与范围

`calculateBfnDynamicGain()` 先执行 Batch 13.4 admission，再调用 corrected `calculateBfnNetworkInfluence()`。Batch 13.2 是 target closure、external source order、module order、baseline output、local static gains、ValidityDomain、Context、Evidence 和 signed DC gain 的唯一来源。Batch 13.4 不重新解析 closure，不实现第二套 response evaluator，也不调用 simulation runtime。

请求使用 `contractVersion = 1.0`、`scope = network_dynamic_periodic_gain`、exact Output Monitor、Batch 13.2 同一 external operating point 语义，以及 `perturbation.periodHours > 0`。static 与 dynamic Project 均可进入分析；最终支持性由 selected target closure 内实际 effective model kinds 决定。结果 readonly、ephemeral，并且只使用 nominal parameters。

## 稳态与动态传递

static / quasi-static module input 使用 `H = g + 0j`，对所有合法周期保持相同 complex gain、magnitude、phase 和 DC gain。正增益相位为 `0 deg`，负增益相位为 `180 deg`，精确零幅值保持 available magnitude `0`，相位为 unavailable `zero_magnitude`。

first-order module input 的生产方程为 `tau dy/dt = f(x) - y`。在周期 `T` 下使用 `omega = 2*pi/T` 与：

```text
H(j*omega) = g / (1 + j*omega*tau)
```

`tau` 只读取 active dynamic model 的 exact nominal `tau.value`，单位必须为 `h` 且大于 0。calculator 不复用 simulation tau floor，也不读取 `initialState`、`durationHours`、`timeStepHours`、run snapshot 或 `dynamicMetrics.frequencyGain`。

## Signed DC gain 与完整线性化

每个 `result.perSource[].dcGain` 直接引用同一轮 Batch 13.2 `networkInfluence.result.perSource[].totalDifferentialGain`，保持 value、availability、reason 与 gain unit 一致。该字段是正式 signed slow-change effect；有限周期下的 magnitude 不替代 DC 字段。低频极限中 complex response 趋近 signed DC response。

Batch 13.2 保留 source-specific unavailable containment。Batch 13.4 要求 complete analytic dynamic interpretation：Batch 13.2 成功后、complex propagation 前，calculator 检查 target closure 内所有 module `localInfluence.perInput[].localDifferentialGain`。任一 relevant active input unavailable 即返回 `incomplete_local_dynamic_linearization`，包含 module、input 与 reason；即使该导数位于 external source 的 exact-zero upstream sensitivity 后方也整体 fail closed。该 gate 不修改 Batch 13.2 行为。

## 网络传播与边界

Complex sensitivity 沿 Batch 13.2 admitted target DAG 传播。Input Source 对自身初始化为 `1 + 0j`，对其他 source 初始化为 `0 + 0j`。每条 relevant Edge 只应用 unit coordinate scale：

```text
convertUnit(1, sourceUnit, targetUnit) - convertUnit(0, sourceUnit, targetUnit)
```

Edge 不拥有 gain、weight、phase 或 dynamic field。多输入与 branch/convergence 使用 complex sum/product。Accumulator / Signal Pool 在 target closure 内返回 `integrator_reference_state_unavailable`，target feedback 返回 `feedback`；off-target unsupported nodes 不进入所选目标。

每个 module transfer 保留 static model ID/version、dynamic kind、Evidence、Context reference 和 ValidityDomain。first-order module 额外保留 dynamic model ID/version 与 exact tau。`baselineOutput`、`applicability` 和 `contextApplicability` 均继承 Batch 13.2，不创建 synthetic network Evidence grade。

## UI 表达

selected Output Monitor Inspector 的入口为“分析动态作用…” / “Analyze dynamic influence…”，Drawer 标题为“动态作用分析” / “Dynamic Influence Analysis”。输入条件直接复用 Batch 13.2 prefill：static Project 只预填 exact same-unit `fixed_value`，dynamic Project 只预填 exact same-unit `constant`；其他 specification 或单位不匹配时保持空白。

逐 source 结果显示“慢变化作用 / Slow-change effect”的 signed DC value、“当前时间尺度的响应幅度 / Response magnitude”和“相位关系 / Phase relation”。折叠的“动态模块明细 / Dynamic module details”按 module input 分行展示动态类型、signed local static gain、时间常数、当前幅度和相位。quasi-static 显示“瞬时响应”与 `—`；first-order 显示“一阶动态”与 `tau = <value> h`。Evidence 继续位于独立“分析依据”区域。

完整线性化失败时，用户看到自然说明和可定位的模块名称，不显示 internal issue code 或 derivative reason。编辑条件或周期立即清除旧结果；关闭 Drawer 或切换 Project 丢弃暂存结果。普通 UI 不显示 raw complex number、Laplace notation、Bode、simulation、duration/timeStep 或 direction column。

## 实现边界

实现集中在 `src/features/bfn/interpretation/`、selected-monitor Drawer、双语文案和相关文档/测试。Batch 13.2 helper 保留 reviewed 13.4 candidate 带入的 reason-classification adjustment；supported-network semantics 未改变。本冻结不修改 BFN-IR schema、BFN-SIM runtime、Accumulator / Signal Pool runtime、unit semantics、response equations、existing ANN range-fit、Batch 13.3 local ANN math、persistence、export schema、Sender source 或 package dependencies。
