# Catalog-backed inverse design

## Scope

Catalog-backed inverse design 是 BFN-IR 外部的纯查询层。给定一个 exact AHL/HSL Signal 和明确的浓度—响应目标，引擎比较冻结文献目录中当前可数值运行的单个 Receiver Response。搜索对象是 Response Model，不是 Component、Sender、Effective Pair 或完整 Network。

本阶段不生成网络拓扑，不实例化候选，也不修改当前 Project。现有基于 BfnCalibrationMap 与 Demo calibration candidate 的旧反向设计继续服务原界面，其结果不属于本合同。

## Candidate admission

候选 ID 只来自当前 AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST。每次建立搜索空间都重新加载并校验冻结 release，随后为每个 ID 分别重建：

1. trusted BfnCatalogRuntimeCandidate；
2. trusted ReceiverResponseBinding；
3. frozen release presentation 中的 Response、Component、Signal、Parameter Context 与 Source 关系。

只有 release identity、runtime implementation、source model、source parameters、工作范围、数值执行许可和所有关联 ID 同时匹配时，Response 才进入搜索空间。注入式测试适配器只能使候选失效，不能放宽 canonical trust。单个 Response 失败会进入 unavailableResponseIds，其余候选继续构建。

Calibration candidate、compatibility-only、reference-only、Sender、Effective Pair 和项目注册表中的 calibration map 均不参加搜索。

## Exact signal identity

Target 和 Candidate 均使用 inputSignalId。入池条件固定为：

    candidate.inputSignalId === target.inputSignalId

显示名、常用缩写、大小写归一化、子串搜索和立体构型合并不参与科学身份判断。ahl.3oc6.l 与 ahl.3oc6.stereo-unspecified 是不同 Signal；后者没有 trusted runtime response 时不会出现在 searchable Signal 列表中。

## Target contract

Target 包含：

- exact inputSignalId；
- lowConcentrationM 与 lowResponseMaximum；
- highConcentrationM 与 highResponseMinimum；
- 可选 EC50 范围；
- 可选 Hill coefficient 范围；
- any、activation 或 derepression 生物机制；
- 可选 exact Host / Strain filter。

Engine 内部浓度单位固定为 M，输出固定解释为 normalized_reporter_expression、dimensionless、0–1。默认响应阈值 0.20 与 0.80 只是创建 Target 的初始值，不是实验判定标准。浓度必须由调用方明确提供；共同可信范围不会自动写入 Target。

## Target validation

Target validator 是纯函数，主要规则为：

- Signal 必须存在于当前 fresh searchable Signal 集合；
- lowConcentrationM 大于 0；
- highConcentrationM 大于 lowConcentrationM；
- 两个响应阈值均位于闭区间 [0, 1]；
- EC50 与 Hill 可选范围的端点必须有限、为正且 minimum 不大于 maximum；
- biological direction 只能是 any、activation 或 derepression；
- Host / Strain 必须来自该 exact Signal 的真实候选 Context 组合。

lowResponseMaximum 不小于 highResponseMinimum 时返回 weak-response-separation warning，Target 仍可搜索。整体无效的 Target 由 BfnCatalogInverseDesignError 明确拒绝。

## Context filtering

Host 与 Strain 只作为硬筛选条件，不产生相似度或性能分。未启用某字段时，Candidate 的相应值可以为 null。启用筛选后执行 exact equality；Candidate 未记录该字段时分别返回 host-unrecorded 或 strain-unrecorded。

Candidate 的 Context 会在求值前与 canonical Parameter Context 再次核对。复制候选后修改 Host、Strain 或将其置空会触发 trust-unavailable，不会进入数值求值。

## Trusted working range

Target window [xLow, xHigh] 只有在 Candidate 的闭工作范围 [xMin, xMax] 完整覆盖时才具备数值比较资格：

    xMin <= xLow && xHigh <= xMax

超出范围时状态为 not-applicable，原因为 target-outside-working-range，evaluation 为 null。引擎不外推、不 clamp、不缩小 Target，也不施加软惩罚。

computeCommonTrustedRange 返回同一 exact Signal 下全部 admitted Candidate 工作范围的交集；无交集时返回 null。该值只描述当前文献模型的共同覆盖范围，不表示最佳实验范围。countCandidatesCoveringTargetRange 只统计 exact Signal、trust 和工作范围，不执行曲线求值。

## Numerical evaluation

唯一科学数值权威为：

    evaluateReceiverResponse(binding, concentrationM, 'M')

新引擎不调用 generic Hill evaluator，也不重写 4PL。测试注入 evaluator 只能拒绝或逐值核对 canonical 结果；有限但不同的返回值会使该 Candidate 成为 evaluation-unavailable。

Eligible Candidate 在 Target window 内生成 61 个 log-spaced 正浓度点。第 0 点精确使用 xLow，第 60 点精确使用 xHigh，中间点为：

    logX = log10(xLow) + i / 60 × (log10(xHigh) - log10(xLow))
    x = 10^logX

Low response、High response 和全部曲线点来自同一 trusted evaluator。

## Match criteria

启用的 Criteria 包括：

- low-response-maximum：F(xLow) 不大于 lowResponseMaximum；
- high-response-minimum：F(xHigh) 不小于 highResponseMinimum；
- 可选 ec50-range；
- 可选 hill-range。

Low 与 High 失败偏差分别为 actual - requiredMaximum 和 requiredMinimum - actual。EC50 使用数量级偏差：

    K < min: log10(min / K)
    K > max: log10(K / max)

Hill 使用相对偏差：

    n < min: (min - n) / max(min, 1)
    n > max: (n - max) / max(max, 1)

通过项偏差均为 0。

## Matched / Near-match / Not-applicable

- matched：全部硬 Eligibility 与全部启用 Criteria 通过；
- near-match：全部硬 Eligibility 通过，至少一个 Criterion 失败；
- not-applicable：至少一个硬 Eligibility 失败，或 trusted evaluation 不可用。

not-applicable 的 criteria 为空、evaluation 为 null。其他 Signal 的 Response 不会作为大量 not-applicable 混入所选 Signal 的结果。

## Deterministic ordering

Matched Candidate 不做价值排名，只按 componentId 到 responseId 的稳定科学 ID 顺序呈现。

Near Match 使用内部 tuple：

    failedCriteriaCount
    → maximumDeviation
    → sumDeviation
    → responseId

tuple 不写入结果，也不生成 total score、fitness 或 best candidate。所有排序均与语言、显示名和随机数无关。

## Evidence boundaries

Catalog 的 basal 与 maximum 保留为来源参数，不重新解释为 BFN ymin / ymax。Compatibility 的 numericUseAllowed=false，因此不进入 Eligibility、Criteria 或排序。Effective Pair 保持不可拆分，不产生 Sender、Receiver 或 Pair 分数。

结果不包含 burden、noise、uncertainty、genetic stability、quantitative crosstalk 或 response-time score。Shong EsaR 的生物机制保存为 derepression，其可信数学输出仍随 3OC6 浓度增加。

## Search purity

runCatalogInverseDesign(searchSpace, target) 不接收 BfnProject。它返回 Target 的不可变快照、release identity、精确搜索计数、三类结果和不可用 Response ID。

搜索不写 Project、Workspace、Version、Run、Undo/Redo 或当前 simulation result，也不改变 computation signature。同一 Search Space 与 Target 的重复运行结果完全一致。

## Apply-to-network boundary

每个结果保留 responseId，供未来从 Catalog Full Detail 进入现有可信实例化流程。本阶段不提供 Apply Candidate、不自动创建 Module、不连线，也不修改当前 Project。

## Deferred capabilities

本合同暂缓：

- Sender inverse design；
- Network topology search；
- 多 Signal inverse design；
- experimental calibration；
- burden、noise、genetic stability 与 quantitative crosstalk ranking；
- time-response target；
- Medium、温度、reporter、measurement platform、vector 等额外 Context filter；
- Effective Pair decomposition；
- Apply-to-network 与自动连线；
- Batch 8.2 可见 UI。
