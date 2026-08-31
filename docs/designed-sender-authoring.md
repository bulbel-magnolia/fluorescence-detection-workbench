# Designed Sender 创作与信号产生语义

> 状态：Batch 12.2 `ACTIVE`。本文记录当前实现边界，不构成冻结声明。

## 定位与持久化表示

Designed Sender 是面向信号产生场景的创作工作流和受限预设。它帮助用户填写一个单控制输入、单产生速率输出的静态功能模块。成功添加后，Project 中保存的对象仍是普通 `BfnFunctionalModule`：

- 不增加 Designed Sender node type、tag 或持久化 marker；
- 不改变 BFN-IR 2.2 schema；
- 不把 Catalog Sender、Sender evidence 或 Runtime Admission 记录写入模块；
- 导入、导出、Workspace Draft/Version 和 Undo/Redo 沿用普通 BFN-IR 2.2 对象图。

因此，“Designed”描述用户采用的创作路径，不是模块的科学证据等级、Catalog 分类或运行授权。

## 首版创作合同

| 维度          | Batch 12.2 范围                                            |
| ------------- | ---------------------------------------------------------- |
| 控制输入      | 恰好 1 个                                                  |
| 输入 Quantity | `concentration`                                            |
| 输入 Unit     | `M`、`mM`、`uM`、`nM`、`pM`                                |
| 输出          | 恰好 1 个                                                  |
| 输出 Quantity | `production_rate`                                          |
| 输出 Unit     | `nM/h`、`uM/h`                                             |
| 静态模型      | `hill_activation`、`hill_repression`                       |
| Context       | 未记录或用户明确填写                                       |
| Uncertainty   | `not_recorded`、`none`、完整 `parameter_interval_envelope` |

输入和输出的 Port 角色名称与 Entity 身份分别采集。K 使用控制输入浓度单位；基础产生速率和最大产生速率使用输出速率单位；n 为无量纲。适用范围必须是输入浓度单位下的有限递增区间。表单不开放任意公式、多输入、多输出、lookup table 或有状态动力学。

## 信号身份

### 已知 AHL/HSL

已知信号选择器通过只读 helper 从可信 AHL/HSL V1.1 release 的 signal identity 投影生成。生产投影只保留：

- `catalogSignalId`：可信 signal record 的精确 ID；
- `entityId`：该 record 的精确 `canonical_name`；
- `displayName`：同一精确 `canonical_name`。

物化时，输出 Port 的 Entity 使用上述 canonical name。可选的 `authoritativeEntities` 物化参数只在外部权威 ID 与 display name 精确一致时复用身份，并且不把该身份注册为 Project-defined Entity。现有 registry 中同 ID 的显示名称发生冲突时，物化以结构化错误关闭。

这一复用只确认信号身份。它不复用 Catalog evidence、Sender V1.2 参数、admission 状态、组件实现或实验结论。

### 自定义信号

自定义信号按普通用户 Entity 处理。materializer 使用既有确定性 ID 规则创建 `origin = user_defined` 的 Project Entity；同一 Project 内的精确身份复用和冲突行为与通用 Batch 12.1 创作一致。自定义名称不会被猜测或映射为可信 AHL/HSL identity。

## Evidence、Implementation 与 Uncertainty

默认 Evidence 为 `proposed_unbuilt_design`，表示当前对象是可计算的候选设计。用户选择要求 provenance 的较强 evidence grade 时，必须提交结构化来源记录；该记录不会自动授予 Catalog trust 或实验验证。

Implementation 保持 `unspecified`，`implementationIds` 为空。Designed Sender 不根据名称推断启动子、RBS、酶、宿主构建或其他生物实现。

默认 Uncertainty 为 `not_recorded`。选择参数区间时，K、n、基础产生速率和最大产生速率都必须具有完整上下界，随后沿用 BFN-SIM 2.1 的通用参数包络执行。

## 物化与运行

Designed Sender draft 先映射到冻结的通用用户模块合同，再调用同一个纯 `materializeUserDefinedStaticModule`。成功结果包含一个 `BfnFunctionalModule` 和必要的 validity/context/provenance sidecar，不包含专用 evaluator。

运行沿用 BFN-SIM 2.1：

- 静态 Hill 方程由通用模型解析与求解路径执行；
- 输出可达的 Designed Sender 缺少 enabled incoming Edge 时产生 `missing_required_input` 并阻止目标运行；
- 显式连接且值为 `0` 的控制输入是有效输入；
- 不调用 Sender Runtime Admission；
- 不从 Sender evidence 推导参数或方程。

## 图编辑与界面行为

“添加模块”抽屉同时保留“自定义功能模块”和独立的“设计发送模块”入口。Designed Sender 表单明确显示固定的输入浓度与输出产生速率，并允许选择已知 AHL/HSL 或填写自定义信号。

“添加到网络”执行一个原子 Project edit，随后选中新模块并返回网络设计界面。该操作不会自动创建：

- Input Source；
- Ideal Edge；
- Output Monitor；
- Run；
- Signal Pool 或其他隐藏过程。

撤销移除该次物化产生的完整对象图，重做恢复相同模块、Port、Entity 与 sidecar ID。

## `production_rate → concentration` 边界

`production_rate` 和 `concentration` 是不同物理量。即使 Sender 输出与 Receiver 输入使用同一 canonical signal identity，也不能通过 Ideal Edge 直接连接。连接检查继续返回 Quantity/Unit dimension 硬冲突，界面说明需要显式累积或清除过程。

当前实现不会积分产生速率、不会插入隐藏转换，也不会创建 Signal Pool。显式 Signal Pool / Accumulation 属于 Batch 12.4。

## 与 Sender V1.2 的隔离

Sender V1.2 继续作为冻结的文献 evidence extension，当前维持 53 条 evidence、0 admitted Sender。Designed Sender 生产代码不依赖 Sender V1.2 source、loader、validator、Runtime Admission、evidence scope presentation 或 Catalog Sender Add action。文献 Sender 仍不可直接加入网络。

后续工作边界保持独立：Batch 12.3 负责有状态或动态自定义模块，Batch 12.4 负责 Signal Pool / Accumulation，Batch 12.5 负责可复用用户模块库；Batch 11.2 仍是未授权的未来文献 Sender runtime。

相关合同：

- [用户定义静态功能模块创作与运行](user-defined-static-authoring.md)
- [用户定义功能模块科学与计算合同](user-defined-functional-modules.md)
- [BFN-IR 2.2 端口标签表示扩展](bfn-ir-2.2.md)
- [时间语义、兼容性与适用性](temporal-and-compatibility.md)
- [Sender Evidence Extension V1.2](sender-evidence-v1.2.md)
