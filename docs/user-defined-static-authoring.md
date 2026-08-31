# 用户定义静态功能模块创作与运行

## 状态与版本

Batch 12.1 将冻结的用户模块科学合同接入生产建模路径，当前状态为 `ACTIVE`，等待 Master Control 审核。项目结构继续使用 `BFN-IR 2.2`；本批没有新增或重载 IR 字段。新运行使用 `BFN-SIM-2.1`，历史 `BFN-SIM-2.0` 运行继续通过版本化读取路径展示。

完整工作流为：

> 用户填写静态科学定义
>
> ↓
>
> 冻结合同校验
>
> ↓
>
> 纯 BFN-IR 2.2 物化
>
> ↓
>
> 添加一个 `BfnFunctionalModule`
>
> ↓
>
> 用户显式连接网络
>
> ↓
>
> 静态计算与诚实的不确定性展示

## BFN-SIM-2.1 不确定性合同

数学模型完整时，点估计可以执行。不确定性模型是否可执行单独决定定量区间是否可用。`BfnSimulationPoint.lower` 与 `upper` 在 2.1 中为 `number | null`：完整区间存在时保存数值，网络区间不可用时保存 `null`，不会以 `lower = upper = output` 伪造零宽区间。

运行保存 `output_reachable` 范围的不确定性快照，逐个记录参与最终输出计算的模块、选中模型、不确定性方法、区间可执行性和原因。最终区间仅在所有输出可达 active model 都提供完整且可执行的定量不确定性时可用。

- `none`：作者明确声明没有提供不确定性模型；点估计可运行，定量区间不可用。
- `not_recorded`：不确定性信息未记录；点估计可运行，定量区间不可用。
- `parameter_interval_envelope`：Hill 的 `ymin/ymax/k/n`、线性的 `scale/intercept`，或独立作用模型的 `basal/outputMaximum` 与每个 term 的 `k/n/contribution` 均须提供有限、包围估计值的区间；完整时计算包络，不完整时只运行点估计。
- `posterior_samples`、`bootstrap`、`covariance`：BFN-IR 2.2 可保存方法名称，当前没有足够的执行载荷；点估计可运行，区间标记为 `method_not_executable`。
- 混合网络：任一输出可达模型缺少可执行区间，整条输出路径的定量区间不可用，不展示局部区间为完整网络区间。

图表、Tooltip、结果 Dock、运行详情和导出都读取同一可用性合同。区间不可用时不渲染 ribbon；结果界面区分“未提供不确定性模型”和“未记录”。ANN 的 R²、NRMSE 与最大绝对误差继续基于点预测计算，`predictionIntervalCoverage` 只在有效参考区间存在时计算，否则为 `null`。

历史 `BFN-SIM-2.0` 数据不会被重写，也不会被反向推断出新的科学事实。旧点的数值上下界按旧版记录读取；新运行始终写入 2.1 的显式不确定性快照。

## 必需输入安全

当 `module.authoring.origin === 'user_defined'` 时，输出可达 active model 建模使用的每个输入端口都必须具有启用的 incoming Ideal Edge。缺少连接会产生 `user_module_required_input_unconnected` 错误并阻止该输出路径运行，缺失输入不会被解释为数值零。

已连接 Input Source 的值为 `0` 是明确的科学输入，可以正常计算。验证只遍历当前输出可达路径；画布中与目标输出无关的断开用户模块不会阻止其他有效网络运行。

## BFN-IR 2.2 物化

`materializeUserDefinedStaticModule(draft, project)` 是无副作用的纯函数。成功时返回新的 Project 与新增模块 ID，失败时返回结构化 issue。它不写 localStorage 或 IndexedDB，不操作 React state，不启动仿真，也不调用 Sender Runtime Admission 或 Ontology 分类。

物化门同时要求 semantic valid、所选静态 family runtime supported、evidence claimable、implementation valid。Batch 12.0 的 `assessment.representation` 是历史 BFN-IR 2.0 审计，不作为当前 2.2 物化门。

| Authoring draft                           | BFN-IR 2.2 映射                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `draft.id/name/description`               | `module.id` 与逐字保存的 `module.authoring`                                       |
| Port `id/name`                            | 稳定 Port ID 与 `port.authoring = { origin: 'user_defined', name }`               |
| Port Entity / quantity / unit / direction | 原样映射到 `P=(E,Q,U)` 与端口方向                                                 |
| 既有 Entity                               | 复用精确 Entity ID，不创建覆盖显示名的用户实体                                    |
| 新 Entity                                 | 添加 `origin: 'user_defined'`、作者显示名和 `description: null` 的 Project Entity |
| static model                              | 一个版本化 static model variant 与 active static model ID                         |
| input ranges                              | 一个引用各输入 Port 的 validity domain                                            |
| Context                                   | 全空映射为 `contextId = null`；有事实时创建一个 context registry 记录             |
| uncertainty                               | 映射到 model 的 `uncertaintyMethod`，完整参数区间保留在参数 `interval95`          |
| evidence / provenance                     | 证据等级映射到模块和 model；需要来源的强声明必须保留结构化 provenance             |
| implementation                            | 默认保留 `unspecified` 与空 implementation IDs；不虚构生物实现                    |

作者输入的 Port 角色名与 Entity 身份彼此独立。角色名只描述该模块中端口承担的功能；Entity ID 指向网络交换的科学对象。既有 Entity 的权威显示名发生冲突时返回 `entity_display_name_conflict`，不会静默覆盖或创建第二身份。同 ID 的新 Entity 定义不一致时失败，不自动改名。

模块、model、domain、context、port 和 provenance ID 均由 draft 的稳定 ID 确定性派生。与 Project 内任何现有 ID 冲突时返回结构化错误。输入相同且 Project 相同的物化结果保持确定，输入对象不会被修改。

## 创作界面

入口位于网络设计页的“添加模块”抽屉，通过“自定义功能模块”进入；它不是新的顶级页面。首版只提供四类静态、单输出模型：

- Hill 激活 `hill_activation`
- Hill 抑制 `hill_repression`
- 线性传递 `linear_transfer`
- 多输入独立作用 `independent_inputs`

表单分别采集模块名称与说明、输入和输出角色名、既有或新建 Entity、quantity、unit、输入适用范围、模型参数、可选 Context、Evidence basis、结构化 provenance 以及三种可创作不确定性状态。选择参数区间时，每个必需参数都要填写完整上下界。Implementation 固定为 `unspecified`，界面不暗示已构建或已验证的生物实现。

“添加到网络”执行一次现有 Project edit transaction，创建一个 `BfnFunctionalModule` 及其必要 registry sidecar，并选中新模块。它不会自动创建 Edge、Input Source、Output Monitor，也不会自动运行。用户随后使用现有精确连接工具建立网络。

一次添加对应一个 Undo 单元。Undo 精确移除新增模块和本次添加的 registry 记录，Redo 恢复相同对象与稳定 ID。既有 Workspace Current Draft 自动保存、Version 快照、项目导出与导入继续保存完整 BFN-IR 2.2；IndexedDB store/index 结构没有变化。

画布、对象索引与检查器优先显示作者逐字输入的模块名和 Port 角色名。检查器同时显示 Entity、quantity、unit、不确定性和 Context；缺失 Context 明确显示“未记录”，不会变成已知不兼容。

## 范围边界

本批不提供 identity no-op、零输入常量、lookup table、任意公式、多输出、有状态/动态用户模型、Designed Sender、Signal Pool / Accumulation 或可复用用户模块库。界面不提供任意代码执行，也不自动注册 Catalog、授予 Ontology 分类、证据可信度或 Sender runtime admission。

生产速率到浓度继续是硬不兼容；Ideal Edge 继续表示瞬时、无损、identity 传播。数学可执行性、证据依据、实现成熟度、Context 适用性与不确定性可用性始终是独立维度。
