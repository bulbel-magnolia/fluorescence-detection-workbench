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
2. **按目标设计**：目标功能录入、双空间映射和多目标候选排序。

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

## 代码边界

- `src/features/bfn/types.ts`：BFN-IR 2.0 类型；
- `unitSystem.ts`：量纲兼容与单位换算；
- `validation.ts`：端口、连接、DAG、输入和上下文检查；
- `responseMath.ts`：完整静态响应纯函数；
- `simulation.ts`：静态与动态求解、不确定性和动态指标；
- `annApproximation.ts`：工作域仿射拟合与接受/拒绝判定；
- `reverseDesign.ts`：双参数空间多目标候选评价；
- `repository.ts`：V2 项目和运行记录持久化；
- `BfnPlatformPage.tsx`：两个一级工作区、历史、结果新鲜度、自动保存和 Overlay 编排；
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
