# 用户定义一阶动态模块创作与运行

## 状态与固定版本

Batch 12.3 已经 Master Control 最终复核并正式 `FROZEN`。正式 reviewed implementation 为 `7520623c3f75c8ae5ee6173d4a507f7b7825227f`，其后的 `ec8c177afdf34b4f21ef9f9014de140a41f31e32` 仅记录 correction validation 与待冻结状态；freeze bookkeeping 只更新正式文档状态，不修改生产代码。Batch 12.3 的边界是 `BFN-IR 2.2` 与 `BFN-SIM-2.1`；当前项目 representation 为 BFN-IR 2.3，新运行由 Batch 12.4.1 记录为 BFN-SIM-2.2，下面的一阶方程、采样时序和数值轨迹保持零差异。Workspace IndexedDB structural version 继续为 `1`。本冻结状态表示软件合同与实现已通过 Master Review，不表示任何用户定义模型获得实验验证。

本批只开放受限的一阶松弛模型：

$$
\tau \frac{dy}{dt}=f(\mathbf{x})-y
$$

`f(x)` 是 Batch 12.1 稳态创作合同中的 Hill activation、Hill repression、linear transfer 或 independent inputs；`y` 是模块唯一输出和唯一动态状态；`tau` 是以小时记录的正时间常数；`y(0)` 是用户填写的初始输出。

## 单一创作源与成对模型

通用用户模块表单先编辑一份稳态响应，再选择 Steady-state 或 First-order dynamic。动态草稿不会要求用户复制第二份响应参数。纯物化器从同一响应源构造：

- static variant：`mode = static`，`response = f(x)`；
- dynamic variant：`mode = dynamic`，`family = first_order`，`steadyStateResponse = f(x)`；
- `activeModelIds.static` 与 `activeModelIds.dynamic` 分别指向对应 variant。

`static.response` 与 `dynamic.steadyStateResponse` 按值深度一致。Static network 选择 static variant；Dynamic network 选择 dynamic variant。已有 static-only 用户模块在 Dynamic network 中继续使用既有 quasi-static fallback。

## 动态字段与校验

动态创作区采集：

- `tau`：有限、严格大于零，单位固定为 `h`；
- `initialState`：有限标量，科学单位继承唯一输出 Port；
- optional `timeRangeHours`：未记录，或填写有限的 `start >= 0` 与 `end > start`；
- uncertainty：`not_recorded`、`none` 或 `parameter_interval_envelope`。

参数区间包络要求稳态响应的全部必需参数区间和 tau 区间完整。Tau 区间必须有限、下界大于零、上下限有序且包含估计值。Initial state 保持 deterministic scalar，不创建区间。非法草稿在 authoring 或 materialization gate 失败，不依赖运行时数值保护修正。

## 运行与反馈边界

动态执行继续复用 BFN-SIM-2.1 冻结的精确离散更新；BFN-SIM-2.2 未改变该 update：

$$
y_{t+\Delta t}=y_t+\left(1-e^{-\Delta t/\tau}\right)\left(f(\mathbf{x}_t)-y_t\right)
$$

中央 `validateBfnProject()` 对目标 Output Monitor 可达路径中的 effective `user_defined + dynamic` 模型重新核验 first-order family、tau、initial state、paired static response、time validity 与 parameter envelope；非法 imported、Workspace-persisted 或直接构造对象以 machine-readable `dynamic_model_contract_invalid` error 在进入 BFN-SIM 前 fail closed。Static mode 的 dormant dynamic variant 与目标外 malformed module 不触发该错误。

本批没有新增 evaluator、通用 ODE integrator 或第二套 solver。目标 Output Monitor 的可执行路径中存在有向环，且该环包含 effective dynamic user-authored module 时，运行前校验返回 machine-readable `dynamic_feedback_unsupported` error 并阻止仿真。图对象仍可保存该拓扑。

## 添加、保存与隔离

一次 Add to Network 是一个 Project edit 和一个 Undo unit。成功时只增加一个 `BfnFunctionalModule` 及必要 registry sidecar，不自动创建 Input Source、Edge、Output Monitor、Run 或 Signal Pool，也不切换网络模式。

Project JSON 与 Workspace 继续直接保存 BFN-IR 2.2 对象图；paired models、active model IDs、Port metadata、tau、initial state、time range、Context、provenance、Implementation 和 uncertainty 通过既有读取路径 roundtrip，不建立独立 dynamic-module storage。

Designed Sender 保持 Batch 12.2 static-only 科学合同，不获得 response mode、tau、initial state 或 dynamic variant。`production_rate -> concentration` 继续由 Port Compatibility 硬拒绝；显式 Signal Pool / Accumulation 属于 Batch 12.4。Sender/Receiver evidence、Catalog runtime、Temporal evidence inference、Inverse Design 与 Ontology 均不因动态用户模块创作而扩展。

相关文档：

- [用户定义静态功能模块创作与运行](user-defined-static-authoring.md)
- [Designed Sender 创作与信号产生语义](designed-sender-authoring.md)
- [BFN Development State Ledger](bfn-development-state.md)
- [测试说明](testing.md)
