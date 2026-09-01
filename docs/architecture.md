# Windows 桌面端架构

## 系统目标

桌面端承担四条彼此边界清楚的本地优先工作流：

1. Windows 通过 BLE 直接连接 HC-08D，显示并保存真实四路原始光强。
2. Demo 传输生成模拟曲线，执行演示分析并形成带 Demo 标记的结果。
3. 导入 JSON 或 CSV，完成格式校验和离线分析。
4. BIO-NET 使用 BFN-IR 2.3 组织完整功能模块、静态/动态仿真、条件化 ANN 近似和双参数空间反向设计；检测记录与功能网络保持独立的数据边界。

云端仅负责可选账号、团队工作区和记录同步，不进入设备采集关键路径。

## 数据流

```mermaid
flowchart LR
  STM["STM32F103C8"] <-->|"USART1 9600/8/N/1"| HC["HC-08D"]
  HC <-->|"BLE GATT"| WIN["Windows 原生 BLE"]
  WIN --> P["HC08D ASCII 协议解析"]
  P --> RAW["RAW_ONLY 原始记录"]

  MOCK["Demo BLE"] --> DS["检测状态机"]
  DS --> A["Demo 分析引擎"]
  FILE["JSON / CSV"] --> I["导入校验"]
  I --> A

  ONTO[BFN ONTOLOGY 1.0 只读语义层] -. 运行时分类且不持久化 .-> MODEL

  MODEL["BFN-IR 2.3 功能模块网络"] --> SIM["静态 / 动态完整模型求解"]
  SIM --> ANN["条件化 ANN 近似"]
  SIM --> RUNS["本机运行快照"]
  MODEL --> INV["双参数空间反向设计"]
  H -. "版本化映射" .-> MODEL

  RAW --> H["本地历史仓库"]
  A --> H
  H --> DB["SQLite"]
  H --> UI["React 工作台"]
  DB --> Q["同步队列"]
  Q -. "登录后可选" .-> EDGE["Supabase Edge Function"]
  EDGE --> PG["Postgres + RLS"]
```

真实运行路径为：

```text
Windows 应用 ↔ BLE ↔ HC-08D ↔ UART ↔ STM32 ↔ I²C ↔ AS7341
```

手机和电脑均为 BLE Central。HC-08D 联调时只保留一个 Central 连接，电脑测试前先断开手机及其他电脑。

## 分层

### 表现层

`src/pages`、`src/components` 和 `src/app` 负责布局、交互、图表和导航。固定导航为概览、采集、网络建模、分析、记录和设置；团队工作区从设置进入。

真实设备和 Demo 共用采集页：

- 演示设备显示三通道校正信号、调零和校准；模拟故障收纳在可展开的“演示场景”中。
- HC-08D 显示 480、515、555 nm 与 CLR 原始值、饱和标记、检测光源控制和本机记录。
- UUID、候选特征和最近原始行位于可展开技术详情中。

页面只调用 Zustand action，不直接访问 `btleplug`、Tauri 命令、SQLite 或云端管理接口。

### 应用状态层

`src/store/appStore.ts` 管理页面、传输模式、连接状态、检测状态、采样数据、硬件帧、诊断信息、结果和历史列表。`createAppStore` 接受可注入传输实例，便于对真实行为进行隔离测试。

`SwitchableBleTransport` 在 `demo` 与 `hc08d` 之间切换。切换时依次断开、释放旧传输、创建新传输并清理当前会话。用户选择保存在本机。

真实固件持续约每 0.5 秒发送一帧。“开始记录”和“结束并保存”是本机边界，不发送固件未定义的 START/STOP。真实模式中的 ZERO/CALIBRATE 被明确禁用。

### BLE 传输层

`BleTransport` 定义扫描、停止扫描、连接、断开、命令、订阅、连接状态和资源释放接口。

- `MockBleTransport`：Demo 扫描、连接、三通道采样与故障场景。
- `Hc08dBleTransport`：协议缓冲、命令应答、诊断、数据陈旧检测和重连调度。
- `tauriBleApi`：TypeScript 与 Rust Tauri 命令、事件之间的边界。
- `SwitchableBleTransport`：模式切换、订阅转发和能力分派。

Rust 端 `src-tauri/src/hc08d` 使用 `btleplug` 完成 Windows 扫描、连接、GATT 发现、Notify/Indicate 订阅和 Write。扫描结果向界面暴露会话内不透明 ID，不把完整 MAC 地址写入仓库。

连接后的特征选择顺序：

1. 优先识别 FFE0 服务与 FFE1 特征，包括完整 Bluetooth Base UUID 表示。
2. 检查同一服务内唯一的 Notify/Indicate 与 Write 组合。
3. 若只有一个双向特征，允许同一特征承担通知和写入。
4. 存在多个等价组合时拒绝猜测，并返回候选项供用户手动选择。

### 协议层

`Hc08dProtocolParser` 解析 `HC08D-ASCII-DRAFT-0.2`：

```text
480:<uint16>,515:<uint16>,555:<uint16>,CLR:<uint16>\r\n
```

解析器支持跨 BLE 通知分片、单次通知多行、相邻帧兜底分界、UTF-8 校验、缓冲上限和协议错误恢复。BLE 通知仅作为字节块处理，未出现 LF 或下一段 `480:` 时不会按时间间隔提前提交。每个有效帧附加应用侧序号、接收时间和相对时间。`65535` 标记为数字饱和，数值继续保留。

LED 命令使用单一在途请求：BLE 写入后状态为 `accepted`，收到匹配的 `LED_ON_OK` 或 `LED_OFF_OK` 后状态为 `completed`。`ERROR_COMMAND`、不匹配响应和 2 秒无响应均不会显示为成功。

### 分析层

`features/analysis` 包含无 UI、无存储副作用的输入校验和纯函数。当前 Demo/导入流程包括：

- 原始值和背景值校验
- `max(0, raw - background)` 背景校正
- 尾部窗口中位数摘要
- Demo 线性换算
- Demo 质量模型
- 版本与免责声明写入结果

真实 HC-08D 数据不进入该流程。真实记录的 `algorithmVersion` 与 `calibrationVersion` 为 `null`，结果状态为 `RAW_ONLY`。

### 建模层

默认建模路径位于 `features/bfn`，使用 `BFN-IR 2.3`。网络对象包括 `InputSource`、`FunctionalModule`、`IdealEdge` 和 `OutputMonitor`。端口使用 `P=(E,Q,U)` 保存实体、量类型和单位；可选的 `port.authoring.name` 单独保存用户逐字输入的端口角色标签，不参与兼容性或计算。连接层只验证端口语义并执行单位换算；理想边固定为 identity，不保存权重、偏置、增益、延迟、噪声或状态。

功能模块保存完整静态或动态响应、参数区间、上下文、适用域、数据来源、证据等级、模型版本和生物实现。静态引擎支持固定值、工作域扫描、多输入组合、Hill、线性、identity 和独立作用模型；动态引擎当前支持一阶响应、恒定/阶跃/脉冲/周期/自定义输入和静态无记忆模块。BFN-SIM-2.1 将点估计与定量区间可用性分离，只在所有输出可达 active model 都具有完整可执行区间时传播网络包络；域外外推继续显式标记。

`features/modeling/ontology/v1` 提供独立 BFN-ONTOLOGY-1.0 语义覆盖层。Functional Family、Biological Component Family、Mathematical Model Family 与 Runtime / Evidence Capability 是四个独立维度。Catalog 对象只从可信 presentation 的精确 Component ID 与 canonical role 分类；内置模块只从稳定 label key 的精确软件映射分类。未知模块返回两个显式 unclassified term，名称、别名、模型族和 static/dynamic 模式不触发推断。

Ontology registry、term 与 assignment 深冻结并执行 manifest、唯一性、父级、环、顺序和覆盖校验。Resolver 只读取 BFN module identity，返回深冻结 semantic profile，不调用求值器、仿真或实例化逻辑。分类不改变端口兼容、运行资格、Catalog trust、证据等级、Add eligibility 或构建状态。

`features/bfn/temporal` 与 `features/bfn/compatibility` 构成 BFN-IR 外的 derived read-only contract layer。Temporal resolver 复用唯一的 effective-model selection，命名 steady-state、quasi-static、stateful dynamic 与 unsupported，并将执行方式与 T0–T3 / not-recorded 时间证据分离。Compatibility assessment 复用既有单位量纲定义，独立评估端口硬边界与 Host、Strain、Medium、Temperature 的实验适用性。核心 resolver/assessment 不写 Project、Run、Workspace 或 schema，不调用 Simulation、Catalog verification、Instantiation 或 Ontology 推断来改变运行资格。仿真编排层在成功运行后复制输出可达模块与模块边的 assessment，形成 BFN-SIM-2.1 时间、上下文与不确定性 provenance；历史展示只读快照，不从当前 Project 回算。

Sender V1.2 位于独立的 evidence extension 层。它与冻结 Receiver runtime 的关系为：

```mermaid
flowchart LR
  V11["冻结 AHL/HSL V1.1"] --> VERIFY["既有 Catalog 验证"]
  VERIFY --> TRUST["20 条 trusted Receiver runtime"]
  TRUST --> RECEIVER["Receiver evaluator / inverse search"]

  V12["Sender Evidence Extension V1.2"] --> LOAD["Extension loader + validator"]
  LOAD --> BROWSE["Evidence browsing / exact source trace"]
  LOAD --> ADMIT["Sender runtime admission assessment"]
  ADMIT --> ZERO["当前 0 条 admitted"]

  V11 --> COMPOSITE["Composite Catalog presentation"]
  V12 --> COMPOSITE
```

`features/modeling/catalog/sender/v1_2` 保存源文件、无损 evidence types、CSV/JSON loader、发布与引用校验、展示范围和 runtime admission。`features/bfn/catalog` 只把验证后的扩展投影为 Catalog Search、Preview 与 Full Detail。Composite presentation 不成为 runtime authority；V1.2 presence 不改变 20 条 Receiver whitelist，0-admitted Sender 不生成 Module、Add 操作、Evaluator、自动连线或 inverse candidate。完整合同见 [Sender Evidence Extension V1.2](sender-evidence-v1.2.md)。

Batch 12.0 在 `features/bfn/user-defined` 增加纯 authoring contract 与只读 representation assessment。Batch 12.1、12.2 和 12.3 共用的生产路径为：

> User-defined Authoring
>
> ↓
>
> validated authoring contract
>
> ↓
>
> pure materialization
>
> ↓
>
> `BfnFunctionalModule`

Batch 12.0 authoring contract 检查保持冻结。Batch 12.0.1 将审定的通用表示缺口落实为 BFN-IR 2.1；Batch 12.0.2 将当前 schema 提升为 BFN-IR 2.2，仅增加用户端口角色标签的无损表示。Batch 12.1 在该冻结基础上增加纯 2.2 物化、静态创作界面、输出可达的必需输入校验和 BFN-SIM-2.1 不确定性合同。Batch 12.2 的 Designed Sender 是独立的受限创作入口：它把单浓度控制、Hill activation/repression 和单 `production_rate` 输出映射到同一通用 draft/materializer，最终仍保存普通 `BfnFunctionalModule`。已知 AHL/HSL 只通过只读 identity helper 投影 canonical Entity；该路径不读取 Sender evidence 或 Runtime Admission。

Batch 12.3 在通用用户模块入口增加受限的一阶动态创作。动态草稿只保存一份 Batch 12.1 稳态响应源，纯物化器据此生成 deep-equal 的 static response 与 dynamic steady-state response，并设置成对 active model ID。动态模型继续使用 BFN-SIM-2.1 已有的 `tau * dy/dt = f(x) - y` 数值路径；`tau` 固定使用小时，初始输出继承唯一输出端口单位，可选 `timeRangeHours` 继续使用既有适用域表示。输出可达反馈环路中含有效动态用户模块时，运行前校验返回 `dynamic_feedback_unsupported` error，不把顺序更新解释为耦合反馈求解。

Batch 12.4.0 将当前 schema 提升为 BFN-IR 2.3。普通 `BfnFunctionalModule` 可以保存独立的 `dynamic:accumulator` model，并可通过 `activeModelIds.dynamic` 成为 dynamic-only module；该 model 直接引用一个 input Port、一个 output Port 和有限 initial state，不携带 `tau`、`steadyStateResponse` 或 `response`。静态网络只解析 active static model；动态网络优先解析 active dynamic model，并保留既有 static fallback。Accumulator 位于当前 Monitor 的有效路径时，中央校验返回 `dynamic_process_runtime_unsupported`；BFN-SIM 继续为 2.1，不包含累积方程。

一次 Add to Network 只创建一个 `BfnFunctionalModule` 及必要 registry sidecar；Edge、Input Source、Output Monitor 与运行均由用户显式操作。Catalog registration、Ontology assignment 与 reusable library 继续延期，`production_rate → concentration` 仍由 Port Compatibility 硬拒绝，显式 Signal Pool / Accumulation 仍属于后续 Batch 12.4。Designed Sender 边界见 [Designed Sender 创作与信号产生语义](designed-sender-authoring.md)，静态工作流见 [用户定义静态功能模块创作与运行](user-defined-static-authoring.md)，动态工作流见 [用户定义一阶动态模块创作与运行](user-defined-first-order-dynamic-authoring.md)，当前表示扩展见 [BFN-IR 2.3 Dynamic Process 表示扩展](bfn-ir-2.3.md)，2.2 与 2.1 历史分别见 [BFN-IR 2.2 端口标签表示扩展](bfn-ir-2.2.md) 和 [BFN-IR 2.1 用户模块表示扩展](bfn-ir-2.1.md)，authoring 科学合同见 [用户定义功能模块科学与计算合同](user-defined-functional-modules.md)，开发阶段见 [BFN Development State Ledger](bfn-development-state.md)。

`ANNApproximation` 只在静态工作域存在时拟合。它保存有效权重、有效截距、R²、NRMSE、最大绝对误差、覆盖率以及 accepted/rejected 状态。固定点不生成 ANN 参数；近似被拒绝时继续使用完整非线性模型。

反向设计把功能参数 `θ` 与生物设计变量 `q` 分离，通过版本化校准映射计算候选完整响应，并综合评价功能误差、宿主负载、串扰、噪声、不确定性和遗传稳定性。结果是带 `proposed_unbuilt_design` 证据等级和验证建议的候选集合，不是一个无解释的最优答案。

原 `features/modeling`、V1.1 AHL/HSL 目录、检测记录映射和旧项目迁移器继续保留，用于历史文件诊断、来源追溯和显式迁移。V2 不会把旧版 `baseline / gain / sensitivity` 自动改名为完整响应模型，也不从荧光检测记录推断功能网络。

### 持久化层

Tauri 环境使用 `sqlite:fluorescence.db`，迁移位于 `src-tauri/migrations`。主要数据表：

- `detection_records`：记录元数据与版本化结果 JSON
- `channel_samples`：Demo/导入分析通道采样
- `hc08d_frames`：真实 480、515、555、CLR、饱和位图和原始文本行
- `sync_queue`：待同步操作
- `app_settings`、`workspace_cache`：设置与工作区缓存

浏览器开发模式使用 localStorage 回退，使界面和状态测试不依赖原生插件。该回退不用于生产数据库能力评价。

BFN-IR 2.3 项目和运行快照继续使用 `fluorescence-desktop.bfn-ir-project.v2` 与 `fluorescence-desktop.bfn-ir-runs.v2`；storage key 后缀保持不变以发现旧数据。新运行声明 `BFN-SIM-2.1` 并保存显式不确定性快照；历史 `BFN-SIM-2.0` 运行继续读取且不改写。项目导入接受合法 2.0、2.1、2.2 与 2.3，并通过 `bfnIrMigration.ts` 返回 2.3；未知未来版本 fail closed。Workspace Draft 与 Version read path 使用同一迁移，Version 只暴露迁移副本，不改写历史 snapshot。这些数据独立于检测 SQLite 表；BIO-NET 不复制原始帧，也不把检测结果自动解释为网络输入。

BFN-ONTOLOGY-1.0 是随应用发布的版本化只读 registry，不写 localStorage、IndexedDB、BFN Project、Version 或 Run。BFN-IR 对象升级不改变 object store 或 index，Workspace IndexedDB schema 继续保持 v1。

### 云端层

客户端使用 Supabase anon key 和用户会话。刷新令牌通过 Rust keyring 命令写入 Windows Credential Manager。服务端角色密钥只存在于 Edge Functions 环境。云端表以 RLS 和 `workspace_id + idempotency_key` 控制访问与幂等。

## 状态与恢复

主要检测路径：

```text
idle -> scanning -> idle -> connecting -> ready
ready -> running -> stopping -> finished / incomplete
任意活动状态 -> disconnected / error
```

Demo 允许 `ready -> zeroing/calibrating -> ready`。HC-08D 当前固件不支持这两个动作。

意外断线触发约 1、2、4 秒三次重连。显式断开、模式切换或运行时释放会取消所有重连、陈旧数据计时器、命令超时和通知订阅。连接代次用于丢弃旧事件。

## 国际化、可访问性与边界

- `zh-CN` 与 `en-US` 的翻译键结构保持一致。
- 状态使用文字、图标和颜色共同表达；饱和点在 SVG 外提供文字说明。
- 技术错误、UUID 和原始行按需展开，普通流程不直接暴露工程术语。
- 界面支持减少动态效果和减少透明度偏好。
- 真实硬件配置集中在协议与传输模块，不在页面硬编码最终 UUID。
- 真实信号单位、背景模型、标定、浓度换算和质量阈值均等待版本化科学输入。
