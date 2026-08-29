# Windows 端荧光检测工作台

BIT-CHINA 荧光检测项目的 Windows 研究原型。该子项目采用 Tauri 2、React、TypeScript 与 Rust，可通过 Windows 蓝牙直接连接 HC-08D，接收 STM32 发送的四路原始光强，控制 LED，并将采集记录保存在本机；同时包含依据正式方案改造的 BFN-IR 2.2 生物功能网络建模工作台、Demo、JSON/CSV 离线分析和可选团队同步流程。

当前界面名称“荧光检测工作台”和内部标识 `FluorescenceDesktop` 均为开发阶段标识，不代表最终产品命名。

## 当前状态

| 能力                                         | 状态                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| Windows 10/11 x64 桌面壳                     | 已实现                                               |
| 中文 / 英文界面                              | 已实现、持久化并完成文案审校                         |
| 演示设备扫描、连接、控制和三通道曲线         | 已实现                                               |
| HC-08D 扫描、连接、通知接收和检测光源控制    | 已实现，等待目标硬件完成双向真机验收                 |
| FFE0/FFE1 优先与自适应 GATT 发现             | 已实现；存在歧义时可在技术详情中手动选择             |
| 真实四路原始信号曲线、饱和标记和本地记录     | 已实现                                               |
| JSON / CSV 导入与 Demo 分析                  | 已实现                                               |
| BFN-IR 2.2 完整功能模块与理想连接            | 已实现；端口、上下文、适用域和证据等级均显式建模     |
| 静态/动态仿真、ANN 近似与双空间反向设计      | 已实现研究原型；内置参数、数据与候选均明确标为 Demo  |
| SQLite 历史、原始帧、通道采样和同步队列      | 已实现                                               |
| JSON / CSV 记录导出                          | 已实现                                               |
| Supabase 账号、工作区、RLS 与 Edge Functions | 已建立基础                                           |
| NSIS / MSI 安装包                            | 构建流程已配置；本轮 HC-08D 版本的最终产物见测试记录 |

真实硬件与 Demo 使用同一套页面结构，通过操作、状态和文案区分。真实 HC-08D 记录标记为 `RAW_ONLY`，不执行 Demo 背景校正、浓度换算或质量判定。Demo 中的标定参数、换算值、质量分和等级均未经实验验证。

## 运行路径

真实硬件的数据路径不经过手机、浏览器或云端中继：

```text
Windows 桌面应用
  ↔ BLE GATT
  ↔ HC-08D
  ↔ USART1
  ↔ STM32F103C8
  ↔ I²C1
  ↔ AS7341
```

HC-08D 通常只允许一个 Central 保持连接。电脑联调前应先断开手机及其他电脑；手机端和电脑端不能同时占用同一模块。

## 技术栈

- Tauri 2、Rust 2021、`btleplug`
- React 19、TypeScript 5、Vite 7
- Zustand、i18next、react-i18next
- Tauri SQL + SQLite
- Supabase Auth、Postgres、RLS、Edge Functions
- Vitest、React Testing Library、ESLint、Prettier

## 环境与快速开始

需要：

- Windows 10 或 11 x64
- 可用的 Windows 蓝牙适配器；真实联调时需打开系统蓝牙
- Node.js 22 或更高版本、npm 10 或更高版本
- 运行或打包 Tauri 时需要 Rust stable、Visual Studio Build Tools（Desktop development with C++）、Windows SDK 和 WebView2

安装依赖并打开浏览器开发界面：

```powershell
npm ci
npm run dev
```

浏览器开发地址为 `http://127.0.0.1:1420`。浏览器模式可检查界面和 Demo，不能代替 Windows 原生 BLE。运行桌面壳：

```powershell
npm run tauri dev
```

## HC-08D 真实采集

1. 断开手机和其他电脑对 HC-08D 的连接，并给 STM32 与 HC-08D 上电。
2. 在“设置 → 采集设备”选择“真实设备（HC-08D）”。
3. 打开“采集”，扫描并连接名称为 `HC-08D`、`HC-08` 或广播包含 `FFE0` 服务的兼容设备。Windows 未返回广播名称时，界面使用 `HC-08D (FFE0)` 标识设备。
4. 连接后观察 480 nm、515 nm、555 nm 与 CLR 原始光强；`65535` 会标记为数字饱和，数据仍保留并绘制。
5. “开启检测光源”和“关闭检测光源”分别发送 `@LED_ON\r\n` 与 `@LED_OFF\r\n`，界面等待 STM32 返回对应结果。
6. “开始记录”和“结束并保存”只控制电脑端记录边界，不会向当前固件发送 START 或 STOP。
7. 历史记录以 `RAW_ONLY` 保存，可导出 JSON 或 CSV。

默认优先匹配 FFE0 服务与 FFE1 特征，同时检查设备实际暴露的 Notify/Indicate 和 Write 能力。若存在多个有效组合，软件不会猜测，会在“硬件技术详情”中提供手动选择。详细协议见 [BLE 协议草案](docs/ble-protocol-draft.md)。

## 演示设备与文件导入

在“概览”选择“体验演示流程”可体验扫描、连接、调零、校准、三通道曲线、分析和记录流程。低电量、传感器错误等模拟状态收纳在采集页的“演示场景”中。演示传输会区分命令已发送、设备已接收和执行完成，并在断开、停止和销毁时清理计时器与订阅。

JSON 使用 `schemaVersion: 1` 的分析输入结构。CSV 必需列为：

```text
channelId,sequence,timestamp,elapsedMs,rawSignal,background
```

CSV 可附带 `sampleId`，文件大小上限为 10 MB。文件导入与 Demo 分析不改变真实硬件的 `RAW_ONLY` 科学边界。

## BFN-IR 2.2 网络设计

主导航中的“网络设计”默认打开 BFN-IR 2.2 固定工作台。顶部在“网络设计”和“按目标设计”两个一级工作区之间切换；网络设计把模式、输入摘要、直接连线、仿真运行和结果 Dock 放在同一连续任务中。核心对象包括 `FunctionalModule`、`InputSource`、`IdealEdge`、`Monitor`、实验上下文和适用域。功能模块保存完整响应模型；理想连接只传递端口量，不保存权重、偏置或内部状态。连接前会检查端口的实体、量类型与单位维度，并拒绝重复输入、自连接、静态环路和不兼容单位。

静态求解支持固定值与工作范围网格，保留完整 Hill、线性、恒等或独立多输入响应，并根据参数区间生成不确定性包络。动态求解支持常量、阶跃、脉冲、周期和自定义输入，使用状态空间/一阶动力学模型传播；静态模块可作为无记忆环节参与动态网络。求解结果记录引擎版本、上下文、适用域和校验结论。

ANN 是完整响应模型的局部替代表示，只在用户指定的工作域内训练与评价。工作台同时报告 R²、NRMSE、最大误差和区间覆盖率；未达到接受标准时保留完整非线性模型作为计算依据。反向设计显式区分模型参数空间 θ 与可实现设计变量空间 q，通过版本化标定映射生成候选，并按功能误差、实现负担、串扰、噪声、不确定性和遗传稳定性排序。候选状态固定显示为“提议、未构建”。

项目使用 `BFN-IR-2.2` JSON 结构在本机保存，可导入、导出与重置。合法 BFN-IR 2.0、2.1 项目与 Workspace Draft/Version 在读取时通过中央迁移暴露为 2.2；旧 `baseline / gain / sensitivity` 建模格式仍只识别和提示，不在缺少语义映射时静默改名。普通项目变化采用 320 ms 轻量自动保存，并明确显示保存中、已保存或失败。结果新鲜度由只包含可计算状态的 computation signature 派生：语义编辑会使结果过期，Undo 回到运行时状态会恢复当前结果，节点位置、schema 描述元数据和面板状态不参与比较。内置模块、数据集、标定关系、仿真值和反向设计候选均为演示数据，不代表实验验证或最终工程参数。完整结构和算法边界见 [BFN-IR 2.2 建模说明](docs/modeling.md) 与 [BFN-IR 2.2 端口标签表示扩展](docs/bfn-ir-2.2.md)；[BFN-IR 2.1 表示扩展](docs/bfn-ir-2.1.md) 保留为版本历史。

### AHL/HSL 文献元件库 V1.1

仓库继续保留重建并复核的静态发布包 `ahl-hsl-component-database-v1.1`。固定数据契约包含 29 种信号、42 个元件、7 个参数上下文、52 条受体响应、13 条完整观测配对、39 条定性兼容关系和 22 个来源。数据在启动时进行严格数量、引用和状态校验，并以只读形式加载，不依赖在线检索。

52 条受体响应中有 20 条具备精确、可执行的冻结曲线：19 条为 4PL/Hill 响应，1 条为固定 `n=1` 的去抑制响应。这些曲线保留原始工作范围和参数上下文，可作为 BFN 模块注册的证据候选；注册过程仍需补齐 BFN-IR 端口语义、适用域、证据等级和版本信息。其余响应继续用于候选比较、标定准备或来源审阅，软件不会补造参数。

13 条观测配对按原文中的完整实验组合展示，不能拆成新的单元参数。39 条兼容关系只表达定性支持、冲突或未知，不生成数值权重，也不参与求解。来源、序列和证据字段保留其报告边界；“来源已复核”不等于 BIT-CHINA 已完成实验验证、合成或测序。

BFN-IR 工作台的“证据与注册”页展示证据等级、适用上下文、模块目录和注册步骤。文献来源不会因进入目录而自动获得“团队验证”或“已构建”状态，历史元件库也不会被自动转换为完整功能模块。

## BFN-IR 科研建模工作台界面

网络工作台采用精密实验仪器式的信息层级：深海军蓝与品牌青用于选择和焦点，绿色表示兼容、连接和成功，品红保留给响应曲线与输出信号，琥珀表示过期与边界警告，红色表示错误。建模页回收全局 TopBar 的高度，并把网络组成、画布、属性栏和底部结果 Dock 固定在剩余视窗中；各区域只管理自己的内容滚动。属性栏首层只显示作用、输入输出、关键参数和模型依据，实验条件、数学模型和高级信息按需展开。浅色、深色与减少动态效果设置沿用应用全局偏好。

概览、采集、导入、历史、设置与网络设计共享同一套导航、信息概览、面板层级、状态语言和进场节奏。实时扫描线只在确有活动数据时运行，界面不会用装饰动效伪装设备在线、数据正在采集或分析已经验证。

## 可选云端配置

复制环境变量模板并填写托管 Supabase 项目的公开客户端配置：

```powershell
Copy-Item .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

客户端不得包含 `SUPABASE_SERVICE_ROLE_KEY`。云端迁移和 Edge Functions 的部署步骤见 [Supabase 配置](docs/cloud-setup.md)。

## 检查与构建

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check

cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

npm run tauri -- build
```

Tauri 配置同时生成 NSIS 和 MSI。首次原生构建需要访问 crates.io，并需要本机 MSVC 与 Windows SDK。

## 研究边界

- `HC08D-ASCII-DRAFT-0.2` 是当前固件联调协议，不等于最终产品协议。
- FFE0/FFE1 是优先联调值，软件以设备实际 GATT 能力为准；最终量产 UUID 仍需版本化确认。
- 真实信号的科学单位、背景模型、标定系数、浓度公式和质量阈值尚未输入本软件。
- BFN-IR 内置模型、数据集、参数区间、标定映射与反向设计候选均为演示或待验证内容；ANN 只描述给定工作域内的近似质量，理想连接不包含权重。V1.1 文献曲线保持其来源上下文和工作范围，定性兼容关系不进入数值求解。
- 云同步是可选能力；本地采集、导入和历史记录不依赖登录。
- 本软件不替代 HPLC、药典检测、实验室质量检验或经验证的专业仪器。

## 文档

- [架构说明](docs/architecture.md)
- [BLE 协议草案](docs/ble-protocol-draft.md)
- [开发与打包](docs/development.md)
- [测试说明](docs/testing.md)
- [BFN-IR 2.2 建模说明](docs/modeling.md)
- [BFN-IR 2.2 端口标签表示扩展](docs/bfn-ir-2.2.md)
- [BFN-IR 2.1 表示扩展历史](docs/bfn-ir-2.1.md)
- [Supabase 配置](docs/cloud-setup.md)
- [HC-08D 已批准设计规格](docs/superpowers/specs/2026-07-24-hc08d-windows-ble-design.md)
