# Catalog-backed inverse design

## Scope

Catalog-backed inverse design 是 BFN-IR 外部的纯查询层。给定一个 exact AHL/HSL Signal 和明确的浓度—响应目标，引擎比较冻结文献目录中当前可数值运行的单个 Receiver Response。搜索对象是 Response Model，不是 Component、Sender、Effective Pair 或完整 Network。

本阶段不生成网络拓扑，不实例化候选，也不修改当前 Project。现有基于 BfnCalibrationMap 与 Demo calibration candidate 的旧反向设计代码只保留用于历史兼容，不再驱动生产可见的“按目标设计”工作区，其结果不属于本合同。

## Candidate admission

候选 ID 只来自当前 AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST。每次建立搜索空间都重新加载并校验冻结 release，随后为每个 ID 分别重建：

1. trusted BfnCatalogRuntimeCandidate；
2. trusted ReceiverResponseBinding；
3. frozen release presentation 中的 Response、Component、Signal、Parameter Context 与 Source 关系。

只有 release identity、runtime implementation、source model、source parameters、工作范围、数值执行许可和所有关联 ID 同时匹配时，Response 才进入搜索空间。注入式测试适配器只能使候选失效，不能放宽 canonical trust。单个 Response 失败会进入 release-wide `unavailableResponses`，记录 `responseId` 与 canonical `inputSignalId`；其余候选继续构建。兼容字段 `unavailableResponseIds` 继续保留完整 release 诊断。

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

Search Result 的 `unavailableResponseIds` 只投影 `target.inputSignalId` 对应的 release-wide unavailable 记录。其他 Signal 的 admission failure 不会泄漏到当前搜索诊断。

搜索不写 Project、Workspace、Version、Run、Undo/Redo 或当前 simulation result，也不改变 computation signature。同一 Search Space 与 Target 的重复运行结果完全一致。

## Visible workspace contract

生产可见的“按目标设计”页面由 Catalog-backed inverse workspace 驱动，使用固定三栏结构：左侧 Target、中间 Results、右侧 Candidate Inspector / Comparison。首次进入时 Signal 与浓度保持空白，响应阈值初始化为 0.20 / 0.80；页面不会按稳定 ID 顺序自动选择或推荐 Signal。

编辑态保存在 UI-only Target Draft。Draft 允许空字符串、显示单位和未完成输入；只有显式搜索时才转换为合法 `BfnCatalogInverseTarget`。显示支持 pM、nM、µM、mM 与 M，Scientific Target 和 Search Result 始终使用 M。切换显示单位只改变等价数值表达，不改变 Target 的科学含义，也不会把已有结果标为 stale。

Signal 选择后，Target Panel 从当前已构建 Search Space 展示共同可信范围、可覆盖当前范围的候选计数，以及该 exact Signal 的 Host / Strain 选项。“使用此范围”只把共同可信范围写入 Draft，不自动执行搜索。切换 Signal 时保留响应阈值、Hill 目标与机制，清空浓度、EC50 和依赖 Signal 的实验条件。

Candidate Results 只在用户点击搜索后生成。每次显式搜索 fresh rebuild release Search Space；搜索后的 Target snapshot 与 Result snapshot 保持不可变。编辑会改变科学 Target 的字段时，旧结果继续可见并标记为 stale；显示单位切换不会产生 stale。新搜索会清空候选详情与手动比较选择。

结果按 matched、near-match 与 not-applicable 三组展示。Matched 不编号、不宣称“最佳”；Near Match 显示未满足的具体 Criterion 与模型值；Not Applicable 显示 working range、Context 或 trusted evaluation 的可读原因，并且没有曲线。Candidate Inspector 的低点、高点和 61 点响应曲线直接来自 `result.evaluation`。用户可以显式勾选最多 3 个可求值候选，在右栏比较归一化曲线和科学参数；系统不自动选择 Top 3。

## Batch 8.2.1 Scientific UX and chart integrity

Target Panel 的 Host 与 Strain 继续构成可选 exact Context filter。选择 Signal 后，即使 Host 保持“任意”，Strain 也会列出该 exact Signal 的全部真实非空菌株并可单独搜索；选定 Host 后，Strain 选项收窄为该 Host 下的真实组合。Host 改变时，仍合法的 Strain 保留，不兼容的 Strain 清空。该联动只约束 UI Draft，不改变 engine validation 或 admission contract。

搜索按钮实时依赖当前 Draft 的完整性和 validator 结果。无效 Draft 立即展示前两项问题并禁用搜索；weak-response-separation warning 保持可见且不阻止搜索。按钮启用后，点击仍会 fresh rebuild Search Space、重新构建 Target 并再次验证，旧结果与 stale 语义保持不变。

可见页面使用单层任务标题：“设计目标 / Design target”“匹配结果 / Matching results”“响应详情 / Response details”。结果区同时显示相关响应总数与“对比 x / 3”，Near Match 行以“未满足 n 项 · 条件”概括差距，Not Applicable 保持无曲线。实验背景不同的手动比较继续显示归一化比较边界提示。

响应图只消费 `candidate.evaluation.curve` 提供的 61 个点，不生成目标曲线或替代模型。横轴为带单位的 log 浓度，宽量程使用 3–5 个可读整十倍刻度；纵轴固定显示 0、0.5、1。低点上限与高点下限各以一段短水平线和端点圆标注，分别锚定 Target 的低、高浓度，并共享于单候选与多候选视图。图内文字、图例、科学表格与结果元数据使用 10–11 px 的桌面可读字号。

## Candidate evidence and explicit add

每个候选以 `responseId` 作为反向设计与 Catalog 之间的唯一身份桥。Matched、Near Match 与 Not Applicable 都可以尝试打开证据；反向匹配状态只说明当前 Target 的数值核对结果，不代表该 Response 具备运行或添加资格。Candidate Inspector 的紧凑证据摘要只展示主要来源、Host / Strain、当前模型可信范围和生物学机制；Comparison 表头提供同一 `responseId` 的文献入口，不提供直接 Apply。

文献入口打开既有 Catalog Full Detail Drawer，并复用 fresh `buildBfnCatalogDetail`、`BfnCatalogDetailView` 与 `BfnCatalogInstantiationPanel`。打开、返回和关闭详情只改变 Overlay，不切换一级工作区，不修改 Target Draft、Search Result、stale 状态、当前候选或比较选择，也不写入 Project、Undo/Redo、Run 或 computation signature。详情构建异常在 Drawer 内转换为可返回目录的本地化错误状态。

只有 fresh Full Detail 判定为 runnable 的 Response 才显示现有 Add Panel。空项目默认创建一个可信 Response Module 和匹配 Input Source；存在兼容来源时默认只创建 Module。两种方式都不自动连线、不创建或修改 Output Monitor，也不自动运行。用户点击 Add 后，`instantiateBfnCatalogResponse` 形成一次原子项目编辑；成功后切回 Network Design 并选中新 Module，一次 Undo 恢复添加前的完整项目。Catalog 状态变化、详情失效或实例化失败均 fail closed，不写入部分对象或历史步骤。

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
- 自动连线与自动运行；
- 从比较页直接实例化候选；
- 非 runnable Response 的网络实例化。
