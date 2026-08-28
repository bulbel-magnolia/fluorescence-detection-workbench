# 通用生物神经网络建模与设计平台 V2.0

## 平台定位

BIO-NET V2.0 使用 BFN-IR 2.0 作为规范内核。平台把实验剂量—响应、多输入观测和时间序列组织为可组合的功能模块，再完成正向仿真、条件化 ANN 解释和双参数空间反向设计。

平台的核心计算关系为：

```text
Input Source → Functional Module → Ideal Edge → Functional Module → Output Monitor
```

功能模块保存完整响应模型。理想边只执行恒等映射：

```text
静态：u_j = y_i
动态：u_j(t) = y_i(t)
```

边不保存权重、偏置、增益、衰减、延迟、噪声或内部状态。分泌、运输、积累、降解、聚合和资源竞争需要注册为明确的功能模块。

旧版 `baseline / gain / sensitivity` 项目仍保存在原本的本地存储键中，V2 不自动把这些参数改名为完整模型。旧代码保留用于历史项目诊断和显式迁移，不再是“网络设计”页面的默认运行路径。

## BFN-IR 2.0 对象

### Port

端口使用三元组定义：

```text
P = (E, Q, U)
```

- `E`：化学或功能实体，例如 `3OC6-HSL`、归一化启动子活性或报告表达；
- `Q`：量类型，例如 concentration、production_rate、activity 或 expression_level；
- `U`：单位，例如 M、uM、nM、nM/h 或 dimensionless。

直接连接要求实体相同、量类型相同、单位量纲兼容。浓度单位可以自动换算。production_rate 不能直接连接 concentration；这类关系需要积累模块。

一个输出端口可以连接多个下游输入。一个输入端口最多接受一个直接上游来源。信号求和、竞争、比率计算和其他聚合行为位于模块内部。

### FunctionalModule

功能模块包含：

- 输入端口与输出端口；
- 静态或动态完整响应模型；
- 参数估计与 95% 区间；
- 模型上下文；
- 适用域；
- 数据来源；
- 模型版本；
- 证据等级；
- 一个或多个生物实现。

当前演示注册表提供 Hill 激活模块、线性报告传递模块和双输入独立作用模块。全部内置数值标记为 Demo 和未验证数据。

### Context 与 ValidityDomain

上下文记录宿主、菌株、培养基、温度、pH、供氧、增长阶段、质粒骨架、拷贝数范围、诱导协议、测量时间和批次。上下文用于选择模型版本和解释迁移范围，不作为普通输入端口。

适用域保存每个模型得到数据支持的输入范围和时间范围。仿真会在运行前和逐点计算时检查适用域。域外结果继续计算，并明确标记为 extrapolated。

### Evidence grade

V2 直接保存以下证据等级：

- `measured_single_context`
- `measured_multiple_contexts`
- `externally_validated`
- `fitted_from_published_data`
- `mechanistic_model_only`
- `data_driven_prediction`
- `independent_assumption`
- `proposed_unbuilt_design`

多输入缺少交互证据时使用 `independent_assumption`，模型内部同时保存 `independent_unverified`。反向设计生成的候选统一标记为 `proposed_unbuilt_design`。

## Semantic classification layer

BFN-ONTOLOGY-1.0 在 BFN-IR 外提供独立的运行时生物语义分类。Functional Family 回答模块在网络中做什么；Biological Component Family 描述广义生物实现；`BfnModelFamily` 继续回答数学上如何计算；运行资格和证据能力继续由 Catalog 与既有 BFN 合同决定。Ontology 只描述类别，不授予证据、运行、兼容或构建状态。

用户界面按四层理解一个模块：Module Function 表达网络功能，Biological Component Class 表达广义生物实现，Mathematical Model 表达计算形式，Evidence / Runtime 表达证据和当前软件能力。四层由各自权威来源生成并独立呈现。Batch 9.2 的 presentation adapter 只读取 Ontology resolver 结果，将稳定术语转换为本地化名称和搜索词，不写 Project、Run 或 Workspace。

Reporter 的 Functional Family 为 `functional.expression_transfer`，其 Mathematical Model Family 仍为 `linear_transfer`。AHL Sensor 的 Functional Family 为 `functional.signal_response`，其模型 variant 可以是静态 Hill 或动态 first-order。Dual Input 的 `functional.multi_input_integration` 不改变 `independent_unverified` 交互假设。

Catalog Component 只按可信 canonical role 与精确 Component ID 分类；内置模块只按稳定 label key 的 exact software mapping 分类。名称、别名、翻译、端口、数学模型和 static/dynamic 模式都不参与推断。派生 profile 不写入 BFN-IR、Workspace 或 Run。完整术语、assignment、fallback 和科学边界见 [BFN 生物功能语义本体](ontology.md)。

`BfnCatalogModuleSummary.modelFamilyKey` 只表示 Mathematical Model Family presentation，不是 Ontology Functional Family。Function 筛选与分类标签读取独立的 semantic presentation 字段。

## Temporal semantics and compatibility

BFN-IR 外的只读合同层分别描述时间执行、时间证据、端口计算兼容性和实验背景适用性。Static network 的静态模型为 `steady_state`；Dynamic network 优先使用 active dynamic model 并标记为 `stateful_dynamic`，缺少 dynamic model 且存在 static fallback 时标记为 `quasi_static`。Quasi-static 按 `y(t) = F(x(t))` 逐时计算，没有内部状态、延迟或记忆。当前分析模式没有合法模型时才是 `unsupported`。

Temporal Evidence 独立使用 T0、T1、T2、T3 与 `not_recorded`。当前 Catalog-backed static Receiver 为 T0；Built-in first-order Demo 在数学上可以 stateful dynamic 执行，其时间证据保持 not recorded。数学模型族、普通 evidence grade 和 dynamic model 的存在不自动授予 T2/T3。

Port Compatibility 只允许 `output → input`、exact Entity、exact Quantity Type 与 compatible Unit Dimension。`nM → M` 是同一物理量的表示换算；`production_rate → concentration` 是硬冲突，未来需要显式 Signal Pool / Accumulation Module。Scientific Applicability 按 Host、Strain、Medium 与 Celsius Temperature 区分 matched、uncertain 和 mismatched；missing information 产生 uncertain，不按不同 `contextId` 推断生物学冲突。完整合同与延期边界见 [BFN 时间语义、端口兼容性与实验适用性合同](temporal-and-compatibility.md)。

## 静态完整模型

静态求解器支持：

- 固定值输入；
- 一个或多个工作范围输入；
- 工作域笛卡尔扫描；
- DAG 网络组合；
- M、mM、uM、nM 与 pM 自动换算；
- Hill activation、Hill repression、linear transfer、identity 和 independent inputs；
- 参数区间包络传播；
- 适用域检查。

固定值输入只计算当前网络输出，不生成权重或偏置。工作范围输入返回完整输入—输出点集、不确定性带和域外标记。

静态 MVP 使用有向无环网络。反馈线路进入动态模式；固定点、多稳态、稳定性和分岔分析属于后续求解器阶段。

## 动态完整模型

动态求解器当前实现一阶响应模型：

```text
τ · dy/dt = F_static(u) - y
```

每个采样区间使用该一阶模型的指数闭式步进，时间零点严格保留初始状态；即使用户选择大于 τ 的粗时间步，数值结果也保持在前一状态与当前稳态目标之间。

支持的输入形式为：

- constant；
- step；
- pulse；
- periodic；
- custom_time_series（线性插值）。

静态模块可以作为无记忆模块进入动态网络。一阶动态模块保存初始状态和 τ 参数区间。结果包含完整时间曲线、稳态值、上升时间、达峰时间、超调和振荡判定。阶跃输入在条件适用时生成 DC gain；周期输入生成频率增益幅值和相位估计。任意时间序列不强制生成单一动态权重。

通用 ODE、多状态系统和动态反馈按方案开发路线继续扩展。当前界面不会从静态终点曲线推断未经登记的动态模型。

## ANN Approximation

ANN 权重和有效截距属于派生分析对象 `ANNApproximation`，不属于边，也不替代完整模型。

用户选择静态工作范围后，平台在工作域采样完整模型并拟合：

```text
y ≈ W_Ω x + b_eff
```

当前默认门限为：

```text
R² ≥ 0.90
NRMSE ≤ 10%
```

结果同时保存 R²、NRMSE、最大绝对误差和区间覆盖率。满足门限时状态为 `accepted`。超过误差门限时状态为 `rejected`，表示方式保持 `full_nonlinear_model`。扩大工作域可以直接观察非线性增强后近似被拒绝。

## 双参数空间反向设计

反向设计分离：

- 功能参数空间 `θ`：ymin、ymax、K、n、τ 等；
- 生物设计变量空间 `q`：promoter、RBS、copy number、degradation tag、receptor level 和 strain ratio 等。

校准映射表达为：

```text
θ = K_cal(q, c) + η
```

用户设置输入范围、目标阈值、基础输出上限、最大输出下限、响应时间、负载上限、噪声上限和稳定性优先级。平台从已登记校准候选中计算完整预测曲线，并综合评价：

- 功能误差；
- 宿主负载；
- 串扰；
- 输出噪声；
- 预测不确定性；
- 遗传稳定性风险。

结果以候选集合返回。每个候选包含生物设计变量、预测功能参数、完整响应曲线、分项损失、综合损失、来源证据等级和推荐验证实验。平台不输出未经解释的唯一最优设计。

### Catalog-backed inverse design 查询层

上述双参数空间流程作为 legacy demonstration candidate search 代码保留，不再是生产可见的“按目标设计”界面。当前可见工作区使用 Catalog-backed inverse design：它是 BFN-IR 2.0 外部的纯查询层，从冻结 AHL/HSL release fresh rebuild 单个 trusted Receiver Response，按 exact Signal、Context 和工作范围执行可信数值匹配，不读取 calibration map，也不修改 Project、Workspace 或 computation signature。两套逻辑不混接；可见工作区合同与延期边界见 [Catalog-backed inverse design](inverse-design.md)。

生产交互链为 `Target → Match → Evidence → Explicit Add → Network Design`。Candidate 与既有 Catalog Full Detail 只通过 exact `responseId` 连接；证据浏览保持 Target Draft、结果新鲜度、候选选择、比较集合和 Project 不变。匹配分组不授予运行资格，只有 fresh Full Detail 中仍为 runnable 的 Response 才能进入既有 Add Panel。显式添加复用可信实例化路径，形成一次可撤销的原子编辑；默认策略不会自动连线、创建 Output Monitor 或运行模型。

## 模块注册与证据账本

标准注册流程为：

```text
数据检查 → 测量校准 → 候选模型拟合 → 模型比较
→ 参数不确定性 → 适用域 → 模块注册
```

界面“模块与证据库”展示功能模块、实验数据集、上下文和适用域。内部交换格式为 BFN-IR 2.0。SBOL 3 和 SBML Level 3 作为后续标准适配方向展示，当前版本不声明已经完成双向转换。

原有 AHL/HSL V1.1 文献目录继续保留在 `features/modeling/catalog` 中，用于来源追溯和历史项目兼容。V2 模块只有在完成端口、完整模型、上下文、适用域与证据等级登记后才进入 BFN-IR 运行路径。

## 本地存储与导入导出

V2 使用独立本地键：

```text
fluorescence-desktop.bfn-ir-project.v2
fluorescence-desktop.bfn-ir-runs.v2
```

项目 JSON 必须声明：

```json
{
  "schema": "BFN-IR",
  "schemaVersion": "2.0"
}
```

无效结构会被拒绝。导入不会静默修改为可运行模型。最近 20 次运行保存完整模型输出、模型版本、上下文、适用域状态、ANN 派生结果和演示边界。

## 界面结构

默认工作台包含两个一级工作区：

1. **网络设计**：对象索引、端口直接连线、可拖动画布、对象属性、静态/动态运行和底部结果 Dock；
2. **按目标设计**：Catalog-backed Target & Results workspace，提供目标浓度—响应录入、显式搜索、Matched / Near Match / Not Applicable 分组、响应详情和最多 3 个候选的手动比较。

网络设计页固定在应用剩余视窗中，页面本身不纵向滚动。对象索引、画布、属性栏和展开后的结果区分别管理自己的内容溢出。属性栏默认显示模块作用、P=(E,Q,U) 输入输出、最多四个关键参数和模型依据；完整参数、实验条件与关联数据、包含符号与 95% 区间的数学模型、适用域和生物实现按需展开。输入对象首层显示信号、单位和当前分析模式；连接首层只显示源、信号和目标。

结果状态由 `createBfnComputationSignature(project)` 派生。签名包含网络模式、输入规格、模块与当前模型、参数、模型版本、边、输出监视器、动态时长和步长、ANN 门槛，以及求解直接使用的 registry/context/domain/model 数据。节点坐标、选择、Drawer、属性栏、结果 Dock、焦点、滚动位置和更新时间不进入签名。运行时保存签名；当前签名与运行签名相等时结果为 current，不相等时为 stale，因此语义 Undo 回到运行状态会自动恢复 current，布局 Undo/Redo 不改变结果状态。

项目变化先在内存中生效，再经过 320 ms debounce 写入本地存储。节点拖动仍只形成一个历史步骤，连续 pointer move 不再触发同等数量的同步持久化写入。

### Scientific Desktop Visual Language

Batch 3.5 将建模工作台统一为科学桌面软件的视觉语言。界面以 `Pane → Section → Row` 组织信息：项目与分析命令位于两行紧凑工具栏，对象索引、工程画布和属性检查器组成固定三栏工作区，结果使用底部 Dock，模块库使用右侧列表抽屉。属性参数采用对齐的名称、数值和单位列，参数解释只在悬停、聚焦或选择时显示。

主题的规范入口为 `src/theme/tokens.css` 和 `src/theme/scientific-desktop.css`。语义变量覆盖应用、面板、画布、悬停、选中、边框、正文、次级文本、强调色、状态色和荧光信号色；深色主题只替换语义变量，不维护另一套组件样式。常规面板不使用阴影，圆角限制为 2–7 px，强调色表示选择和主操作，绿色表示兼容或成功，洋红色只用于荧光信号和响应曲线。

工程画布保留 20 px 次网格和 100 px 主网格。节点为扁平图元，选中态使用 2 px 强调色边框；连接预览使用虚线与方向箭头。1280×720 下应用不产生页面级水平溢出，侧栏收为图标导航，工具栏、三栏工作区和结果 Dock 继续可见；画布在需要时使用自身滚动区域。

视觉审计图和逐图说明位于 `docs/ui-audit/scientific-desktop/`。本轮只改变界面表达、层级与共享样式，不改变 BFN-IR、求解器、ANN、反向设计、持久化或撤销/重做语义。

### Desktop Surface Consolidation

Batch 3.6 将项目工具栏、运行工具栏、网络工作区和结果 Dock 收拢到一个连续工作台表面。项目与网络名称在同一行呈现，超长名称使用省略号；文件操作保持次要层级，运行操作保留唯一主按钮。外层表面负责边界和圆角，工具栏、三栏工作区、反向设计区与结果 Dock 只使用内部 Divider，不再形成相互分离的卡片。

界面现在区分三类表达：`MetadataLabel` 用于 DEMO、数据来源、保存位置等元数据；`InlineStatus` 用于保存中、已保存、当前结果和旧结果等运行状态；`StatusPill` 继续用于连接、警告、错误和真实验证结果。BFN 证据等级保持原类型不变，展示层通过 `bfnEvidenceTone` 映射为普通证据、外部验证和假设/未构建设计三类语义。数据驱动模型、机制模型和文献拟合使用普通证据色，只有 `externally_validated` 使用成功色，`independent_assumption` 与 `proposed_unbuilt_design` 使用警示色。

概览、采集、导入、记录和设置页共用 `desktop-surface` 外层边界。各页保留原导航和操作，只把内部面板改为相邻 Pane 与 Divider：采集页连接设备条、曲线与控制面板连续；导入页选择区、预览区与格式说明连续；记录页列表与详情连续；设置页按分隔行组织，并在无团队工作区时让隐私说明占满末行。

1440×900 审计图位于 `docs/ui-audit/surface-consolidation/`。1280×720 下顶部严格为两行，Run 按钮保持可见，页面文档宽度等于视口宽度，网络画布和属性检查器继续使用内部滚动。该批次只调整呈现结构、状态用色和共享桌面样式，不改变 BFN-IR、计算签名、求解器、结果新鲜度、历史、直接操作、Undo/Redo、持久化或导入导出语义。

### Scientific Results & Figure Workflow

Batch 4 将分析结果区扩展为可交互、可追溯、可复现的科学图表工作流。稳态结果以主输入值为横坐标，动态结果以时间为横坐标；光标只读取求解器已经生成的采样点，不对相邻点做插值。键盘 Home、End 与方向键和指针使用相同的精确点读取逻辑。

图表支持 X/Y 轴独立设置线性或 Log10 刻度，并可在自动范围和手动范围之间切换。Log10 只接受严格正值；当前数据或手动范围不满足条件时，界面保持可读并给出回退说明。网络响应、参数区间和 ANN 近似可以分别显示或隐藏，重置视图会恢复基于当前结果的默认刻度和系列状态。

参数区间表示模型参数区间传播得到的输出包络，不是统计置信区间。ANN 的 accepted 状态只说明 R² 与 NRMSE 达到当前近似质量门槛，不表示实验验证、构建成功或生物学有效性。图注、界面说明和导出内容沿用这一解释边界。

导出菜单直接复用当前图表模型：

- SVG 保留向量路径、坐标轴、图例和文字，并使用白色出版背景；
- PNG 按图表逻辑尺寸的 3 倍生成，适合文档和幻灯片插图；
- CSV 保存求解器原始点值、运行角色、输入、模块中间值、输出区间和域外标记，不把界面格式化值写回数据；
- 复制图像、复制数据和复制图注与下载使用同一当前结果及可选历史对比。

运行结果保存运行 ID、完成时间、引擎版本、模式、网络 ID、主输入源 ID、输出监视器 ID、求解点、模型版本、上下文 ID、不确定性方法、ANN 或动态派生指标，以及 Demo 与实验有效性标记。Batch 4.1 另外保存输入源和输出监视器在运行时的轻量信号语义快照，包括稳定 ID、翻译键、entity、quantity type 和 unit；快照不保存本地化后的中文或英文文本，也不复制完整项目、参数或适用域。

结果展示统一由运行自身的信号语义快照解析坐标轴、Tooltip、结果摘要、图注、SVG/PNG 和溯源字段。没有快照的旧运行继续加载，并显示运行 ID 与“未知单位”，不会借用当前项目中的标签或单位。历史对比先满足 networkId、mode、primaryInputSourceId 与 outputMonitorId；两条运行都含快照时，还要求输入和输出的 entity、quantity type 与 unit 分别完全一致。旧运行沿用四项 ID 兼容规则，界面明确提示语义未记录，一次仍只叠加一条历史曲线。

窄范围 Log10 轴使用 1、2、5 倍十进制幂的工程刻度；Full、ANN 和历史对比按实际可用性共同构成主线计数，用户可以在 ANN 或对比仍可见时独立隐藏 Full。参数区间不单独算作主线。手动 X 范围下，指针和键盘只浏览当前可见的有限求解点，范围变化排除现有光标时会清除该光标。

1440×900 截图、1280×720 布局测量和实际界面导出的 SVG、PNG、CSV 位于 `docs/ui-audit/scientific-results/`。

Batch 4.1 的用户语义、系列显隐、窄 Log 轴、可见域键盘光标和修正后导出审计位于 `docs/ui-audit/scientific-results-fixes/`。

## Catalog-backed BFN scientific contract

AHL/HSL V1.1 文献目录通过独立的 BFN 集成层进入 BFN-IR。运行候选只接受冻结白名单中的 20 条 receiver response：19 条 Kylilis 4PL 和 1 条 Shong EsaR。目录中的 52 条 receiver response 不会整体获得执行权限；sender output 当前为 0，13 条 effective pair 保持不可拆分，39 条 compatibility relation 保持非数值证据。它们不会生成 sender transfer function、边权重、增益、阈值或 Hill 参数。

每个 Catalog-backed model variant 保存版本化 `catalogReference`，包括 catalog、release、response、component、input/output signal、parameter context、source IDs、来源模型、调控方向、runtime implementation 以及来源参数。输入端口的 `entity` 来自冻结原始 release 的 `canonical_name`，量类型为 concentration，规范单位为 M；英文显示名、中文显示名、alias 和 component name 不参与信号身份匹配。输出统一表示为 `normalized_reporter_expression / expression_level / dimensionless`，原始 reporter 与 output signal ID 继续保存在来源合同中。

19 条 4PL 响应映射为标准 `hill_activation`：`ymin=0`、`ymax=1`、`K=EC50 (M)`、`n=Hill coefficient`。Catalog 的 basal 和 maximum 只记录来源上下文中的归一化参数，不作为 BFN 的 ymin 和 ymax。Shong EsaR 同样使用随输入增加的 `hill_activation` 数学表示，`K=2.1e-7 M`、`n=1`；其生物调控方向单独保留为 `derepression`。这些模型不生成参数区间、实验数据集或完整 BiologicalImplementation，证据等级为 `fitted_from_published_data`，并明确标记为 runtime demo。

Catalog working range 按原值和 M 单位写入实例级 `BfnValidityDomain`。未连接输入不等于零浓度：Catalog-backed trusted model 的 required input 必须由 enabled 上游 Edge 提供明确数值，缺少连接、禁用连接或损坏的来源端点都会产生 `catalog_required_input_unconnected` error 并阻止执行。只有上游信号显式产生 `x=0` 时才进入可信 evaluator 的零点规则；该点即使低于正值工作范围下界也合法，输出为 0 且不标记为外推。正值只能在闭区间 `[min,max]` 内执行；区间外、负数和非有限值会终止可信执行。普通非 Catalog BFN 模型继续保留未连接输入 warning、域外 warning 与 extrapolated 语义。

运行时不会信任项目 JSON 中复制的 Hill 参数。执行链依次检查 reference 结构和 release identity，从 bundled frozen release 重新构建 trusted receiver binding，重建预期 BFN 映射，核对 module、model、ports 和 validity domain，随后调用既有 `evaluateReceiverResponse()`。任何 reference、EC50、Hill、范围、context、source、runtime implementation 或端口语义不一致都会使模型不可可信执行，不会自动修复，也不会退化成 generic Hill model。未知 release 和损坏 reference 的项目仍可读取；运行和验证返回明确的 Catalog 业务错误。

Catalog parameter context 使用确定、带命名空间的 external identity，并同时写入 model 与 validity domain。集成层不把缺失宿主、培养基、温度或载体字段补成默认值，也不创建伪 `BfnContext`。文献 source IDs 只保存在 Catalog provenance 中，不伪装成 `BfnExperimentalDataset`。

输入解析只返回 entity 完全相同、quantity type 完全相同且单位量纲兼容的 Input Source 输出或 Functional Module 输出。结果会列出全部兼容来源并建议“只添加模块”或“模块加输入源”；兼容不代表用户确认拓扑，因此实例化从不自动选择来源或创建 Edge。即使一次实例化同时创建 Module 与 Input Source，项目在用户显式建立 Edge 前仍处于输入未定义状态，不能运行该 Catalog model。静态默认输入源使用精确工作范围和 33 个采样点，动态默认值为范围下界；该值只用于初始模拟状态。

Catalog V1.1 没有可信时间常数或状态方程，只创建 `BfnStaticModel`。静态 Catalog 模块进入动态网络时逐时刻执行 `y(t)=F(x(t))`，作为无记忆模块运行，不生成 tau 或人工延迟。运行结果的 Demo 状态由项目 Demo boundary，或当前 `outputMonitors[0]` 沿 enabled incoming Edge 反向可达的计算子图中任一 Demo effective model 传播。遍历只接受真实模块输出端口并使用 visited set 防止循环；孤立模块、损坏连接、disabled path 和不通向当前输出的支路不会污染结果。`experimentalValidity` 始终保持 `not_validated`。

## Catalog Discovery

Batch 5.1 在网络设计页的添加模块 Drawer 中接入只读 Catalog Discovery。当前唯一 Provider 是冻结的 AHL/HSL V1.1 release。展示层先把 `ReleaseCatalogPresentation` 投影成独立的 BFN Discovery model，再由 React 按 Component 分组呈现；Receiver Response 是组内响应记录，Signal、Context 和 Source 只参与筛选、搜索与轻量预览，不成为并列结果类型。

默认目录包含全部 42 个非拒绝 Component 和 52 条 Receiver Response。20 条通过 `response.runnable` 可信门禁的记录标记为“可运行（示例模型）”；其余记录分别表达待标定、仅定性证据、参考资料或当前不可运行。该状态只描述当前软件用途边界，不表示实验验证、构建成功或生物学优劣。13 个 Sender Component 可以搜索和浏览；冻结 release 的 sender output 为 0，因此界面明确显示“暂无定量发送函数”，不从名称、effective pair 或 compatibility relation 推导数值输出。

搜索覆盖双语 Component 名称、别名、调控蛋白或酶、promoter、reporter、Signal 名称与缩写、宿主与菌株、来源作者、标题、年份、DOI 和 PMID，并加入 Functional 与 Biological Family 的审定中英文名称。Ontology 稳定 ID 与术语描述不进入搜索。搜索采用大小写无关的规范化子串与 token AND 语义；组件名称、组件元数据、Signal、宿主、来源和语义名称按确定的文本相关性排序，同分保持 release 顺序。

结构化筛选包含 Function、状态、输入 Signal ID 和宿主 species。Function option value 使用稳定 Functional Family ID，选项从当前可信 Component projection 派生；筛选在 Component 层执行，未增加 Biological Family 筛选。Component group summary、Receiver / Sender preview 与 Full Detail 使用相同的本地化语义展示；语义解析不可用时只降级对应分类块，不阻断 Catalog 浏览、证据详情或原有 Add eligibility。

Batch 5.1.1 统一了 Signal 在 Response row、Response preview 与输入 Signal 筛选器中的身份表达。常用缩写继续承担搜索与紧凑识别用途；同一缩写对应多个化学实体时，界面从冻结 Catalog 的审定中英文名称保留足以区分身份的限定信息，例如 `3OC6-HSL（L）` 与 `3OC6-HSL（立体构型未说明）`。该规则只改变展示文本，不修改 Signal ID、canonical name、BFN entity 映射、筛选值或运行时合同；无法从审定名称安全证明限定信息时，回退到 Catalog 本地化显示名。

搜索、筛选、展开、选择、预览、滚动和清除均为 Drawer 局部状态，不写入 BFN Project，不创建历史步骤，不触发项目自动保存，也不改变 computation signature 或结果新鲜度。轻量预览继续保持只读；原有 3 个通用 Demo 模块保留在独立的“内置示例模块”折叠区，并继续使用原添加流程。

内置示例卡片分别显示 Module Function、Mathematical Model 与 Model Basis。Module Inspector 在 Effect 后、Inputs / Outputs 前显示独立 Functional 与 Biological property rows；Catalog-backed Module 使用精确 Component ID，内置模块使用 exact label-key mapping。切换 static / dynamic 只更新 Mathematical Model presentation，Functional Family 和 Biological Component Family 保持不变。

## Catalog Full Detail 与网络实例化

Batch 5.2 在同一 Drawer 内加入 Full Detail。Response 详情先从经过验证的 release presentation 投影身份、状态、实验条件、组件信息、全部来源、整体实验观察与定性兼容证据，再为标记为 runnable 的条目重新构建 trusted runtime candidate。重建失败会把当前详情安全降为不可运行。待标定、仅定性、Reference、Sender 和不可用条目都只有证据浏览能力，没有 Add 操作。Sender 详情明确显示“暂无定量发送函数”；observed pair 保持整体系统观察，compatibility relation 保持非数值证据。

详情将当前运行模型与来源参数分成两个区块。运行模型固定表达归一化 0–1 输出、可信 K、n 和 working range；文献区保留 Basal、Maximum、EC50、原始 Hill 系数与参数符号。Shong EsaR 的数学响应保持随浓度增加，生物机制单独显示为去抑制。Context 中的 null 直接显示“未记录”，不会补入宿主、培养基、温度或载体默认值。序列状态、序列来源和核验边界分别呈现，仓库引用或标识符记录不会被描述为完整核苷酸序列已验证。

Runnable Response 的 Add Panel 根据当前项目中 entity、quantity type 与单位量纲兼容的全部来源给出默认选择：没有来源时建议同时创建 Module 与匹配 Input Source；已有一个或多个来源时建议只创建 Module。用户可以覆盖建议。两种方式都不会自动创建 Edge，也不会创建或修改 Output Monitor。Module 与可选 Source、ports、trusted model 和 validity domain 组成一次原子项目编辑；一次 Undo/Redo 会成组移除或恢复相同实例 ID。添加改变 computation signature，使既有 Current Result 进入 stale 状态，不触发自动运行。

每次添加使用项目局部、冲突安全的独立 ID，因此同一 Response 可以实例化多次。Catalog provenance 中的 component、response、signal 和 source identity 保持不变。项目节点和信号端口另存中英文 `displayName`，Canvas、Network Index、Inspector 与 Exact Connection 统一显示真实 Component 名和保留立体构型的 Signal 名；显示名不参与计算签名、可信验证或化学身份匹配。Module 与 Source 即使同时创建，也只按 Source-left / Module-right 放置，拓扑仍由用户在画布中明确连接。

## User-facing evidence semantics

Batch 5.2.1 在 Catalog 数据合同与界面之间加入统一的 evidence presentation 层。冻结 release 中会进入 Full Detail 的 evidence gap、response class、compatibility relation、qualitative outcome、source model、fit interpretation、sequence status、缺失序列元素和测量字段均先映射为自然的中英文科研表述；主界面不再直接展示 snake_case、内部枚举或数据库式英文短语。

Observed pair 的主层结论使用意义等价的本地化表达，来源英文原文和内部 code 只保留在默认折叠的高级审计信息中。未来 release 出现未知 code 时，主界面统一回退为“存在尚未完整呈现的证据信息 / Additional evidence information is recorded”，不会把拆分下划线后的机器值冒充用户文案。该展示转换不改变证据等级、可运行资格、参数、来源或科学边界。

Input Resolution 的兼容来源继续复用端口身份展示规则，同时明确显示上游输出真正提供的 Signal 与单位。兼容关系、自动推荐和连接规则没有变化。

## Catalog provenance inspector

Catalog-backed Module 的来源追溯链为：

    catalogReference
    → verifyBfnCatalogModel()
    → resolveBfnCatalogProvenance()
    → Literature source inspector

Resolver 复用既有可信验证，并把结果投影为 matched、source-mismatch 或 source-unavailable。未连接输入和输入范围问题继续由 Validation 与运行门禁负责，不改变静态来源匹配状态。普通 BFN Module 返回 null，保持原有 Inspector 与关联数据区域。

匹配状态从当前 bundled frozen release 重新解析 Catalog 版本、Component、identity-preserving Input Signal、输出语义、host/strain 外部实验条件、第一条来源、来源数量、response ID、context ID 与 source IDs。项目只保存既有 catalogReference 和模型，不保存 Full Detail、Citation、Context 或 Source snapshot，也不为 Catalog external context 创建伪 BfnContext。

“来源记录已匹配”只表示 Module 与内置文献记录一致，不表示团队实验验证。参数、端口、来源、适用域或 reference 被修改时显示来源不一致；未知 release 或当前 bundled source 无法解析时显示来源暂时无法核对。两种状态都不会自动修复、升级、rebind 或使用项目副本中的参数冒充 canonical model，可信运行继续 fail closed。

Inspector 只显示紧凑来源摘要，高级 ID 默认折叠。匹配记录可直接打开对应 Response Full Detail；仍能解析 response ID 的 mismatch 只提供“查看目录中的原始记录”，未知 release 不构造伪详情。打开、返回和关闭 Drawer 只改变界面状态，不写项目、不进入 Undo/Redo、不触发自动保存，也不改变 computation signature 或 Current Result。

## 多项目科研工作区

Batch 6 在 BFN-IR 2.0 外层加入多项目工作区。BFN-IR 的 schema、科学对象、Catalog reference、求解器输入和 computation signature 保持不变；工作区单独管理项目名称、Current Draft、不可变 Version、当前项目和项目级 Run。工作区元数据不会写入科学 schema，也不会改变可信 Catalog 运行合同。

生产入口由工作区控制器加载项目，并把单个 BFN Project 和当前项目的 Run 交给既有编辑器。编辑器继续负责网络直接操作、Undo/Redo、结果新鲜度和科学验证，不直接访问 IndexedDB。项目切换与 Version 恢复通过重新建立编辑器实例清除 Undo/Redo、Selection 和 Overlay 瞬态；切换后加载该项目最新 Run，并根据保存的 computation signature 标记为当前设计、较早设计或旧版运行记录。

Current Draft 使用 320 ms 防抖自动保存。Autosave 防止编辑丢失，不创建 Version；Version 由用户主动保存，是包含 BFN-IR snapshot、项目内 revision、可选科研备注和快照计算签名的不可变设计节点。Run 是 BFN-SIM-2.0 外层的项目级计算记录，也不是 Version。完整关系、存储事务和迁移规则见 [workspace.md](workspace.md)。

## 代码边界

- `src/features/bfn/types.ts`：BFN-IR 2.0 类型；
- `src/features/modeling/ontology/v1/`：BFN-ONTOLOGY-1.0 术语、可信 assignment、纯读取 resolver 与 fail-closed validation；
- `src/features/bfn/catalog/`：Catalog Discovery 投影与 Drawer、运行候选、来源合同、输入解析、可信验证与统一执行边界；
- `modelResolution.ts`：静态、动态及 dynamic-to-static 无记忆模型解析；
- `unitSystem.ts`：量纲兼容与单位换算；
- `validation.ts`：端口、连接、DAG、输入和上下文检查；
- `responseMath.ts`：完整静态响应纯函数；
- `simulation.ts`：静态与动态求解、不确定性和动态指标；
- `annApproximation.ts`：工作域仿射拟合与接受/拒绝判定；
- `reverseDesign.ts`：保留的 legacy 双参数空间多目标候选评价；
- `inverse-design/`：Catalog-backed Target 合同、搜索空间、可信求值、确定性分组与 signal-scoped unavailable 诊断；
- `inverse-design/ui/`：UI-only Target Draft、浓度显示单位、显式搜索新鲜度、结果核对、曲线和手动比较；
- `repository.ts`：BFN-IR 解析、旧单项目读取与独立编辑器兼容路径；
- `workspace/workspaceTypes.ts`：BFN 外层的 Project、Draft、Version、Run 与 Repository 合同；
- `workspace/indexedDbWorkspaceRepository.ts`：生产多项目事务、版本和项目级运行记录；
- `workspace/workspaceMigration.ts`：旧单项目只读迁移与空白工作区初始化；
- `workspace/BfnWorkspacePage.tsx`：生产工作区控制器、autosave flush、项目切换与恢复；
- `BfnPlatformPage.tsx`：两个一级设计工作区、Undo/Redo、结果新鲜度和 Overlay 编排；
- `BfnProjectToolbar.tsx`：紧凑项目工具栏与一级工作区切换；
- `computationSignature.ts`：分析结果所依赖的纯计算状态签名；
- `BfnNetworkCanvas.tsx`：理想连接画布；
- `BfnResponseChart.tsx`：完整响应、不确定性和 ANN 叠加；
- `fixtures.ts`：明确标记的演示注册表。

这些纯函数不依赖 BLE、Tauri、SQLite、Zustand 或导航。BIO-NET 不进入 HC-08D 实时采集、协议解析、背景校正、浓度换算或质量判定路径。

## 测试边界

自动化覆盖：

- 理想连接的实体、量类型、单位量纲和单上游规则；
- 浓度单位自动换算；
- 静态工作域、固定点、域外标记和不确定性带；
- ANN 接受与拒绝；
- 一阶阶跃响应、DC gain 与周期频率增益；
- 功能参数和生物设计变量分离；
- 多目标候选排序与 `proposed_unbuilt_design` 标记；
- BFN-IR JSON 往返与旧项目隔离；
- 中英文工作台、非法连接说明、模块注册和反向设计交互。

当前演示模型不支持实验效能结论、构建成功率结论或生物安全结论。后续实验数据通过标准注册流程进入新模型版本，并保留原始数据、上下文和证据等级。
