# 测试说明

## 自动化检查

前端：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

Rust：

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

真实硬件自动冒烟需要给 HC-08D 上电，并先断开手机或其他电脑：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test hc08d_hardware_smoke -- --ignored --nocapture
```

该命令直接调用正式程序使用的 `btleplug` Windows BLE 实现，依次完成 8 秒扫描、GATT 选择、3 帧有效数据接收、`LED_ON_OK`、`LED_OFF_OK` 与主动断开。测试结束时会再次发送 `LED_OFF`，避免异常退出后 LED 保持开启。

没有硬件时，可用 Android 版 nRF Connect 配置 `FFE0/FFE1` GATT Server，并运行手机模拟模式：

```powershell
$env:NRF_PHONE_SMOKE = "1"
cargo test --manifest-path src-tauri/Cargo.toml --test hc08d_hardware_smoke -- --ignored --nocapture
```

该模式等待一行有效样本，不检查硬件 LED 响应。可通过两次 Notification 分别发送 `480:100,515:200,` 和 `555:300,CLR:10\r\n`，验证跨通知分片重组。

截至 2026-08-03、V1.1 元件库接入前，本分支的已记录基线为：

- Vitest：当前分支 42 个测试文件、205 个测试用例通过；
- Rust：7 个单元测试通过；
- TypeScript、ESLint、本次变更文件 Prettier 检查通过；
- Vite 生产构建、Rust fmt/clippy/test 与完整 Tauri 构建通过，生成 NSIS 和 MSI；
- 中英文翻译键结构完全一致；
- 1440×900 本地界面完成赛博科研主题、建模画布、参数检查器和运行结果视觉检查；1280×720 复核了深浅主题、滚动后固定弹窗、运行叙事、跳过状态及建模边界提示的收起/展开对比度；
- 浏览器控制台无错误或警告。

以上数字只记录当日基线，不代表 V1.1 接入后的最终结果。本轮最终文件数、用例数和构建状态以完成实现后实际运行“自动化检查”的输出为准，不预填通过状态。

项目级 `npm run format:check` 在该基线中会同时报告 60 余个当时未修改的既有文件。V1.1 接入完成后仍需重新运行项目级检查，并准确记录结果。

## BFN-IR 2.0 自动化验收范围

本轮平台改造新增以下可重复检查；最终通过数量以本轮命令输出为准：

- `src/features/bfn/validation.test.ts`：理想连接的实体、量类型、单位维度、单上游约束、重复、自连接和静态环路检查；
- `src/features/bfn/simulation.test.ts`：静态工作域网格、完整非线性响应、不确定性包络、ANN 指标与接受门槛，以及常量、阶跃、脉冲、周期和自定义动态输入；
- `src/features/bfn/reverseDesign.test.ts`：θ 参数空间与 q 设计变量空间分离、标定映射、完整曲线复算和六项多目标排序；
- `src/features/bfn/repository.test.ts`：BFN-IR 2.0 本地往返、旧版存储识别、非法 JSON 拒绝和运行记录边界；
- `src/pages/ModelingPage.test.tsx`：四个工作区页签、理想连接交互、静态/动态仿真、ANN 结果、反向候选、证据目录、导入导出和 Demo 边界。

自动化检查不把 Demo 参数提升为实验数据，也不把 ANN 接受状态解释为生物学验证。真实模块注册需要按端口、上下文、适用域、证据等级和版本完成独立复核。

### 2026-08-20 本轮执行结果

- TypeScript `tsc --noEmit` 与 ESLint 全项目检查通过；
- BFN-IR 定向检查为 5 个测试文件、25 个测试通过，并包含粗时间步有界性；全量 Vitest 为 53 个测试文件、294 个测试通过；
- Vite 生产构建通过，188 个模块完成转换；主 JavaScript chunk 为 574.35 kB，构建保留代码拆分提示；
- Rust `fmt --check`、Clippy `-D warnings` 与测试通过，7 个单元测试通过；需要真实 HC-08D 的 1 个冒烟测试按设计忽略；
- 完整 Tauri release 构建通过，生成 `FluorescenceDesktop_0.1.1_x64-setup.exe` 和 `FluorescenceDesktop_0.1.1_x64_en-US.msi`；
- 1440×900、1280×720 与 1180×700 本地渲染均无横向溢出；完整模型、ANN 结果和反向候选完成交互检查，浏览器控制台无警告或错误；
- 本轮改动文件通过 Prettier 检查。项目级 `npm run format:check` 仍报告 112 个历史文件，与本轮功能改造无关，未批量重写。

### 2026-08-25 BFN Batch 2 交互验收

- TypeScript `tsc --noEmit` 与 ESLint 全项目检查通过；全量 Vitest 为 61 个测试文件、333 个测试通过；
- Vite 生产构建通过，197 个模块完成转换；主 JavaScript chunk 为 604.61 kB，构建保留代码拆分提示；
- 自动化覆盖画布端口直接连线、兼容与拒绝反馈、多输入端口、节点拖动、智能放置、连接与模块直接删除，以及编辑目标中的 Delete 保护；
- Undo/Redo 覆盖项目和选择快照、语义编辑与布局编辑、输入抽屉分组、分支历史清空、75 步容量边界，以及 `Ctrl+Z`、`Ctrl+Y`、`Ctrl+Shift+Z` 快捷键；
- `docs/ui-audit/direct-manipulation/` 保存 6 张 1440×900 浏览器截图，分别记录默认编辑器、兼容拖线、无效目标、连线完成、撤销/重做和多输入节点；
- 1280×720 复核中页面无横向溢出，画布内部滚动保持可用；所有端口位于对应节点边缘，多输入端口保持独立纵向位置。

### 2026-08-25 BFN Batch 2.1 + Batch 3 验收

- TypeScript `tsc --noEmit`、ESLint 全项目检查与本轮 21 个文本文件的 Prettier 检查通过；
- 全量 Vitest 为 64 个测试文件、349 个测试通过；新增结果 computation signature、Undo/Redo 新鲜度恢复、Overlay 快捷键锁、固定工作台、属性折叠、结果 Dock、颜色语义和自动保存状态回归；
- Vite 生产构建通过，199 个模块完成转换；主 JavaScript chunk 为 608.15 kB，构建保留既有代码拆分提示；
- 结果签名排除节点位置、选择、Drawer、Dock、时间戳和滚动等 UI 状态，包含当前求解使用的输入、模块、模型、参数、连接、输出、分析设置和 registry 数据；
- 1440×900 与 1280×720 均完成真实浏览器交互检查。1280×720 下页面 `clientHeight` 与 `scrollHeight` 均为 720 px，结果 Dock 展开后页面高度不变；画布和属性栏分别管理内部滚动；
- `docs/ui-audit/workbench-polish/` 保存 10 张截图，覆盖默认工作台、属性首层/展开层、结果 Dock、选中/兼容/过期状态、按目标设计、导航、1280×720 和深色模式。

### 2026-08-25 Batch 3.6 Desktop Surface Consolidation 验收

- `src/pages/ModelingPage.batch36.test.tsx` 覆盖连续两行顶部表面、DEMO 元数据、自动保存运行状态、普通证据色、工作区与结果 Dock 共用外边界，以及当前结果的轻量状态表达；
- `src/pages/DesktopSurfaceConsolidation.test.tsx` 覆盖概览、采集、导入、记录和设置页的 `desktop-surface` 结构，并复核原快捷操作、扫描、采集、文件选择、搜索和主题切换仍可用；
- `src/features/bfn/presentation.test.ts` 覆盖普通证据、外部验证、独立假设和未构建设计的展示层映射，不修改 `BfnEvidenceGrade` 领域类型；
- `src/features/bfn/bfn-platform.styles.test.ts` 覆盖单一工作台边界、内部 Toolbar/Workspace/Dock Divider、工程网格、选择/兼容/信号色分工和共享页面连续表面；
- `docs/ui-audit/surface-consolidation/` 保存 10 张 1440×900 截图。1280×720 实机测量中，文档宽度与视口宽度均为 1280 px，顶部表面为 48 px 项目行与 40 px 运行行，Run 按钮完整可见；网络工作区和采集页控制面板保持可用，页面级水平溢出为 0。

最终验证结果：TypeScript 与 ESLint 通过；Vitest 共 67 个测试文件、370 项测试全部通过；Vite 生产构建完成 203 个模块转换。构建保留既有的单一大 chunk 提示，不影响产物生成。

当前自动化覆盖：

- 检测状态合法转换与断线状态保护；
- Demo BLE 扫描、连接、三通道采样、故障和资源释放；
- HC-08D 分片、超过 100 ms 的延迟分片、多行、相邻帧、数值范围、数字饱和与命令编码；
- FFE0/FFE1 优先、完整 Base UUID、唯一分离特征、双向特征和歧义拒绝；
- Windows 原生运行时名称过滤、广播 `FFE0` 后备识别、连接代次和重连条件；
- LED 单一在途命令、匹配响应、错误响应和超时；
- 真实开始/结束仅控制本机记录，不发送 START/STOP；
- 真实帧到三条原始曲线与 CLR 的映射；
- `RAW_ONLY` 本地保存、SQLite 迁移与原始 CSV 导出；
- JSON / CSV 导入与 Demo 分析；
- 同步状态、退避与幂等键；
- 六项固定导航、模式选择、LED 控件、饱和提示和折叠技术详情；
- BIO-NET 三类节点、显式分子端口、稳态引擎 V2、收敛信息和输出范围；
- 不带边参数的精确分子连接、自连接/重复连接拒绝和 V1→V2 导入迁移；
- 参数状态门禁：待标定、仅供参考、未验证和实验性参数不能运行；
- V1.1 固定发布包计数、状态计数、跨表引用、只读加载和篡改拒绝；
- 20 条可信响应白名单、4PL/Hill 与固定 `n=1` 求值、`M` 单位、工作范围和参数上下文门禁；
- 正向模拟与反向设计共用可信求值器，只搜索当前主输出可达输入，Use this design 只改变候选中的输入节点值；
- 检测记录仅在反向设计目标或已知网络验证场景中使用，必须通过版本化映射，并随运行快照安全保存和恢复；
- 建模入口、页面切换、稳态运行、运行快照和无映射状态；
- 完整运行、参数重算与减少动态效果三套叙事时序，以及连接排序和章节采样；
- 检测记录列表、分析记录与原始记录的曲线模式、完整分辨率悬浮读数和空状态操作；
- 节点输入/输出端口能力、自连接和重复连接拒绝，以及导入模型使用同一连接规则；
- 画布端口直接拖拽、连接预览、分子精确匹配、动态扩展、节点避碰、作用方向与表单输入时的删除键保护；
- 会话操作追溯的重复合并、容量边界和类型映射；
- 13 条完整观测配对保持整体边界，39 条定性兼容关系不能进入数值求解；
- 应用响应只新增独立处理节点且不自动连线，附加引用不改变节点参数、端口和网络连接；
- 应用壳渲染、语言切换和真实模式不显示 Demo 边界。
- BFN-IR 完整功能模块、理想连接、端口三元组、上下文、适用域和证据等级的结构校验；
- 静态范围扫描、参数不确定性包络、动态输入与状态传播，以及静态模块在动态网络中的无记忆执行；
- ANN 工作域内拟合、R²/NRMSE/最大误差/区间覆盖率评价和不合格近似拒绝；
- θ/q 双空间反向设计、版本化标定映射、六项多目标排序和“提议、未构建”状态；
- BFN-IR 2.0 项目持久化、旧格式提示和页面四区工作流。

自动化测试验证协议和状态逻辑，不代替真实射频环境、硬件 LED、功耗与长时间稳定性测试。

## 文献依据元件目录测试矩阵

以下矩阵定义 `ahl-hsl-component-database-v1.1` 与稳态引擎 V2 的验收范围。它不代表本轮最终命令已经通过；实际结果以完成实现后运行“自动化检查”和 Windows 手工矩阵时的记录为准。

### 单元与数据契约

| 检查面                     | 自动化覆盖要求                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定版本、ID 与数量        | 发布版本固定为 V1.1；29 signals、42 components、7 parameter contexts、52 receiver responses、0 sender outputs、13 observed pairs、39 compatibility relations、22 sources 与发布契约完全一致             |
| 固定状态计数               | 组件状态 `runtime-demo/calibration-candidate/compatibility-only/reference-only` 为 7/26/3/6；响应状态 `runtime-demo/calibration-candidate/compatibility-only` 为 20/15/17；运行白名单精确包含 20 条响应 |
| 结构与跨表引用             | ID 唯一；输入/输出分子、组件、上下文和来源引用必须存在；必需数组不能用 `null` 代替；未知值不能用零或示意值补齐                                                                                          |
| 不可变可信加载             | 成功加载的原始发布包、适配目录和展示模型深度冻结；调用方复制、伪造对象或只复用白名单 ID 不能获得运行资格                                                                                                |
| 曲线求值                   | 19 条 4PL/Hill 和 1 条固定 `n=1` 响应在零点、EC50、工作范围边界与代表性浓度的结果正确且有限                                                                                                             |
| 单位、范围与上下文         | 只接受 `M`、有限且非负的输入；非零值必须位于工作范围；到达主输出的可信响应必须属于同一参数上下文                                                                                                        |
| 浓度输入绑定               | 匹配输入持久化目标响应、上下文、分子、`M` 单位和工作范围；只能连接目标响应，输出强度固定为 1，重启、导入与撤销后保持一致                                                                                |
| 防篡改门禁                 | 修改 EC50、Hill 系数、方向、工作范围、输入/输出信号、来源、上下文、版本、模型类型或执行标志均拒绝运行和导入                                                                                             |
| 完整配对与兼容边界         | 13 条观测配对保持完整记录，不拆成新参数；39 条兼容关系的 `numeric_use_allowed` 始终为 false，不生成权重                                                                                                 |
| 应用响应                   | 只有可信运行响应可新增一个独立处理节点；节点恰有一个输入和一个输出，不自动连线，不覆盖已有节点，端口与线性系数保持中性                                                                                  |
| 引用附加与解除             | 只增删版本化 `catalogReference`；节点参数、响应绑定、端口、网络连接、主输出和检测映射保持不变，伪造展示对象会被拒绝                                                                                     |
| 正向与反向一致性           | 正向模拟和反向设计调用同一可信曲线；只搜索主输出可达输入；文献支路按对数尺度搜索工作范围并包含 EC50，超范围候选不能应用                                                                                 |
| 检测引用快照               | 反向目标和已知网络验证引用保存记录 ID、映射版本与演示状态；恢复时引用完整，验证网络 ID 不匹配或字段非法的快照被拒绝                                                                                     |
| schemaVersion 2 与 V1 迁移 | V1 模型导入后迁移为 V2 三类节点和端口结构；V2 响应绑定重新核对冻结发布包，未知或被修改绑定不能静默运行                                                                                                  |

### 组件、国际化与可访问性

| 场景                   | 组件检查要求                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 中英文与未知值         | 中英文标签、状态和边界含义一致；未知值显示“未知 / Unknown”，来源原文可保留原语言，不能被表述为团队实测结果                              |
| 搜索与四项主筛选       | 名称、别名、双语 Family 名称、输入分子、DOI、PMID、accession 可检索；Function、可用状态、输入分子和宿主可组合筛选；无结果状态可一键清除 |
| 42 个元件与 52 条响应  | 组件列表数量、响应数量、当前选中项、20 条可运行标识和不可运行原因一致；一条输出未知的响应仍作为参考项展示                               |
| 详情渐进展开           | 首屏突出输入、输出、方向、模型、EC50、Hill、工作范围和上下文；证据缺口、配对、兼容关系和来源按需展开                                    |
| 长 DOI、网址与登录号   | 长值不撑破网格；用户可查看完整 DOI、URL 和 accession，按钮文字不发生突兀换行                                                            |
| 键盘焦点与 Escape      | 打开后焦点进入对话框，Tab 焦点留在弹窗内，方向键选择结果，Escape 关闭并把焦点还给入口                                                   |
| 应用与引用资格         | 主操作只对 20 条可信响应启用并新增独立节点；其他条目保留浏览或次要引用，不生成待标定的伪运行节点                                        |
| 绑定参数只读           | 已应用节点的响应 ID、分子、方向、EC50、Hill、工作范围、上下文和来源只读显示；新增匹配输入节点使用精确分子和 EC50 初值                   |
| 页面保持性             | 应用只新增节点且不自动连线；引用附加或解除只改变明确的引用字段，现有结构、端口、参数和输出选择不被悄然改写                              |
| 视觉对比与减少动态效果 | 正文和说明文字不小于 14 px，交互控件有 `:focus-visible`，长值可换行展开；`prefers-reduced-motion` 下压缩弹窗动画和过渡                  |

### Windows 手工验收

| 场景                   | 操作与期望                                                                                                              | 状态 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---- |
| 1280 px 深色中文       | 搜索、四项筛选、查看响应并展开长 DOI/登录号；列表和详情保持可读，不出现水平溢出                                         | 待测 |
| 1280 px 浅色英文       | 重复浏览、无结果、清除筛选、可运行资格与未知值检查；文字、边框、焦点和禁用态均清晰                                      | 待测 |
| 1920 px 深色英文       | 检查元件列表、响应详情、长名称、来源链接和科学边界；控件和数值不出现突兀换行                                            | 待测 |
| 1920 px 浅色中文       | 检查 42/52/20 数量、详情分组、附加引用和解除操作；视觉层级与深色主题一致                                                | 待测 |
| 仅键盘流程             | 使用 Tab、Shift+Tab、方向键、Enter 和 Escape 完成浏览、选择、应用、附加或关闭；关闭后焦点回到入口                       | 待测 |
| 文献响应正向运行       | 应用一条 4PL 响应，新增匹配分子输入并拖线；输入使用 `M`、科学计数法和对数滑杆，在零点、EC50、工作范围边界检查归一化输出 | 待测 |
| 文献响应反向设计       | 对同一网络设置 `[0, 1]` 目标；候选浓度位于工作范围并含 EC50，采用后只改变输入值，正向复算结果一致                       | 待测 |
| 上下文与范围拒绝       | 构造上下文冲突、多个输入、非 `M` 单位和超范围值；运行被阻止且提示公众可读，已有模型不丢失                               | 待测 |
| 批量节点与画布扩展     | 连续应用 20 条运行响应并添加匹配节点；新节点不覆盖已有节点，超过初始区域后画布向下扩展，节点可选择、拖动和连接          | 待测 |
| 检测引用保存与恢复     | 分别设置反向目标和网络验证记录，运行、恢复并重启；记录 ID、映射版本、演示状态和网络身份保持一致                         | 待测 |
| 引用保持性             | 附加后运行、保存项目、创建快照并重启；引用持续存在，仿真数值不因引用改变，解除后其余模型字段不变                        | 待测 |
| V1 模型迁移            | 导入 schemaVersion 1 模型；确认自动迁移为 V2 三类节点/端口结构，网络可继续编辑和运行                                    | 待测 |
| 目录不可用与版本不支持 | 使用测试构建触发数据校验失败和旧目录版本；工作区与模型保持可用，新附加被阻止，已有引用保持可见                          | 待测 |
| 系统减少动态效果       | 开启 Windows 减少动画设置后重开目录；弹窗、筛选和详情切换无持续扫描或装饰位移，焦点反馈仍清晰                           | 待测 |
| Windows 桌面构建       | 执行 `npm run tauri -- build`，记录退出码、NSIS/MSI 产物或本机 Rust、MSVC、Windows SDK 的准确阻断信息                   | 待测 |

## HC-08D 双向真机冒烟步骤

优先执行上面的真实硬件自动冒烟，确认基础双向链路后，再按以下步骤检查完整界面、保存、导出、重连和持续运行。

### 1. 准备

- 断开手机及其他电脑与 HC-08D 的连接。
- 给 STM32F103C8、HC-08D 和 AS7341 上电。
- 打开 Windows 蓝牙。
- 启动本次构建的桌面应用，在“设置”选择“HC-08D 真实设备”。

### 2. 扫描与 GATT

- 扫描后确认目标设备只出现一次并显示 RSSI。
- 连接目标设备。
- 展开“硬件技术详情”，记录实际 Service、Notify 和 Write UUID。
- 若出现候选歧义，手动选择后确认通知开始到达。
- 检查仓库与导出，不保存完整 MAC 地址。

### 3. 上行数据

- 连续接收至少 20 个有效帧。
- 记录 20 帧首尾接收时间，确认周期约为 0.5 秒。
- 逐项对比界面中的 480、515、555、CLR 与最近原始行。
- 确认值为 `65535` 时显示“数字饱和”，曲线和导出仍保留该值。
- 若观察到畸形行，确认后续有效帧仍能继续显示。

### 4. 下行 LED

- 点击“打开 LED”，观察硬件 LED 实际点亮。
- 确认原始监视器收到 `LED_ON_OK`，命令状态显示完成。
- 点击“关闭 LED”，观察硬件 LED 实际熄灭。
- 确认原始监视器收到 `LED_OFF_OK`，命令状态显示完成。
- 通过固件调试工具发送一次未知命令时，确认返回 `ERROR_COMMAND`；该步骤不从正式 UI 发送不支持命令。

### 5. 本机记录与导出

- 填写真实样本编号并选择“开始记录”。
- 收集至少 20 帧后选择“结束并保存”。
- 在“记录”打开新记录，确认状态为 `RAW_ONLY`。
- 确认帧数、时长、协议版本和饱和帧数正确。
- 分别导出 JSON 和 CSV，对比 480、515、555、CLR、时间和饱和字段。
- 确认记录中没有背景值、校正信号、浓度、Demo 分数或 Demo 等级。

### 6. 断线与重连

- 连接期间关闭 HC-08D 电源，确认界面提示数据中断或重连。
- 重新上电，观察约 1、2、4 秒的自动重连尝试；连接成功后数据恢复。
- 主动点击断开，确认软件不再自动重连；当前曲线、当前结果、会话计时和硬件帧缓存应清空，已经保存的历史记录应继续保留。
- 重复连接和断开三次，确认没有重复通知或重复帧。

### 7. 30 分钟持续测试

保持连接 30 分钟并记录：

- 帧数持续增长；
- 无重复订阅造成的重复帧；
- 原始监视器维持上限，不无限增长；
- 图表持续更新且只保留规定窗口；
- 没有未经操作的意外命令；
- 应用保持响应，内存没有持续无界增长。

### 8. 安装包复测

- 在干净 Windows 用户配置或第二台 Windows 电脑安装 NSIS 包。
- 重复扫描、连接、接收 5 帧、打开 LED、关闭 LED 和断开。
- 若比赛电脑使用 MSI，使用 MSI 重复同一流程。
- 验证卸载后不遗留运行进程；用户数据的保留或删除按安装策略记录。

## Windows 手工矩阵

| 场景                              | Windows 10 x64 | Windows 11 x64 |
| --------------------------------- | -------------- | -------------- |
| 首次启动与 WebView2               | 待测           | 通过（25H2）   |
| 1180×700 最小窗口                 | 待测           | 待测           |
| 中文 / 英文切换与重启持久化       | 待测           | 待测           |
| Demo 扫描、连接、采集、分析       | 待测           | 待测           |
| BFN-IR 2.0 建模、仿真与 JSON 往返 | 待测           | 待测           |
| 检测记录目标/网络验证映射         | 待测           | 通过（25H2）   |
| HC-08D 扫描、连接与 20 帧接收     | 待测           | 待测           |
| LED_ON / LED_OFF 双向确认         | 待测           | 待测           |
| 电源循环与自动重连                | 待测           | 待测           |
| `RAW_ONLY` 保存与 JSON/CSV 导出   | 待测           | 待测           |
| 30 分钟持续连接                   | 待测           | 待测           |
| NSIS 当前环境安装 / 启动 / 卸载   | 待测           | 通过（25H2）   |
| MSI 当前环境安装 / 启动 / 卸载    | 待测           | 通过（25H2）   |
| NSIS 干净安装                     | 待测           | 待测           |
| MSI 干净安装                      | 待测           | 待测           |

## 2026-07-24 HC-08D 实测记录

下表只填写实际观察结果。自动化通过不自动填充硬件项目。

| 项目                      | 实际结果                          |
| ------------------------- | --------------------------------- |
| Windows 版本              | 25H2，build 26200.8875            |
| 应用 commit               | `feat/windows-desktop` 当前工作树 |
| HC-08D 广播名称           | 8 秒真实扫描未发现目标广播        |
| HC-08D / STM32 固件版本   | 待测                              |
| 实际 Service UUID         | 待测                              |
| 实际 Notify UUID          | 待测                              |
| 实际 Write UUID           | 待测                              |
| 连续接收 20 帧            | 待测                              |
| 约 0.5 秒周期             | 待测                              |
| `65535` 饱和显示与保留    | 待测                              |
| `LED_ON` 与 `LED_ON_OK`   | 待测                              |
| `LED_OFF` 与 `LED_OFF_OK` | 待测                              |
| `RAW_ONLY` 保存与导出     | 待测                              |
| 电源循环自动重连          | 待测                              |
| 主动断开不重连            | 待测                              |
| 30 分钟持续测试           | 待测                              |
| NSIS 当前环境安装         | 安装、启动、WebView2、卸载通过    |
| MSI 当前环境安装          | 安装、启动、WebView2、卸载通过    |
| NSIS 干净安装             | 待测                              |
| MSI 干净安装              | 待测                              |

2026-07-24 首次运行真实硬件自动冒烟时，Windows BLE 管理器和适配器初始化成功，扫描也正常启动；扫描结果中没有名为 `HC-08` 或 `HC-08D` 的设备，因此没有继续连接、收数或发送命令。设备上电且释放手机连接后，使用上述命令原样复测。

同日使用最终构建对 NSIS 与 MSI 各执行一次当前 Windows 用户环境下的安装、启动和卸载。两种安装均成功，已安装程序运行 8 秒未提前退出并创建 WebView2 进程，卸载返回成功；测试注册项和 `D:\tmp` 临时安装目录均已清理。该结果验证安装包闭环，不替代干净用户或第二台电脑复测。

## 已知测试边界

- 浏览器开发模式不提供 Windows 原生 BLE，必须使用 Tauri 桌面程序完成硬件测试。
- 当前固件没有版本读取命令，固件版本可在可用时由硬件团队人工填写。
- 无第二台干净 Windows 环境时，可先用新建本地用户验证安装；报告中需注明环境。
- 真实信号的实验标定与科学结论属于后续评价阶段，不纳入本次链路冒烟通过条件。

## 2026-08 BFN-IR 2.0 与应用壳回归点

- 建模页回归覆盖四区切换、对象选择、理想连接、完整模型静态/动态运行、ANN 评价、反向设计候选、证据目录和项目 JSON 往返。
- 页面必须持续显示 Demo/未验证边界；ANN 被拒绝时继续使用完整模型，反向候选始终标为“提议、未构建”。
- 应用壳回归覆盖导航栏路由选择、活动页面状态、语言切换和布局持久化。
- 采集中断回归覆盖停止/取消、采集中断线、活动订阅与计时器清理，并恢复到显式空闲或错误状态，不生成伪造结果。

## 2026-08 Batch 3.5 科学桌面视觉回归

自动化检查覆盖以下界面契约：

- 全局浅色/深色主题共享同一套 `--ui-*` 语义变量；
- 建模页保持固定桌面工作区，对象索引、画布、属性栏和结果 Dock 分别管理滚动；
- 撤销、重做、分析模式、输入设置和运行命令位于同一分析工具栏；
- 属性检查器使用名称、数值、单位对齐的属性行，并支持按需参数解释；
- 节点选中、连接兼容、运行状态和荧光信号使用不同语义色；
- 画布包含 20 px / 100 px 工程网格，不使用发光、悬浮抬升或小于 10 px 的建模文字；
- 模块抽屉保持三条列表行及明确的“添加到网络”操作；
- 结果 Dock、逆向候选排序、中英文结构和全局导航保持可操作。

桌面浏览器审计在 1440×900 下生成 9 张截图，并在 1280×720 下额外测量布局边界。1280×720 的文档宽度与视口宽度均为 1280 px，页面级水平溢出为 0；项目工具栏、分析工具栏、三栏工作区与结果 Dock 均位于视口内。画布保留自身滚动条以浏览完整 980×520 工程空间。审计记录见 `docs/ui-audit/scientific-desktop/README.md`。

## 2026-08-26 Batch 4 科学结果与图稿工作流验收

自动化新增覆盖：

- 图表坐标验证、线性与 Log10 刻度、自动/手动范围、重置、系列独立显隐和科学计数法标签；
- 指针与键盘精确点光标、静态/动态工具提示、多输入工具提示滚动和焦点保持；
- SVG 向量输出、3× PNG 栅格输出、CSV 原始精度、剪贴板图像/数据/图注及平台能力失败提示；
- 运行溯源、未知时间与未知值本地化、运行时输入/输出信号语义和 Demo/未验证边界；
- 按 networkId、mode、primaryInputSourceId、outputMonitorId 筛选兼容历史运行，一次叠加一条历史曲线，并在独立采样网格上读取最近真实点；
- 对比运行失效时自动清除，Log10 与历史非正坐标冲突时回退，不推断历史运行缺失字段。

阶段门禁实际通过 TypeScript、ESLint、75 个 Vitest 文件中的 456 个测试，以及 Vite 生产构建。构建转换 214 个模块，主 JavaScript chunk 为 666.98 kB、gzip 202.62 kB，并保留大于 500 kB 的既有代码拆分提示。

浏览器审计生成 10 张 1440×900 PNG。1280×720 下 document 与 body 的 clientWidth、scrollWidth 均为 1280 px，页面级水平溢出为 0；分析模式、输入设置、运行、X/Y 轴、导出和历史对比控件均在视口内可用。结果面板与工作台底边相差 0.67 px（子像素布局舍入），保持底部 Dock 结构。

实际界面导出核验结果：SVG 包含 3 条 path、12 个 text 元素、白色背景且不含 `<image>`；PNG 为 2280×900；CSV 含 UTF-8 BOM、1 行表头和 33 行原始结果。完整截图说明、尺寸与导出文件见 `docs/ui-audit/scientific-results/README.md`。

## 2026-08-26 Batch 4.1 结果语义与完整性修复

自动化覆盖以下边界：

- 新运行生成输入/输出信号语义快照；旧运行可加载，损坏快照按 repository 边界拒绝；
- 当前项目修改同 ID 对象的标签或单位后，历史运行仍使用运行时快照；多输出网络按结果实际选择的 monitor 显示单位；
- 中英文坐标轴、Tooltip、图注、SVG 和溯源字段使用统一结果信号解析器，不泄露内部 entity code；CSV 继续保留机器可读原始 ID；
- `[2, 5]`、`[2, 50]`、`[0.2, 0.8]` 与 `[1, 1000]` 的 Log10 工程刻度，以及非正值拒绝；
- Full、ANN、rejected ANN、历史对比和参数区间的主线计数；仅在操作会隐藏最后一条可用主线时阻止；
- 手动 X 范围内 Home、End、方向键与指针共享可见点集合，范围变化排除当前光标时清除光标；
- 两条新运行按信号 entity、quantity type 和 unit 严格比较；旧运行保留四项 ID 兼容并标记为 legacy identifiers。

1440×900 浏览器审计保存 5 张条件截图。旧运行截图未通过开发脚本注入隐藏状态；旧运行安全回退由 repository、resolver、chart model 和页面测试覆盖。实际界面重新导出的 SVG 不含 `normalized_reporter_expression`、`normalized_promoter_activity` 或 `dimensionless`，并包含“报告信号”和“相对值”；PNG 为 2280×900；CSV 表头保留 `input:source-ahl` 与 `module:module-ahl-sensor` 等稳定 ID。审计说明与产物见 `docs/ui-audit/scientific-results-fixes/README.md`。

最终门禁实际通过 TypeScript 与 ESLint；Vitest 共 76 个测试文件、477 项测试全部通过；Vite 生产构建转换 215 个模块。主 JavaScript chunk 为 671.75 kB、gzip 204.19 kB，构建继续报告既有的大于 500 kB 代码拆分提示，产物生成成功。

## 2026-08-26 Batch 5.0 Catalog → BFN scientific contract

本轮自动化覆盖以下数据与执行边界：

- 使用冻结 runtime whitelist 对全部 20 条 receiver response 做表驱动数值等价检查，分别比较零点、工作范围下界、上界以及 EC50 或范围内点；
- 验证 19 条 4PL 的 BFN `ymin/ymax` 固定为 0/1，来源 basal/maximum 只进入 provenance；验证 Shong EsaR 的数学 family、`K=2.1e-7 M`、`n=1` 与 biological derepression；
- 验证零点合法且不外推，正值范围外、负数、NaN 和 Infinity 拒绝执行；普通 BFN 域外 warning/extrapolated 回归保持不变；
- 验证 Input Source 与 Functional Module 输出的 exact entity、exact quantity 和单位量纲兼容解析，排除 Output Monitor，不做 alias/fuzzy match，也不自动选择来源；
- 验证匹配输入源使用 canonical chemical identity、M、精确工作范围、33 个静态点和范围下界动态常量，且不创建 Edge；
- 验证 module-only 与 module-plus-source 的单次原子 mutation、全局 node/port/domain ID 冲突、既有节点/Monitor/Edge 保持不变；
- 对 reference、EC50、Hill、0/1 边界、输入/输出端口、工作范围、context、response、source IDs 和 runtime implementation 执行 tamper 检查；
- 验证 unknown release 和 malformed reference 项目可读取，验证与运行以 Catalog 业务错误安全终止，不出现 TypeError，也不使用复制参数回退；
- 验证静态 Catalog model 在 dynamic network 中无记忆执行，不生成 tau；验证非 Demo project 中位于输出可达计算子图的 runtime-demo model 会把结果标为 Demo，实验有效性保持 `not_validated`；
- 验证 sender outputs 仍为 0、13 条 effective pair 不可拆分、39 条 compatibility relation 不允许数值使用；
- 验证 computation signature 感知 Catalog reference、来源参数、derived model、ports 和 validity domain；旧项目没有 reference 时继续原有执行路径。

Batch 5.0 没有新增用户可见 Catalog 界面，不执行视觉审计，也不生成截图。

## 2026-08-26 Batch 5.0.1 Catalog runtime integrity fix

本轮自动化覆盖以下完整性边界：

- Catalog-backed required input 没有 enabled incoming Edge 时产生 `catalog_required_input_unconnected` error，实例化 Module 与 Input Source 后仍需显式连线；
- disabled Edge、指向其他端口的 Edge，以及 source node 或 source port 无法解析的损坏 Edge 均不满足 Catalog 输入连接条件；
- direct evaluator 对缺失 input key fail closed，显式上游零值继续返回 trusted zero，保持非外推且不触发工作范围错误；
- generic BFN 未连接 required input 继续产生 `missing_required_input` warning，不升级为平台级 fatal error；
- Demo provenance 从当前 Output Monitor 沿 enabled Edge 反向遍历，覆盖孤立 Demo module、disabled Demo path、reachable Demo module、混合分支和 `project.isDemo` 优先级；
- 图遍历通过 visited set 处理循环，忽略损坏端点，不把 Input Source 或 Output Monitor 计为 Functional Module。

Batch 5.0.1 不新增 Catalog UI，不执行视觉审计，也不生成截图。

### 2026-08-26 Batch 5.0 + 5.0.1 最终验收

- TypeScript `tsc --noEmit` 与 ESLint 全项目检查通过；
- Vitest 共 82 个测试文件、560 项测试全部通过；
- Vite 7.3.6 生产构建通过，222 个模块完成转换；主 JavaScript chunk 为 1,045.24 kB、gzip 248.91 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功；
- 本轮结论为 local full validation passed；本记录仅报告本地完整门禁，不声明 GitHub CI 已通过。

## 2026-08-26 Batch 5.1 Catalog Discovery & Search

自动化新增覆盖以下发现与隔离合同：

- Discovery projection 从冻结 AHL/HSL V1.1 presentation 推导 42 个 Component group、52 条 Receiver Response 和 20 条 runnable demo response；默认查询保留没有响应记录的 Component，Sender 不生成 response 或 runnable 状态；
- usage status 以真实 `response.runnable` 为门禁，覆盖可运行示例、待标定、仅定性证据、参考资料和 runtime-demo 异常时的安全不可用回退；
- `Rhl`、`C4-HSL`、`3OC6`、`Kylilis`、DOI、大小写、首尾空白和多 token AND 搜索；Component 名称匹配优先于仅来源字段匹配，同分保持 release 顺序；
- 状态、输入 Signal ID、宿主 species 以及三者组合筛选；Component 分组在 Signal 搜索时只保留匹配 Response row；
- 默认全部折叠、单一结果自动展开、Receiver/Sender 轻量预览、不可运行 Response 可选择、文献结果不存在 Add to Network 操作；
- Drawer 名称、搜索与筛选标签、`aria-expanded`、原生 Enter/Space 选择、Escape 关闭和搜索框初始焦点；
- Catalog 加载失败时显示明确错误且不生成替代数据，内置 3 个 Demo 模块仍可展开并添加；
- 搜索、筛选、展开、选择、清除和关闭不改变项目 JSON、computation signature、Undo/Redo 历史或 current result freshness；原内置 Demo module add 继续形成真实项目编辑。

视觉审计使用真实桌面页面状态，产物与逐图记录位于 `docs/ui-audit/catalog-discovery/`。审计覆盖 1440×900 默认目录、3OC6 搜索、可运行筛选、Receiver Preview、Sender Preview、深色主题和内置 Demo 折叠区。1280×720 下 document 的 `clientWidth` 与 `scrollWidth` 均为 1280 px，Drawer 为 560×720 px，页面级水平溢出为 0；Drawer body 使用内部滚动，打开与关闭 Drawer 前后工作台 surface、workspace 和 stage 尺寸完全一致。

### Batch 5.1 完整门禁

- TypeScript `tsc --noEmit` 与 ESLint 全项目检查通过；
- Vitest 共 85 个测试文件、580 项测试全部通过；
- Vite 7.3.6 生产构建通过，224 个模块完成转换；主 JavaScript chunk 为 1,072.11 kB、gzip 255.46 kB；主 CSS 为 226.18 kB、gzip 39.72 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功；
- 完整套件在无 worker 上限时连续两次出现跨文件交互测试超时，所有失败文件分组复跑均通过。使用 4 个 worker 的完整套件连续两次通过，因此在 Vitest 配置中固定 `maxWorkers: 4`，保持既有 timeout、测试数量和断言强度不变；
- 本轮结论为 local full validation passed；本记录仅报告本地完整门禁，不声明 GitHub CI 已通过。

## 2026-08-26 Batch 5.1.1 Catalog Signal Identity Presentation Fix

自动化使用冻结 AHL/HSL V1.1 Catalog 的真实条目覆盖以下展示合同：

- 共享 `C4-HSL` 缩写的 L、DL 与立体构型未说明 Signal，以及共享 `3OC6-HSL` 缩写的 L 与立体构型未说明 Signal，在中英文界面均生成可区分的身份标签；
- Response row、Response preview 与输入 Signal 筛选器共用同一纯展示规则；筛选 option 的 value 继续使用原始 Signal ID，搜索语料、项目数据和运行时身份保持不变；
- 无缩写或无法从 Catalog 审定名称安全证明限定信息时，展示规则回退到 Catalog 本地化名称；
- 内置示例模块披露区位于 release、搜索和结果之前，默认保持折叠，原有 3 个添加按钮及回调行为不变；
- Catalog usage status 的最小字号为 10 px。

定向验证覆盖 2 个测试文件、24 项测试；扩展回归覆盖 Catalog Discovery、Modeling Page Batch 5.1、Batch 2、Batch 3.5 与主页面测试，共 6 个测试文件、52 项测试，均通过。

视觉审计使用真实桌面页面与冻结 Catalog 数据，产物和逐图说明位于 `docs/ui-audit/catalog-signal-identity/`。审计覆盖 1440×900 浅色身份列表、Response preview、输入 Signal 筛选器、内置示例模块位置与深色主题。1280×720 下 document 的 `clientWidth` 与 `scrollWidth` 均为 1280 px，Drawer 为 560×720 px；关闭按钮完整可见，Drawer body 使用内部滚动，页面级水平溢出为 0。真实 `3OC6-HSL（立体构型未说明）` 的筛选、结果与预览在该尺寸下均可访问。

### Batch 5.1.1 完整门禁

- TypeScript `tsc --noEmit` 与 ESLint 全项目检查通过；
- Vitest 共 85 个测试文件、585 项测试全部通过，未修改 timeout，未删除、跳过或弱化断言；
- Vite 7.3.6 生产构建通过，224 个模块完成转换；主 JavaScript chunk 为 1,072.50 kB、gzip 255.62 kB；主 CSS 为 226.18 kB、gzip 39.72 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功；
- 本轮结论为 local full validation passed；本记录仅报告本地完整门禁，不声明 GitHub CI 已通过。

## 2026-08-26 Batch 5.2 Catalog Detail & Network Instantiation

自动化新增覆盖以下详情与实例化合同：

- Full Detail 从已验证的 Catalog presentation 投影生成，返回 Discovery 时保留查询、筛选、展开项、选中项和 Drawer 内滚动位置；trusted runtime 重建或完整性校验失败时安全降级为不可用，不显示添加操作；
- runtime 归一化参数 `0/1/K/n/working range` 与来源记录的 `Basal/Maximum/EC50` 分区显示；Shong EsaR 同时保持 increasing 数学响应与 derepression 生物机制；缺失实验上下文明确显示“未记录 / Not recorded”；
- 组件身份、序列状态、序列来源与验证状态、构建设计、证据缺口、全部来源、observed pair 和 compatibility evidence 均由 Catalog 数据投影；Sender 与 reference-only 条目不生成数值模型，也不提供添加操作；
- 0 个兼容 Input Source 时默认一次添加 Module + Source，已有 1 个及以上兼容 Source 时默认 module-only，并允许用户显式覆盖；项目变化会重新计算推荐，不自动创建 Edge、Monitor 或运行；
- Catalog-backed input 继续要求用户手工建立 exact connection；实例化后结果标为 stale，单次添加对应一次 Undo/Redo，恢复项目与结果状态且不自动运行；
- 同一 Response 可重复实例化，node、port 与 domain ID 在全项目范围内避碰；Module + Source 采用 Source-left / Module-right 放置，并在画布、Network Index、Inspector 与 Exact Connection 中使用项目本地化 `displayName`；
- `displayName` 随项目导入、导出与保存加载保留，旧项目无该字段时兼容读取；展示名称不进入 computation signature，不改变科学计算身份；
- 手工连接后 trusted Catalog module 可正常运行，运行时仍执行 required-input、working-range、tamper 和 Demo/未验证科学边界。

视觉审计使用真实桌面页面状态，产物与逐图说明位于 `docs/ui-audit/catalog-instantiation/`。共保存 10 张 1440×900 PNG，覆盖 runnable 详情、来源参数与 runtime 参数边界、实验上下文、non-runnable、Sender、0-source 推荐、existing-source 推荐、重复 module、Module + Source 无自动 Edge 和深色主题。所有截图像素尺寸均已复核为 1440×900，浏览器控制台无 warning 或 error。

1280×720 下 document 与 body 的 `clientWidth`、`scrollWidth` 均为 1280 px，页面级水平溢出为 0；Drawer 为 560×720 px。Drawer body 的 `clientHeight` 为 619 px、`scrollHeight` 为 3511 px，顶部返回操作可见，添加操作滚动 90 px 后完整可见；滚动到底部时最后一项与 Drawer body 底边保留约 14 px 间距，不被底部操作区遮挡。

### Batch 5.2 完整门禁

- TypeScript `tsc --noEmit` 与 ESLint 全项目检查通过；
- Batch 5.2 定向回归共 6 个测试文件、45 项测试通过；完整 Vitest 共 90 个测试文件、627 项测试全部通过；
- Vite 7.3.6 生产构建通过，229 个模块完成转换；主 JavaScript chunk 为 1,127.11 kB、gzip 269.15 kB；主 CSS 为 235.51 kB、gzip 40.89 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功；首次沙箱内构建因 esbuild 子进程权限返回 `spawn EPERM`，在获批的沙箱外环境以同一命令复跑通过；
- 本轮未修改冻结 Catalog JSON，未新增依赖，未放宽 timeout，未删除、跳过或弱化断言；
- 本轮结论为 local full validation passed；本记录仅报告本地完整门禁，不声明 GitHub CI 已通过。

## 2026-08-27 Batch 5.2.1 User-facing evidence semantics

自动化使用冻结 AHL/HSL V1.1 release 的真实唯一值覆盖以下展示合同：

- evidence gap、response class、compatibility relation、qualitative outcome、source model、fit interpretation、sequence status、missing sequence element 与 measurement detail key 均经过统一 presentation helper；
- Sender、observed pair、compatibility 与 calibration model 的主层 DOM 不出现已知 snake_case code；中文主层不直接使用 observed pair 的英文来源句；
- 未知未来 code 使用稳定的用户级 fallback，原始值只在默认折叠的高级审计层保留；
- 语义转换保持原 Catalog 含义，不把不可数值运行、参数约束或 reference-only 误写为实验失败、低质量或无证据；
- compatible source 同时显示真实输出 Signal 与单位，并继续复用 identity-preserving port label，不改变兼容性判断。

定向验证覆盖 presentation helper、Full Detail、Instantiation Panel 与 Discovery/Detail 回归。视觉审计保存 6 张真实 1440×900 PNG，覆盖 Sender evidence、pair、compatibility、model name、compatible source 和深色主题；说明位于 docs/ui-audit/catalog-evidence-semantics/。

## 2026-08-27 Batch 5.3 Catalog provenance inspector

自动化新增覆盖以下来源追溯与隔离合同：

- trusted 与未连接的 Catalog Module 均解析为 matched；displayName 修改不影响来源身份；普通 Module 返回 null；
- EC50、source IDs、input entity 和 validity domain 篡改解析为 mismatch；未知 release 解析为 unavailable；malformed reference 安全降级，不出现 TypeError；
- matched Inspector 显示 Catalog、Component、identity-preserving Signal、external host/strain Context、第一条 Source 与来源数量，并固定说明“来源匹配不等于团队实验验证”；
- mismatch 在 response ID 仍可解析时只链接 canonical record；unavailable 不构造伪 Catalog Detail，也不向用户泄露内部错误枚举；
- instantiate → save/load 与 export → parse/import 后继续解析到同一 Component、Signal、Context、Sources 和 matched 状态，不保存 Full Detail 或来源快照；
- Inspector → Detail → Back → Close 后项目 deep equal、computation signature、Undo/Redo 和 Current Result freshness 均不变；Catalog-backed Module 不再以“未关联数据集”代替文献来源，generic Module 保留原 Linked Data 区域。

Resolver、Inspector、Drawer 与完整 Platform 深链接定向回归共 4 个测试文件、31 项测试通过。视觉审计保存 8 张真实 1440×900 PNG，覆盖 matched、Full Detail 深链接、unconnected + matched、mismatch、unavailable、高级 ID、generic regression 和深色主题；说明位于 docs/ui-audit/catalog-provenance/。

1280×720 下 documentScrollWidth 与 bodyScrollWidth 均为 1280 px，页面级水平溢出为 0；来源区和按钮可访问，Full Detail 深链接正常，关闭后 Result Dock 仍保持原布局。浏览器运行日志没有 error。

### Batch 5.2.1 + Batch 5.3 完整门禁

- TypeScript tsc --noEmit 与 ESLint 全项目检查通过；
- Vitest 共 94 个测试文件、661 项测试全部通过；
- Vite 7.3.6 生产构建通过，232 个模块完成转换；主 JavaScript chunk 为 1,159.82 kB、gzip 279.34 kB；主 CSS 为 238.02 kB、gzip 41.19 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功；
- 冻结 Catalog JSON 保持零差异；未新增依赖，未升级 BFN schema，未放宽 timeout，未删除、跳过或弱化断言；
- 本轮结论为 local full validation passed；本记录仅报告本地完整门禁，不声明 GitHub CI 已通过。

## 2026-08-27 Batch 6 Multi-project Workspace & Version History

### Workspace Repository 与 IndexedDB

- localStorage fallback 与真实 `fake-indexeddb` 实例共用 Repository contract，覆盖创建、读取、重命名、独立 Draft、激活项目、项目内 revision、不可变 snapshot、Run 上限、项目隔离、清空、级联删除和最后项目保护；
- IndexedDB 结构测试核对 `settings`、`projects`、`drafts`、`versions`、`runs` 五个 store，以及 Version 的 `projectId`、唯一 `projectIdRevision` 索引和 Run 的 `projectId` 索引；
- Version 创建在同一事务内写 snapshot 并推进 `nextRevision`；删除项目在同一事务内级联 Draft、Version 与 Run；
- localStorage 只在 IndexedDB 不存在时使用新键 `fluorescence-desktop.bfn-workspace.v1`，生产路径不再写旧单项目键。

### Legacy Migration

- 旧 BFN-IR Project 精确复制为 Current Draft，旧 Run 的 computation signature 明确写为 `null`；
- 迁移不创建 Version、不删除旧键，并在同一事务中写 Project、Draft、Run、active project 与一次性 marker；
- 已存在 Workspace Project 时不会读取旧键覆盖工作区；迁移失败不会留下半成品或 marker；
- 没有旧项目时创建 0 Input、0 Module、1 Output Monitor 且 `isDemo=false` 的空白项目。

### Project CRUD、Autosave 与切换

- 生产 Modeling 入口先显示 loading gate，成功后直接进入真实空白或迁移项目，不闪现 Demo；
- UI 回归覆盖新建、切换、内联重命名、复制、删除确认、最后项目保护和项目数据隔离；
- 复制创建新的 Workspace Project、BFN Project 与 Network ID，同时不复制 Version 或 Run；
- 320 ms autosave 不创建 Version；项目切换前 flush 当前 Draft，落盘失败会阻止切换；
- 切换项目重新建立编辑器并清除 Undo/Redo、Selection 与 Overlay 瞬态；
- 切换后自动加载该项目最新 Run 作为当前显示结果，并恢复其 result basis signature。

### Version 与 Restore

- 名称和备注均为选填，revision 从 1 开始并按项目独立递增；
- Version snapshot 返回值与再次读取值相互隔离，创建后没有编辑、重命名或删除路径；
- 保存 Version 不改变 Current Draft、Undo/Redo 或结果新鲜度；
- Restore 先等待已有 autosave，再用 clone snapshot 替换 Draft、更新时间并清空编辑器历史；
- Restore 保留全部 Version 与 Run，也不删除目标 Version 之后的 revision；
- 版本表单的 Escape 先取消表单，再次 Escape 才关闭 Project Center；Project Center 与 Catalog Drawer 保持互斥。

### Run scope、Import / Export 与 Catalog 回归

- 每个项目最多保存最新 20 条 Workspace Run，Clear Runs 只清当前项目；
- Run 按 computation signature 显示“当前设计”“较早设计”或“旧版运行记录”；
- Run 持久化失败不丢失已计算结果，并显示明确的历史保存失败提示；
- 合法 BFN-IR 文件每次都导入为新 Workspace Project，重复文件生成独立名称；非法文件不替换当前项目；
- 导出 JSON deep-equal 当前 BFN Project，文件名使用清理后的 Workspace Project 名，不包含 Workspace、Version 或 Run 数据；
- 空白项目通过 Catalog 手动添加、显式连接后保持 matched provenance 与 trusted simulation，Workspace metadata 不进入科学签名。

### Visual audit

真实应用截图与说明位于 `docs/ui-audit/multi-project-workspace/`。已留档 Project Center、0/0/1 空白项目、项目切换、导入入口的独立空白目标和深色 Project Center。重命名、复制、Version 表单、Version 历史、Restore 确认及 Current / Earlier / Legacy Run 均在真实 Repository 状态中交互复核。

1280×720 下 document 和 body 的 client/scroll width 均为 1280 px；1180×700 下均为 1180 px。两个尺寸下 Drawer 均为 680 px 宽，页面级水平溢出为 0，Project List 与 Version History 保持独立内部滚动，底部操作未截断。浏览器应用日志没有 warning 或 error。

Chrome 扩展未启用本地文件 URL 访问，自动化文件选择器无法注入刚导出的 BFN JSON，因此没有把导入完成状态伪造成视觉截图。真实 `File` 导入、重复导入和错误隔离由组件测试执行。

### Batch 6 完整门禁

- TypeScript `tsc --noEmit` 通过；
- ESLint `eslint . --max-warnings 0` 通过；
- Workspace UI 定向回归为 1 个测试文件、10 项测试通过；Repository、Migration 与 Factory 定向回归为 3 个测试文件、16 项测试通过；
- 完整 Vitest 共 98 个测试文件、687 项测试全部通过，未放宽 timeout，未删除、跳过或弱化断言；
- Vite 7.3.6 生产构建通过，240 个模块完成转换；主 JavaScript chunk 为 1,198.08 kB、gzip 289.19 kB；主 CSS 为 245.71 kB、gzip 42.22 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功；
- 新增开发依赖仅为 `fake-indexeddb@6.2.4`，用于在 Vitest 中执行真实 IndexedDB 事务合同；
- 冻结 Catalog JSON 保持零差异，BFN-IR 仍为 2.0，BFN-SIM 仍为 2.0；
- 沙箱内 Vitest 启动因 esbuild 子进程权限返回 `spawn EPERM`，在获批的沙箱外环境使用同一命令完整通过；
- 本轮结论为 local full validation passed；本记录仅报告本地完整门禁，不声明 GitHub CI 已通过。

## 2026-08-27 Batch 6.0.1 Workspace State Integrity & UX Fix

本轮回归覆盖 IndexedDB 首次打开失败后的同实例重试（第一次成功与第二次成功路径）、项目切换状态完整性、连续 revision 分配、Overlay 与编辑器瞬态清理，以及 Network Index 的 `edgeCount` 展示。多项目工作区的 10 张既有审计截图均已保留。

Batch 6.0.1 没有独立留存一组可核验的完整套件最终数字；上述能力随后纳入 Batch 6.0.2 的最终完整门禁，不补写推测性数字。

## 2026-08-27 Batch 6.0.2 Workspace Transition Finalization

自动化新增并复核以下状态转换合同：

- 删除 active project 前完整预取 replacement metadata、Draft、Versions 与 Runs；任一读取失败时保持当前项目和持久化数据不变，并显示明确错误；
- active project 删除提交后仅应用已预取状态，不再执行可能失败的 Repository 读取；被删项目的 Draft、Versions 与 Runs 继续级联清理，replacement 的版本、运行结果、结果基线和编辑器状态同步恢复；
- 删除 non-active project 后在内存中更新 Project List，不重新读取 active project 或完整列表；
- blank、duplicate 与 import 均通过一次原子 Repository 创建并激活，然后直接应用已知状态；创建提交后不依赖二次读取；
- 创建失败时继续显示并持久化原 active project；duplicate 不复制 Version 或 Run；
- Catalog-backed duplicate 在切换、保存 Version 与 Restore 后继续解析为 matched provenance，科学身份与来源关系保持不变。

项目切换、版本保存与恢复、Project Center / Catalog 互斥、Undo/Redo 清理、结果新鲜度和 Run 归属继续执行回归。Workspace 页面定向回归为 1 个测试文件、33 项测试；Repository 与 Migration 定向回归为 3 个测试文件、13 项测试；BFN-IR、BFN-SIM、Catalog 与 Factory 科学合同定向回归为 6 个测试文件、53 项测试，全部通过。

### Visual / Responsive review

未新增截图；`docs/ui-audit/multi-project-workspace/` 中 10 张既有 PNG 均存在，并重点复核 05、06、07。1280×720 下 document/body 的 client width 与 scroll width 均为 1280 px，Project Center 为 680 px 宽；1180×700 下对应宽度均为 1180 px，Project Center 仍为 680 px 宽。Project List 与 Version History 无页面级水平溢出；保存 Version 表单约 378 px 宽并完整位于 Drawer 内，Restore 对话框为 480×212 px 并完整位于视口内。实际浏览器日志没有 warning 或 error。

### Batch 6.0.2 完整门禁

- TypeScript `tsc --noEmit` 与 ESLint 全项目检查通过；
- 完整 Vitest 共 98 个测试文件、712 项测试全部通过，未放宽 timeout，未删除、跳过或弱化断言；
- Vite 7.3.6 生产构建通过，240 个模块完成转换；主 JavaScript chunk 为 1,200.17 kB、gzip 289.73 kB；主 CSS 为 245.71 kB、gzip 42.22 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功；
- 沙箱内 Vitest 与 Vite build 启动均因 esbuild 子进程权限返回 `spawn EPERM`；两项均在获批的沙箱外环境使用同一命令复跑通过；
- 冻结 Catalog JSON 保持零差异，BFN-IR 仍为 2.0，BFN-SIM 仍为 2.0，Workspace IndexedDB 版本仍为 1；
- `package.json` 与 lockfile 保持零差异；`fake-indexeddb` 仍仅为开发依赖，没有新增或变更运行时依赖；
- 已发布基线提交的 GitHub combined status 返回 `statuses: []`；本轮结论仅为 local full validation passed，不声明 GitHub CI 已通过。

## 2026-08-27 Batch 8.0 + 8.1 Catalog-backed Inverse Design Scientific Engine

定向自动化覆盖：

- Target 的正浓度、严格浓度顺序、0–1 响应边界、可选 EC50 / Hill 范围、weak-separation warning、exact Signal 和真实 Host / Strain 组合；
- 每次从冻结 release fresh rebuild whitelist Response，并同时通过 canonical runtime candidate、receiver binding 和 presentation trust；注入谓词只能收窄信任，单 Response 失败与其余候选隔离；
- searchable Signal、L / stereo-unspecified 身份分离、共同可信范围、Target range coverage 与真实 Context option 计数；
- closed working-range Eligibility、范围外零 evaluator 调用、Context 缺失 fail-closed，以及候选 Context 篡改后的 canonical trust rejection；
- Kylilis 4PL、Shong derepression、Low / High、可选 EC50 / Hill deviation 和 61 点 log-spaced 曲线全部复用 evaluateReceiverResponse；
- matched、near-match、not-applicable、无 aggregate score 的确定性排序，以及单 Candidate evaluation failure isolation；
- Kylilis 与 Shong 在 inverse engine 和实例化 BFN Module 两条路径中的同浓度数值一致；
- Target snapshot、重复搜索确定性、Project deep equality 与 computation signature 不变；
- 旧“网络设计 / 按目标设计”工作区和 legacy reverse design 继续通过回归。

本轮没有新增可见 UI，也不新增截图。

### Batch 8.0 + 8.1 完整门禁

- TypeScript `tsc --noEmit` 通过；
- ESLint `eslint . --max-warnings 0` 通过；
- Inverse Design 定向回归为 5 个测试文件、81 项测试全部通过；
- 完整 Vitest 共 103 个测试文件、793 项测试全部通过；未提高 timeout，未删除、跳过或弱化断言；
- Vite 7.3.6 生产构建通过，240 个模块完成转换；主 JavaScript chunk 为 1,200.17 kB、gzip 289.73 kB；主 CSS 为 245.71 kB、gzip 42.22 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增构建 warning；
- 冻结 Catalog JSON、BFN types、Workspace、`package.json` 与 lockfile 相对基线保持零差异；BFN-IR 仍为 2.0，BFN-SIM 仍为 2.0，Workspace IndexedDB 版本仍为 1；
- 全量回归中，未修改的 Workspace 长交互测试曾在固定 5 秒边界出现性能抖动；该测试随后单项通过 2/3 次、完整文件 33/33 通过，最终原始 `npm test` 完整通过；未修改生产代码或测试来掩盖抖动；
- 冻结基线提交的 GitHub combined status 返回 `statuses: []`；本轮结论仅为 local full validation passed，不声明 GitHub CI 已通过。

## 2026-08-28 Batch 8.2 Catalog-backed Target & Results UX

### Engine 与 UI 回归

- signal-scoped unavailable 回归构造 C4-HSL admission failure：3OC6-HSL Search Result 不包含该 Response，C4-HSL Search Result 精确包含该 ID；Search Space 同时冻结保存 canonical `inputSignalId`；
- Inverse Engine 定向回归为 5 个测试文件、83 项测试全部通过，覆盖 Target validation、Search Space、trusted evaluation、确定性排序和 cross-path integration；
- Inverse UI 定向回归为 4 个测试文件、22 项测试全部通过，覆盖浓度单位、UI-only Target Draft、Catalog presentation、初始空目标、显式搜索、单位切换不 stale、科学字段编辑 stale、候选详情、最多 3 个手动比较、重新搜索清理 session，以及 release failure 重试；
- Modeling 页面回归确认生产可见“按目标设计”只挂载 Catalog-backed workspace，不再出现 burden、noise、genetic risk、composite loss、排名或 legacy 推荐候选；“网络设计”流程继续纳入完整回归。

### Visual / responsive audit

- 真实 Application 截图和逐图说明位于 `docs/ui-audit/catalog-inverse-design/`；6 张 1440×900 PNG 覆盖初始空目标、Matched、Near Match + Not Applicable、stale search、候选比较和已在设置页确认的深色主题；
- 1440×900 下 document/body client/scroll width 均为 1440 px，三栏宽度为 303 / 357 / 505 px；
- 1280×720 下 document/body client/scroll width 均为 1280 px，三栏宽度为 286 / 330 / 422 px；
- 1180×700 下 document/body client/scroll width 均为 1180 px，三栏宽度为 261 / 302 / 378 px；
- 三档页面级水平溢出均为 0；Target、Results、Inspector 保持可用，纵向内容由各 Pane 管理。

### Batch 8.2 完整门禁

- TypeScript `tsc --noEmit` 通过；
- ESLint `eslint . --max-warnings 0` 通过；
- 完整 Vitest 共 107 个测试文件、817 项测试全部通过；未提高 timeout，未删除、跳过或弱化断言；
- Vite 7.3.6 生产构建通过，253 个模块完成转换；主 JavaScript chunk 为 1,246.95 kB、gzip 301.54 kB；主 CSS 为 261.27 kB、gzip 44.30 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增运行时依赖；
- 一次沙箱内定向 Vitest 启动因 esbuild 子进程权限返回 `spawn EPERM`；定向 Vitest、完整 Vitest 与 Vite build 均在获批环境使用相同 npm 命令通过；
- 冻结 AHL/HSL V1.1 JSON、BFN types、Workspace、`package.json` 与 lockfile 相对基线保持零差异；BFN-IR 仍为 2.0，BFN-SIM 仍为 2.0，Workspace IndexedDB 版本仍为 1；
- 基线提交 `e9c6228343f7598ced668904f1fb518742928676` 的 GitHub combined status 返回 `statuses: []`；本轮结论仅为 local full validation passed，不声明 GitHub CI 已通过。

## 2026-08-28 Batch 8.2.1 Scientific UX & Chart Integrity Fix

### 交互与图表回归

- Inverse Engine 定向回归为 5 个测试文件、83 项测试全部通过；既有 admission、exact Signal、working-range Eligibility、trusted evaluator、EC50 / Hill deviation、三类状态与确定性排序合同保持原样；
- Inverse UI 定向回归为 5 个测试文件、31 项测试全部通过，覆盖 Host 为空时的 strain-only 精确搜索、Host 改变时保留合法 Strain / 清空不兼容 Strain、实时 validation Search gate、可搜索 warning、fresh explicit search、stale 结果、最多 3 条手动比较与比较计数；
- 图表回归确认单候选和多候选只消费调用方提供的曲线点；每个真实 eligible Candidate 仍为 61 点。比较视图只绘制已选曲线并共享一组 2 条 Target 约束，Not Applicable 不绘图；宽量程横轴使用 5 个可读整十倍刻度；
- 跨实验背景比较继续显示归一化响应边界提示，生产文案不包含综合评分、最佳方案、推荐方案或自动 Top 3 表达。

### Visual / responsive audit

- `docs/ui-audit/catalog-inverse-design/` 中的 `01`、`02`、`03`、`05`、`06` 与新增 `07` 已从真实 Application 生产路径重新生成，均为 1440×900 PNG；覆盖初始 Search gate、Matched、Near Match + Not Applicable、候选比较、深色主题和 strain-only filter；
- 1440×900、1280×720、1180×700 下 document/body client width 与 scroll width 分别严格相等，页面级水平溢出均为 0；三栏宽度分别为 303 / 357 / 505 px、286 / 330 / 422 px、261 / 302 / 378 px；
- 1280×720 下对比表容器 client / scroll width 为 392 / 540 px；1180×700 下为 348 / 540 px，水平滚动限制在表格容器内；
- 运行时审计确认真实单候选曲线为 61 点，对比曲线为 2 × 61 点，Target 约束为 2 条；图中文字和科学表格为 10.5 px，轴标题为 11 px；页面 warn / error 日志为 0。

### Batch 8.2.1 完整门禁

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 完整 Vitest 共 108 个测试文件、826 项测试全部通过；未提高 timeout，未删除、跳过或弱化断言；
- Vite 7.3.6 生产构建通过，253 个模块完成转换；主 JavaScript chunk 为 1,248.75 kB、gzip 302.18 kB；主 CSS 为 261.68 kB、gzip 44.36 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增运行时依赖；
- 一次沙箱内 Vitest 启动因 esbuild 子进程权限返回 `spawn EPERM`；定向回归、完整 Vitest 与 Vite build 随后在获批环境使用相同 npm scripts 通过；
- 冻结 AHL/HSL V1.1 JSON、BFN types、BFN-SIM、Workspace、`package.json` 与 lockfile 相对基线 `996c8d9b4b4b074ffd0a94ab9246d53b1919eef9` 保持零差异；BFN-IR 仍为 2.0，BFN-SIM 仍为 2.0，Workspace IndexedDB 版本仍为 1；
- 实现提交 `18733256c86be89da5ec0d5f353a86286c24bd48` 的 GitHub combined status 返回 `state: pending`、`total_count: 0`、`statuses: []`；本轮结论为 local full validation passed，不声明 GitHub CI 已通过。

## 2026-08-28 Batch 8.3 Candidate Evidence Detail, Catalog Deep-link & Apply-to-Network Bridge

### Evidence 与深链回归

- Inverse Workspace、Catalog Drawer 与 Platform bridge 定向回归为 3 个测试文件、34 项测试全部通过；
- Matched、Near Match、Not Applicable 和 canonical unavailable 候选都使用 exact `responseId` 打开证据，Comparison 的每个候选列也保持独立身份；
- Kylilis 3OC6 深链核对 RhlR / pRhl、TOP10、原始标题与 DOI，没有误落到 C4 Response；canonical non-runnable 详情保持只读且不显示 Add；
- `buildBfnCatalogDetail` 异常被限制在 Drawer 内，显示本地化错误并可返回目录，应用不崩溃；
- 浏览 Full Detail、返回与关闭不会修改 Target Draft、Search Result、stale 状态、候选选择、比较集合、Project、Run 或 Undo/Redo。

### 显式添加回归

- 空项目默认一次加入可信 Module 与匹配 Input Source，不创建 Edge、Output Monitor 或 Run；Catalog provenance 保持 exact response、component、signal、context 和 source identity；
- 存在兼容来源时默认只添加 Module；成功后进入 Network Design 并选中新 Module，一次 Undo 恢复添加前的完整项目；
- Catalog 状态变化会使实例化 fail closed：Drawer 保持打开，Project 与 Undo 历史不变，不产生部分对象。

### Visual / responsive audit

- `docs/ui-audit/catalog-inverse-design/08`–`13` 由真实 Windows Application 生产路径生成，均为 1440×900 PNG；覆盖候选证据入口、完整文献详情、空项目 Add 设置、添加后网络、Comparison 文献入口和深色主题；
- 1440×900、1280×720、1180×700 下 document/body client width 与 scroll width 分别严格相等，页面级水平溢出均为 0；主内容宽度分别为 1224、1090、990 px；
- 1180×700 下 Full Detail Drawer 为 560 px，正文 client / scroll width 均为 549 px，纵向 client / scroll height 为 599 / 3401 px；浏览器 warning / error 日志为 0。

### Batch 8.3 完整门禁

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 完整 Vitest 共 109 个测试文件、835 项测试全部通过；未提高 timeout，未删除、跳过或弱化断言；
- Vite 7.3.6 生产构建通过，253 个模块完成转换；主 JavaScript chunk 为 1,251.05 kB、gzip 302.69 kB；主 CSS 为 262.29 kB、gzip 44.46 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增运行时依赖；
- 一次沙箱内定向 Vitest 启动因 esbuild 子进程权限返回 `spawn EPERM`；定向回归、完整 Vitest 与 Vite build 随后在获批环境使用相同 npm scripts 通过；
- 冻结 AHL/HSL V1.1 JSON、BFN types、BFN-SIM、Workspace、`package.json` 与 lockfile 相对基线 `15b954fd7f73fd99a2744f1999c8b68049e6c3fb` 保持零差异；BFN-IR 仍为 2.0，BFN-SIM 仍为 2.0，Workspace IndexedDB 版本仍为 1。

## 2026-08-28 Batch 9.0 + 9.1 Semantic Ontology Contract & Versioned Registry

### Registry 与 assignment 合同

- `ontologyRegistry.test.ts` 为 1 个文件、5 项测试，覆盖 BFN-ONTOLOGY-1.0 manifest、13 个精确术语、稳定 ID 顺序、kind 查询、双语名称、深冻结，以及数学模型、运行状态和证据词汇不进入 term ID；
- `ontologyAssignments.test.ts` 为 1 个文件、5 项测试，按当前冻结 release 实际 Component 数验证每个 canonical receiver / sender 恰好得到 1 个 Functional 与 1 个 Broad Biological assignment，并核对 3 个内置模块的显式 curated 表、exact label-key map、90 条完整 assignment 的深冻结与稳定顺序；
- assignment validation 拒绝重复 subject-term、未知 ontology ID、空 subject ID、错误 basis、缺失 family 和当前 exact mapping 偏移；Catalog 规则只读取可信 canonical role，不读取名称、alias、搜索词或模型族；
- 当前 AHL/HSL V1.1 的 42 个 Component 全部解析；该数量来自冻结 release，resolver 与业务规则没有把 42 固定为循环上限。

### Resolver、纯读取与科学边界

- `ontologyResolver.test.ts` 为 1 个文件、8 项测试，覆盖 Catalog Component、Built-in ID、Catalog-backed BFN Module、Built-in BFN Module、unknown Module、active / available model、displayName mutation、near-match label key、`LuxR Sensor` 名称和 `hill_activation` model-family 非推断；
- Catalog resolver 只接受 `isTrustedReleaseCatalogPresentation()` 通过的对象；untrusted presentation 与缺失 exact Component ID 分别产生 typed fail-closed 错误；普通未知模块返回两个显式 unclassified term；
- Catalog sender 可解析为 signal production 与 AHL synthase，同时 sender output 仍为 0、response variant 为 0、simulationReady 为 false；Ontology 未授予定量发送函数；
- Built-in Reporter 的 evidence 保持 `mechanistic_model_only`，Dual Input 的 `interactionAssumption` 保持 `independent_unverified`，AHL Sensor 的 static Hill 与 dynamic first-order variant 共享同一 Functional Family；
- Project 在解析前后 deep equal，computation signature 不变，BFN-IR 仍为 2.0；源码依赖边界测试确认 Registry、Assignment 与 Resolver 不接求值、Simulation 或 Instantiation 路径。

### Validation 与完整门禁

- `ontologyValidation.test.ts` 为 1 个文件、5 项测试，覆盖合法 Registry、mutable registry 拒绝、manifest、重复 term、稳定顺序、parent existence、kind consistency、cycle detection、assignment cardinality、basis 和 expected mapping；
- Ontology 定向回归合计 4 个测试文件、23 项测试全部通过；
- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 完整 Vitest 共 113 个测试文件、858 项测试全部通过；Batch 5 Catalog、Batch 6 Workspace、Batch 8 inverse、静态/动态 BFN 与 Simulation 回归保持通过；
- Vite 7.3.6 生产构建通过，253 个模块完成转换；主 JavaScript chunk 为 1,251.05 kB、gzip 302.69 kB；主 CSS 为 262.29 kB、gzip 44.46 kB；`index.html` 为 0.54 kB、gzip 0.37 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增 warning 或运行时依赖；
- 沙箱内首次定向 Vitest 启动因 esbuild 子进程权限返回 `spawn EPERM`；相同命令在获批环境复跑通过，完整 Vitest 与 Vite build 也在获批环境通过；
- 本轮没有可见 UI 变化，不新增视觉审计截图。

### Frozen artifacts

- 相对 Batch 8.3 基线 `506215e128cb9e5da66542caa13363722702b383`，冻结 AHL/HSL V1.1 JSON 为零差异，SHA-256 仍为 `7f31755a24c8a3c066ecbba70c21f361ffe3a05665fbb681903310a93a404596`；
- `src/features/bfn/types.ts`、Simulation、Inverse Design、Workspace、`package.json` 与 lockfile 均为零差异；
- BFN-IR 保持 2.0，BFN-SIM 保持 2.0，Workspace IndexedDB 版本保持 1；Ontology 不写 Project、Version、Run、localStorage 或 IndexedDB。

## 2026-08-28 Batch 9.2 Semantic Presentation & Scientific UX Integration

### Presentation adapter 与 Catalog Discovery

- 新增只读 semantic presentation adapter 测试，覆盖中英文名称、稳定 ID、深冻结、unknown / unclassified、typed Ontology failure 与 unexpected failure 边界；adapter 不复制 Registry 或 assignment 表；
- Discovery 投影测试覆盖全部真实 receiver / sender 的精确分类、稳定 Function option、Component-level Function 筛选、Function + Status / Signal / Host 组合、双语 Family 名称搜索，以及语义不可用时 Catalog 数量、状态和 runnable 合同保持不变；
- 搜索只加入 Functional 与 Biological Family 的 `names.en` / `names.zh`，不索引 Ontology ID 或 description；sender 继续保持 0 response、0 output 与“暂无定量发送函数”；
- Drawer 回归覆盖四项筛选、2×2 桌面布局、stable-ID option value、筛选与清除、group / receiver / sender preview、Full Detail classification、内置模块分层措辞和 semantic failure isolation。

### Full Detail、Inspector 与科学边界

- Full Detail 独立显示 Functional Family 与 Biological Component Family；语义读取失败只降级该区块，原有模型、来源、Add eligibility 和 Add action 保持可用；
- Module Inspector 回归覆盖 Catalog-backed stable Component ID、Built-in Reporter、Dual Input、unknown module、static / dynamic model 切换和损坏 Catalog semantic identity；解析前后 Project 与 computation signature 保持不变；
- 内置模块分别呈现 Module Function、Mathematical Model 与 Model Basis。Reporter 动态模式显示 First-order dynamic model，Functional Family 仍为 Expression transfer，Model Basis 仍为 Mechanistic model；
- Batch 9.2 定向回归共 9 个测试文件、90 项测试，全部通过。沙箱内首次启动因 esbuild 子进程权限返回 `spawn EPERM`，相同命令在获批环境通过。

### Visual audit

- 9 张真实 1440×900 PNG 与逐图科学检查点位于 `docs/ui-audit/semantic-ontology/`，覆盖默认 Function 筛选、signal response、signal production、Family-aware search、Full Detail、Catalog-backed Inspector、Built-in Reporter、static / dynamic 分离和深色主题；
- 1440×900、1280×720 与 1180×700 的 document width 分别等于 viewport width，页面级横向溢出均为 0；560 px Catalog Drawer 中四项筛选均完整可见；
- 三个断点的 Inspector body 均使用独立滚动：1440 为 628 / 1123 px、1280 为 478 / 1141 px、1180 为 458 / 1141 px client / scroll height；浏览器控制台为 0 warning、0 error。

### Complete gates 与冻结边界

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 完整 Vitest 共 115 个测试文件、881 项测试全部通过；
- Vite 7.3.6 生产构建通过，259 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB；主 CSS 为 262.76 kB、gzip 44.51 kB；主 JavaScript chunk 为 1,270.52 kB、gzip 308.11 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增运行时依赖；
- 相对 Batch 9.0 + 9.1 基线 `f0abd41f90360ccc6eb744ab9c4cbab7a0d27ef1`，Ontology Registry 与 assignment、冻结 AHL/HSL V1.1 JSON、BFN types、Simulation、Inverse Design、Workspace、`package.json` 和 lockfile 均为零差异；Catalog SHA-256 仍为 `7f31755a24c8a3c066ecbba70c21f361ffe3a05665fbb681903310a93a404596`；
- BFN-IR 保持 2.0，BFN-SIM 保持 2.0，Workspace IndexedDB 版本保持 1；语义展示不写 Project、Version、Run、localStorage 或 IndexedDB。

## 2026-08-28 Batch 10.0 Temporal Semantics, Compatibility & Applicability Contract

### Temporal targeted tests

- `temporalCapability.test.ts` 为 1 个文件、10 项测试，覆盖 static + static 的 steady-state、dynamic + dynamic 的 stateful dynamic、dynamic + static fallback 的 quasi-static，以及两种分析模式下无可执行模型的 unsupported；
- Catalog-backed static Receiver 在 Dynamic network 中解析为 `quasi_static + t0_steady_state`；Built-in first-order Demo 即使使用 `mechanistic_model_only` evidence grade，仍为 `stateful_dynamic + not_recorded`，不自动推断 T2/T3；
- selected model ID / mode 与既有 `resolveEffectiveBfnModel()` 一致；resolver 调用前后 Project 与 Module deep equal，computation signature 不变；Static / Dynamic 分析模式不改变 Functional Ontology。

### Compatibility targeted tests

- `portCompatibility.test.ts` 为 1 个文件、11 项测试，覆盖 `output → input`、exact Entity、exact Quantity Type、compatible Unit Dimension、空 Entity 硬拒绝、同单位与跨单位表示；
- concentration `nM → M` 为 compatible 且 `requiresUnitNormalization = true`；`production_rate nM/h → concentration nM`、不同 Entity、`molecules/cell → nM` 与错误方向均为 incompatible；
- Signal Production 与 Signal Response 的功能拓扑不覆盖 Quantity Type 硬边界；assessment 不生成分数，不修改 Source / Target Port，重复调用结果确定且深冻结。

### Context applicability tests

- `contextApplicability.test.ts` 为 1 个文件、10 项测试，覆盖 canonical match、missing / empty、canonical conflict、reported-text difference、安全文本归一、Celsius 数值比较、多字段聚合与 mismatch 优先级；
- 任一侧缺 Medium 或 Strain 时为 uncertain，不产生 mismatch 或 runtime error；两个 reported text 不同为 uncertain；两个 canonical Host 明确冲突为 mismatched；
- assessment 不生成 score 或 runtime eligibility，不修改 Context Facts，重复调用结果确定且返回对象与逐字段 checks 深冻结。

### Complete gates 与冻结边界

- Batch 10.0 专项回归共 3 个测试文件、31 项测试全部通过；沙箱内首次 Vitest 启动因 esbuild 子进程权限返回 `spawn EPERM`，相同 npm 命令在获批环境通过；
- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 完整 Vitest 共 118 个测试文件、912 项测试全部通过，覆盖既有 Static / Dynamic Simulation、20 个 trusted runnable Catalog responses、Workspace、Catalog-backed Inverse Design 与 Ontology 回归；
- Vite 7.3.6 生产构建通过，259 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB；主 CSS 为 262.76 kB、gzip 44.51 kB；主 JavaScript chunk 为 1,270.52 kB、gzip 308.11 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增运行时依赖或 UI 截图；
- 相对 Batch 9.2 基线 `788ac750f7c94b0b95189591a3004f2e2d7715c2`，Ontology production contract、冻结 AHL/HSL V1.1 JSON、BFN types、Simulation、Validation、Model Resolution、Workspace、Inverse Design、`package.json` 与 lockfile 均为零差异；Catalog SHA-256 仍为 `7f31755a24c8a3c066ecbba70c21f361ffe3a05665fbb681903310a93a404596`；
- BFN-IR 保持 2.0，BFN-SIM 保持 2.0，Workspace IndexedDB 版本保持 1；Temporal / Compatibility assessment 不写 Project、Version、Run、localStorage 或 IndexedDB。

## 2026-08-28 Batch 10.1 Temporal Runtime, Compatibility Validation & Scientific UX Integration

### Port Validation 与 Context Integration

- `checkIdealConnection()` 以冻结的 `assessBfnPortCompatibility()` 为端口语义权威，并通过单一 translator 保留既有 direction、entity、quantity 与 unit-dimension validation code；结构性节点、端口、重复边、自连接、已占用输入和静态环路检查保持独立；
- 回归覆盖 `nM → M` 可连接及精确 `1e-7 M` 数值换算、identity edge、entity mismatch 时不突出 unit normalization，以及 `production_rate → concentration` 的 hard block；没有自动积分、隐藏状态或自动插入过程模块；
- Context adapter 只比较 enabled 的 Module → Module edge。Built-in 使用 Project registry 中 exact model context；Catalog-backed model 只读取 trusted presentation 的 exact parameter-context ID，且不解析来源自由文本温度；unavailable 不回退到 BFN context 或 display name；
- 新连接以 `context_applicability_uncertain`、`context_applicability_mismatch` 和 `context_applicability_unavailable` 替代粗粒度 context-ID warning。uncertain / unavailable 为 info，mismatched 为 warning，均不阻断连接或仿真；legacy `context_mismatch` 仍保留在类型中。

### Temporal Runtime 与 Run Provenance

- 运行前只检查 Output Monitor 上游可达模块；`unsupported` 发出 `temporal_execution_unsupported` error，孤立 unsupported 模块不阻断当前输出，Catalog trust failure 继续由原有可信验证错误负责；
- Dynamic network 正式覆盖纯 quasi-static、纯 stateful dynamic 与 mixed execution；现有 static / dynamic 数值点、上下界、module outputs 与 dynamic metrics 的代表性 fixture 使用 deep equality 保持一致；
- 成功运行可选保存 output-reachable `temporalSnapshot` 与 Module → Module `contextApplicabilitySnapshot`。快照记录当次 module / model / execution / evidence 和逐边适用性，不进入 Project computation signature；
- Result、Run Provenance、JSON export 与 provenance rows 只消费运行自身快照。Legacy Run 缺少快照时显示未记录，不从当前 Project 回算；历史比较中的时间执行差异只产生非阻断解释，不改变既有比较资格。

### Inspector、Connection 与 Result UI

- Module Inspector 分离 Functional Classification、Execution Mode 与 Temporal Evidence；Catalog Receiver Dynamic 显示 `quasi_static + t0_steady_state`，内置一阶动态显示 `stateful_dynamic + not_recorded`；
- Connection Builder 与 Edge Inspector 分离 Signal Compatibility 和 Experimental Context。只有 compatible connection 才显示 unit normalization；速率到浓度明确提示需要显式积累/清除过程；
- Dynamic Result 显示当次有状态动力学与瞬时稳态近似计数。全 quasi-static 轨迹使用 Time-trajectory descriptors 并明确其不是实验动力学参数；mixed run 显示两类执行共同存在；
- 中英文用户可见文案均使用 BFN locale key。只读 Inspector / Assessment 不修改 Project 或 computation signature。

### Targeted 与完整门禁

- Batch 10.0 contract regression、Temporal integration、Port / Context integration、Validation、Simulation、Result provenance、Inspector / Connection UX 共 13 个定向测试文件、119 项测试全部通过；
- 完整 Vitest 共 123 个测试文件、946 项测试全部通过；未增加 timeout，未删除、跳过或弱化断言；
- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- Vite 7.3.6 生产构建通过，267 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB；主 CSS 为 266.92 kB、gzip 45.00 kB；主 JavaScript chunk 为 1,295.60 kB、gzip 314.93 kB；
- 构建保留大于 500 kB 的既有代码拆分提示，产物生成成功，没有新增运行时依赖；
- 全仓额外 Prettier 检查命中 309 个既有未格式化文件，因此未执行跨批次格式重排；本批次文件另行定向检查。

### Visual audit 与冻结边界

- `docs/ui-audit/temporal-compatibility/` 已记录真实 Windows 生产路径的 quasi-static Inspector、stateful Inspector、dynamic Result 和深色主题 1440×900 PNG；1440×900、1280×720 与 1180×700 均无页面级水平溢出，Inspector 独立纵向滚动，Result chart 没有被新增语义压缩，应用控制台为 0 warning / 0 error；
- mixed dynamic 与 context uncertain 的真实导入 fixture 已生成；浏览器扩展当前拒绝本地文件上传，故对应 `03`、`04` 截图仍待扩展启用 file URL access 后补录。真实 UI 无法自然构造跨单位端口，按任务边界未为 `05` 新增 Demo 业务对象；
- 相对 Batch 10.0 基线 `73f29f39d446b4eb16603f2a8ccd61dc4509790f`，五个冻结 10.0 core files、AHL/HSL V1.1 Catalog JSON、Ontology v1 production files、Inverse Design engine、Workspace architecture、`package.json` 与 lockfile 保持零差异；
- BFN-IR 保持 2.0，数值引擎保持 BFN-SIM-2.0，Workspace IndexedDB 保持 v1；Run provenance 采用向后兼容的可选字段，没有新增运行时依赖。

## 2026-08-29 Batch 10.1.1 + Batch 11.0 + Batch 11.1

### Batch 10.1.1 Validation Severity Presentation Fix

- `prioritizeBfnValidationIssues()` 只改变运行前问题的展示顺序：error、warning、info；同 severity 保持原顺序，输入数组不被修改；
- UI 在排序后截取前 5 条，多个 Context info 不再遮蔽 `temporal_execution_unsupported` 或其他 hard error；
- 定向验证为 2 个测试文件、11 项测试，全部通过；`validateBfnProject()`、issue severity、Simulation 与 Compatibility Contract 未修改。

### Batch 11.0 Sender Evidence Extension V1.2

- 用户源包 SHA-256 为 `E05A053976ECA37A0433908C6AD22B149315AA02A3AE696E7F46D539B184C1BE`；12 个源文件逐字节保存在独立 extension 目录；
- Source integrity 测试逐文件核对名称、字节数和 SHA-256；loader 验证 release/base identity、固定数量、duplicate ID、unknown reference、V1.1 overwrite、source reuse identity、raw-point round-trip、evidence trace 与科学 null；
- 实际加载 3 个新 Signal、34 个新 Sender Component、17 个新 Context、13 个 V1.1 Sender link、53 条 Sender Output、60 个 raw point、5 条 function parameter、21 条 Source、18 条 rejected candidate 和 6,127 条 evidence trace；
- Catalog Discovery 与 Full Detail 回归覆盖 76 个 Composite Component、52 条 Receiver response、53 条 Sender evidence、20 条 runnable Receiver、0 条 runnable Sender；搜索覆盖 Component、Signal、Author、Title、DOI、Host 与 evidence type；
- Full Detail 回归覆盖 endpoint、fixed-condition time course、production rate、cell-free enzyme kinetics、effective-pair-only、ND、Source、Context、Raw Point、exact deep-link 与 sibling isolation；所有不可运行 Sender 均没有 Add to Network。

### Batch 11.1 Sender Runtime Admission

- Admission 为独立、确定、无评分的 fail-closed evaluator，按 identity、quantity/unit、直接测量、输入定义/工作域、模型、参数、模型评价、Context、provenance、执行授权与科学 scope 判定；
- 全部 53 条真实 V1.2 Sender Output 均执行 admission，实际 admitted 数量为 0；hard regression 使用 `expect(admitted).toHaveLength(0)` 固定当前 release evidence invariant；
- evaluator 没有按版本号拒绝。测试提供一条满足完整合同的隔离输入，确认未来证据满足条件时同一 gate 可以返回 admitted；
- Two-level endpoint 不生成 curve；fixed-condition time course 不作为 dose response；enzyme kinetics 不作为 cellular Sender；effective pair 不拆解；ND 不变成 0；production rate 与 concentration 保持不同 quantity semantics。

Batch 11 定向回归最终为 8 个测试文件、102 项测试，全部通过。全仓第一次运行发现 `ModelingPage.batch51.test.tsx` 仍期待 CinI SEVA 的旧“暂无定量发送函数”占位；该真实 Sender 已有 V1.2 evidence，因此测试更新为 evidence row、runtime unavailable 与 workspace isolation 合同。该回归单独 1 个文件、1 项测试通过，最终全仓为 128 个测试文件、985 项测试全部通过。

### Visual / Responsive audit

- 7 张真实页面 PNG 与逐图检查点位于 `docs/ui-audit/sender-evidence/`，覆盖 Discovery、endpoint concentration、fixed-condition time course、enzyme kinetics、effective-pair boundary、dark mode 与 1180×700 raw table；
- 1440×900、1280×720 与 1180×700 的 document client width 分别等于 scroll width，页面级水平溢出均为 0；
- 560 px Catalog Drawer 自身纵向滚动；Raw Table 在窄屏下 `clientWidth=495 px`、`scrollWidth=620 px`，125 px 溢出被限制在表格内部，实际水平滚动从 0 到 100；
- App tab console 为 0 warning / 0 error；Sender Full Detail 中 Add to Network 按钮数量为 0。

### Complete gates 与冻结边界

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 本批修改的代码与文档通过定向 Prettier 检查，原始 Sender source files 未参与格式化并由字节哈希测试保护；
- Vite 7.3.6 生产构建通过，289 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB；主 CSS 为 270.14 kB、gzip 45.41 kB；主 JavaScript chunk 为 3,220.86 kB、gzip 431.51 kB；
- 构建保留大于 500 kB 的 chunk 提示，产物生成成功；没有新增运行时依赖；
- 相对基线 `cb3d8a470d02b445580e501abb5bff90e75b7aee`，冻结 AHL/HSL V1.1 JSON、20 Receiver whitelist、Receiver runtime candidate/evaluator、Inverse Design engine、Ontology v1、五个 Temporal / Compatibility core files、Workspace architecture、`package.json` 与 lockfile 均为零差异；
- 冻结 V1.1 JSON SHA-256 保持 `7f31755a24c8a3c066ecbba70c21f361ffe3a05665fbb681903310a93a404596`；BFN-IR 保持 2.0，BFN-SIM 保持 2.0，Workspace IndexedDB 保持 v1；
- Batch 10.1.1 presentation fix 通过最终全量回归，Batch 10 core 保持冻结。

## 2026-08-29 Batch 11.1.1 Sender Evidence Presentation Integrity Fix

### Raw input 与 enzyme kinetics 展示回归

- 纯展示 helper 以结构化 `input_value + input_unit` 为 Raw Table 主值，并将非空 `input_label` 保留为次级说明；`input_value === null` 时依次回退到 label 和 input name，不从自由文本解析或补造数值；
- 真实 `rp.0013` 回归确认主值为 `100 nM`、`peak near 13 h` 仅为次级语境；真实 `rp.0001` 与 `rp.0003` 分别保留 `0 g/L`、`1 g/L` 主值，以及 `no methionine`、`1 g/L methionine` 次级说明；
- 真实 `sout.christensen2014.bjai.ivcoa.kinetics.v1` 在主界面显示 Michaelis–Menten 与结构化 Kₘ、kcat、kcat/Kₘ 参数、数值、单位和原始 reported error；主层不显示 `reported_michaelis_menten` 或参数 JSON；
- Advanced / Audit 保留 raw model type、raw parameter JSON、record identity、origin、`runtime_allowed` 与 reason code。未知 model type 使用用户级 fallback，未知参数 key 保留原科学 identifier，异常嵌套值安全跳过且不修改源对象；
- cell-free / purified-enzyme scope 与 runtime unavailable 边界保持原样；ND、reported range 与 quantified output 的科学语义未改。

### Targeted、完整门禁与视觉审计

- 展示 helper 与 Full Detail 定向回归为 2 个测试文件、25 项测试全部通过；扩展 Sender 回归为 9 个测试文件、110 项测试全部通过；AHL/HSL V1.1 Receiver release 回归为 1 个测试文件、13 项测试全部通过；
- 完整 Vitest 共 129 个测试文件、993 项测试全部通过；全部 53 条 Sender evidence 仍为 0 admitted，Catalog 仍为 76 个 Component、52 条 Receiver response、53 条 Sender evidence、20 个 runnable Receiver、0 个 runnable Sender，真实 Sender Full Detail 的 Add to Network 按钮数量仍为 0；
- TypeScript `tsc --noEmit`、ESLint `eslint . --max-warnings 0` 与本批改动文件的定向 Prettier 检查全部通过；
- Vite 7.3.6 生产构建通过，290 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB；主 CSS 为 270.74 kB、gzip 45.51 kB；主 JavaScript chunk 为 3,224.98 kB、gzip 432.57 kB；构建保留大于 500 kB 的既有 chunk 提示，没有新增运行时依赖；
- `docs/ui-audit/sender-evidence/08-raw-input-semantics-1440x900.png` 与 `09-kinetic-parameters-1440x900.png` 来自真实 Windows 生产路径。1440×900 与 1180×700 均无页面级水平溢出；560 px Drawer 内 parameter table 完整适配，Raw Table 的 125 px 窄屏溢出限制在内部并可实际滚动；
- 深色主题下新参数表保持可读，应用控制台为 0 warning / 0 error。GitHub CI 状态未用于本批验收，本地完整验证已通过。

### Frozen boundaries

- 相对审核基线 `68d90cbbd71997babdb1a63c6fc00e7aa6f1a2cd`，12 个 Sender V1.2 source file、source hash manifest、Loader、Validator、Identity、Integrity、Runtime Admission、Types、Schema、Manifest、Evidence Scope presentation、Catalog Discovery 与 Catalog Detail 均为零差异；现有逐文件 SHA-256 测试继续通过；
- 冻结 AHL/HSL V1.1 JSON、Receiver whitelist / evaluator / verification / instantiation、Inverse Design、Ontology v1、Temporal / Compatibility core、Simulation、Workspace、`package.json` 与 lockfile 均为零差异；
- V1.1 JSON SHA-256 保持 `7f31755a24c8a3c066ecbba70c21f361ffe3a05665fbb681903310a93a404596`；BFN-IR 保持 2.0，BFN-SIM 保持 2.0，Workspace IndexedDB 保持 v1。本批只改变 Sender evidence presentation。

## 2026-08-29 Batch 12.0 User-defined Functional Module Contract

### Authoring contract targeted tests

- TDD RED 阶段按预期因 `userModuleValidation` 尚不存在而失败，随后以纯合同实现进入 GREEN；
- 新增 1 个测试文件、14 项测试，覆盖 Designed Sender `production_rate` fixture、AHL concentration 到 normalized activity、implementation unspecified、五轴独立、无 score、稳定 Entity ID 与 display label 分离、现有 Quantity/Unit 白名单及 unsupported unit 不自动换算；
- Hill 覆盖单输入/单输出、缺失参数、`K <= 0`、`n <= 0`、参数 unit mismatch、`ymax < ymin`；Linear 覆盖同单位可执行边界和 compound slope unit 缺口；Independent Inputs 覆盖 term 完整性、模型层 `independent_unverified`，并验证 Evidence basis 与 family 独立；
- Validity Domain 覆盖每个 input 恰好一个 finite range、`minimum < maximum`、Port 引用和 unit 一致；Evidence 覆盖 `proposed_unbuilt_design`、带结构化 provenance 的 published/measured grade，以及 `not_required | provided | missing`。`provided` 只证明 provenance record 结构已提交，不授予科学验证、Catalog trust、证据充分性或 runtime authorization；
- 相同 draft 重复 assessment 完全一致，输入不变，返回值及嵌套 issues 深冻结，localStorage sentinel 不变；生产合同源文件不依赖项目、工作区、存储、仿真编排、Sender admission 或 Ontology assignment。

### Frozen contract regression

- 6 个定向文件、63 项测试全部通过，组合覆盖新合同、Sender Runtime Admission、V1.1 Catalog release、Port Compatibility、Temporal Capability 与 Context Applicability；
- V1.1 runtime whitelist 仍为 20 条 trusted runnable Receiver；
- Sender V1.2 仍为 53 条 evidence、0 条 admitted Sender；
- `production_rate -> concentration` 继续 hard block，Context missing 继续产生不确定适用性而非伪造 mismatch，static temporal fallback 合同保持不变。

### Complete gates 与 frozen diff

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 本批 9 个改动文件完成定向 Prettier write/check；未执行全仓格式重排；
- 完整 Vitest 共 130 个测试文件、1007 项测试全部通过；相对 Batch 11.1.1 基线正好新增 1 个文件、14 项测试，没有删除、跳过或弱化既有断言；
- Vite 7.3.6 生产构建通过，290 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB；主 CSS 为 270.74 kB、gzip 45.51 kB；主 JavaScript chunk 为 3,224.98 kB、gzip 432.57 kB；
- 构建保留大于 500 kB 的既有 chunk 提示，产物生成成功；用户合同没有接入生产 import graph，因此构建模块与产物尺寸保持冻结基线结果；
- 相对 `099294b018d1a6c4644156a9e083edde87570a43`，Sender V1.2、V1.1 Catalog/Receiver runtime、Catalog BFN adapter、Inverse Design、Ontology v1、Temporal、Compatibility、Simulation、BFN types/repository/model resolution/validation/math/unit、Workspace、`package.json` 与 lockfile 均为 zero diff；
- BFN-IR 保持 2.0，BFN-SIM 保持 2.0，Workspace IndexedDB 保持 v1；没有 UI 改动，因此本批不执行 Visual Audit；
- GitHub CI 状态不用于本批验收；以上为本地完整验证结果。

## 2026-08-29 Batch 12.0.1 BFN-IR 2.1 User-defined Representation Extension

### Schema、migration 与 repository targeted tests

- TDD RED 阶段的首个 `bfnIrMigration.test.ts` 按预期因中央迁移模块尚不存在而失败，随后实现唯一的 2.0/2.1 validator 与 upgrade path；
- 迁移回归覆盖 pristine 2.0 的精确保守映射、输入不变、determinism、idempotence、既有 uncertainty/context/range/dataset reference 与 recorded Context 原文保留、2.0 authoring metadata 不推断、2.0 import、2.1 roundtrip 和未知未来版本 fail-closed；
- 2.1 结构回归覆盖 user authoring metadata、custom Entity、partial/not-recorded Context、nullable model/domain Context reference、`none`/`not_recorded` uncertainty、generic provenance、`sourceDatasetIds` 与 `provenanceIds` 独立、implementation unspecified/maturity 和全部新增字段的 malformed rejection；
- Context integration 的 RED 回归先得到 `unavailable`，实现后 null model Context 生成四项 unknown comparable facts并返回 uncertain；partial Context 的已知事实匹配、缺失事实 uncertain、canonical 温度冲突 mismatched，既有 recorded 与 Catalog exact parameter Context 行为不变；
- computation-signature RED 回归证明直接使用 2.1 `schemaVersion` 与 `documentationState` 会产生假变更；最小 projection 保留 legacy 2.0 serialization marker 和原 Context 属性顺序，纯 2.0 → 2.1 migration 与 authoring/Entity/provenance/maturity metadata 不改变已持久化签名，实际 Context facts、模型参数、端口、有效域和分析设置继续进入签名；
- 7 个核心目标测试文件共 77 项测试通过，覆盖 schema、repository、Context、signature、project factory 与两种 Workspace repository。

### Workspace 与 immutable Version regression

- fake IndexedDB 直接写入旧 2.0 Draft 与 Version snapshot；Draft read、Version read 和 restore-to-Draft 均得到 2.1，底层 immutable Version 在两次读取与恢复后仍为 2.0；
- localStorage fallback 使用同等原始状态注入，验证相同的 2.1 read view、restore 与历史不改写合同；
- IndexedDB object store 和 index 集合保持原样，`BFN_WORKSPACE_DATABASE_VERSION` 保持 `1`。

### Complete gates 与 frozen diff

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 完整 Vitest 共 131 个测试文件、1033 项测试全部通过；20 个 trusted runnable Receiver、53 条 Sender evidence、0 admitted Sender 继续由既有 hard regression 固定；
- Vite 7.3.6 生产构建通过，291 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB，主 CSS 为 270.74 kB、gzip 45.51 kB，主 JavaScript chunk 为 3,231.31 kB、gzip 434.13 kB；保留既有大 chunk 提示，没有新增依赖；
- 沙箱内首次 Vitest/build 启动因 esbuild 子进程权限返回 `spawn EPERM`，相同命令在获批环境复跑通过；
- 仅对 27 个本批变更文件执行 Prettier write/check，没有全仓格式重排；无 UI 变化，不执行截图或 Visual Audit；
- Sender V1.2 source、loader、validator、Runtime Admission、Receiver data/evaluator、Inverse Design engine、Ontology production assignments、Port Compatibility policy、Temporal production policy、response equations、`package.json` 与 lockfile 均为零差异；Simulation 只过滤 null Context ID 的 provenance list，不改变数值方程；
- BFN-SIM 保持 `BFN-SIM-2.0`，Workspace IndexedDB 保持 v1；GitHub status check 不用于本批验收，以上只表示本地完整验证通过。

## 2026-08-29 Batch 12.0.1 Master Review Context Placeholder Fix

### Placeholder semantics regression

- TDD RED 阶段新增测试得到 8 个预期失败：migration 已逐字保留 legacy raw text，但 Context projection 仍暴露 placeholder，User Module Contract 仍接受这些字符串；
- GREEN 阶段的 2 个直接目标文件、30 项测试全部通过。`unknown`、trim 后的 mixed-case `unknown`、`N/A`、`not recorded`、`unspecified`、空字符串与纯空白字符串在 Context Applicability projection 中均成为 `null`；相同 placeholder 对比为 `uncertain`；
- 2.0 → 2.1 migration 的原始 `host` / `strain` / `medium` 字符串保持逐字不变。真实相同 reported facts 继续 `matched`，真实 reported-text 差异继续 `uncertain`，canonical temperature conflict 继续 `mismatched`；
- User-defined `hostSpecies`、`hostStrain` 与 `medium` 对全部上述 placeholder 执行 trim 后的 case-insensitive rejection，并产生 `context_fact_invalid`。显式 `not_recorded` Context 继续允许数学合同保持 `supported`。

### Complete gates 与 frozen diff

- migration、Context、User Module Contract、Receiver release、Sender admission、Port Compatibility、Simulation 与 Workspace 共 8 个定向文件、97 项测试全部通过；
- 完整 Vitest 共 131 个测试文件、1042 项测试全部通过；20 个 trusted runnable Receiver、53 条 Sender evidence、0 admitted Sender、`production_rate -> concentration` hard block、`BFN-SIM-2.0` 与 Workspace IndexedDB v1 均由回归固定；
- TypeScript `tsc --noEmit`、ESLint `eslint . --max-warnings 0` 全部通过；
- 仅对本修复的 7 个变更文件执行 Prettier write/check，`git diff --check` 通过；未执行全仓格式重排；
- Vite 7.3.6 生产构建通过，291 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB，主 CSS 为 270.74 kB、gzip 45.51 kB，主 JavaScript chunk 为 3,231.49 kB、gzip 434.13 kB；保留既有大 chunk 提示；
- 相对 reviewed head `9773b1d030c867d396e91671985f1c31532e2a6e`，Sender、Receiver evaluator/Catalog V2、Port policy、Temporal、Simulation equations、Ontology、Workspace、BFN-IR types/repository/migration 与 package dependencies 均为零差异；
- 本修复无 UI 变化，不执行 Visual Audit；GitHub status check 不用于本批验收，以上只表示本地完整验证通过。

## 2026-08-30 Batch 12.0.2 BFN-IR 2.2 User-authored Port Label Representation

### Schema、migration 与 exact-gap regression

- TDD RED 阶段的 migration/parser 定向测试得到 9 个预期失败：current schema 仍返回 2.1、缺少 2.2 guard，且 Port authoring metadata 尚未校验；最小实现后该文件 28 项测试全部通过；
- 2.0 → 2.2 保留冻结的 2.0 → 2.1 保守迁移，再执行版本提升；2.1 → 2.2 只提升版本；两条路径都不创建 Port authoring metadata；2.2 输入返回经验证的深拷贝；
- exact-gap regression 独立保存 `port.authoring.name = "Inducer input"`、`port.entity = "entity.user.inducer-x"` 与 Entity `displayName = "Inducer X"`，并覆盖带前后空格的逐字 name；
- InputSource output、FunctionalModule input/output 与 OutputMonitor input 四类 Port 都拒绝 inferred/catalog origin、空字符串与纯空白 name；内置与 Catalog Port 不需要 `authoring`；
- migration 保持 deterministic、idempotent、non-mutating，2.3 与 3.0 继续 fail closed。

### Workspace、signature 与 compatibility regression

- IndexedDB 和 localStorage 分别注入 2.0/2.1 Draft 与 Version；读取均返回 2.2 copy，底层 immutable Version snapshot 在读取和 restore 后保持原版本；
- Workspace IndexedDB object stores、indexes 与 `BFN_WORKSPACE_DATABASE_VERSION = 1` 不变，storage keys 不变；
- 只增加或改写 `port.authoring.name` 不改变 computation signature；Port `id`、`entity`、`quantityType`、`unit` 与 `direction` 的变化继续改变签名；
- 带或不带 Port authoring/localized display metadata 的 compatibility assessment 完全相同；`production_rate → concentration` 继续 hard block；
- 10 个定向文件、118 项测试全部通过，包含 20 个 trusted runnable Receiver、53 条 Sender evidence 与 0 admitted Sender 的既有 hard regression。

### Complete gates 与 frozen diff

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 完整 Vitest 共 131 个测试文件、1056 项测试全部通过；
- Vite 7.3.6 生产构建通过，291 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB，主 CSS 为 270.74 kB、gzip 45.51 kB，主 JavaScript chunk 为 3,232.10 kB、gzip 434.27 kB；保留既有大 chunk 提示；
- 仅对本批变更文件执行 Prettier；未执行全仓格式重排；本批没有 UI 改动，不执行 screenshot 或 Visual Audit；
- 相对精确基线 `8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2`，Sender V1.2 source/loader/validator/admission、Receiver data/whitelist/evaluator、Inverse Design、Ontology production assignments、Temporal policy、Port Compatibility production policy、Simulation equations、Workspace DB structure、`package.json` 与 lockfile 均为零差异；
- BFN-SIM 保持 `BFN-SIM-2.0`。以上结论为 local full validation passed，不声明 CI passed。

## 2026-08-31 Batch 12.1 Static Functional Module Authoring & Runtime Integration

### Phase gates

- Phase A 的不确定性运行时、Run repository、required-input safety、ANN、图表与导出定向门为 10 个测试文件、113 项测试全部通过；新运行使用 `BFN-SIM-2.1`，历史 `BFN-SIM-2.0` 继续读取；
- Phase B 的纯 materializer 单文件包含 18 项测试；materializer、BFN-IR migration 与 repository 联合门为 3 个文件、67 项测试全部通过，覆盖当前 2.2 gate、确定性 ID、Entity reuse/new identity/conflict、Context、validity domain、uncertainty、provenance 与 implementation；
- Phase C 的 draft builder、authoring form、页面集成、Add Module drawer 与语义展示为 5 个文件、46 项测试全部通过；覆盖四种静态 family、单输出、Port role/Entity 分离、完整参数区间、强证据 provenance、一次 project edit，以及工具栏和键盘 Undo/Redo 恢复精确对象与 ID；
- 冻结 Receiver/Sender、Port Compatibility、Temporal 与 Ontology 定向回归为 11 个文件、103 项测试全部通过。

### Runtime、materialization 与交互回归

- `none`、`not_recorded` 和不可执行的 posterior/bootstrap/covariance 方法继续生成有限点估计，`lower/upper = null`，没有零宽区间；完整 parameter envelope 才生成定量 ribbon；混合输出路径按所有 output-reachable active model 共同决定网络区间可用性；
- ANN 的 R²、NRMSE 与 maximum absolute error 保持点预测指标；有效参考区间缺失时 `predictionIntervalCoverage = null`；
- 输出可达 user-defined model 的 modeled input 缺少 enabled incoming Edge 时产生 error 并阻止运行；已连接的显式零值正常计算；无关断开模块不阻塞目标输出；
- Materializer 不修改输入 Project，不写 localStorage/IndexedDB，不运行 Simulation，不调用 Sender admission 或 Ontology；成功只生成一个 FunctionalModule 和必要 registry sidecar；
- Add to Network 不自动创建 Edge、Input Source、Output Monitor 或 Run。Workspace Current Draft 自动保存、Version、项目 JSON 往返和已有存储结构沿用 BFN-IR 2.2。

### Visual Audit

- 1440×900 深色真实应用中完成 Add Module → 自定义功能模块、Hill 与 independent_inputs 表单、校验错误、Entity 复用、Inspector 逐字 Port 角色名、Undo/Redo、手动连接和静态运行审查；
- point-only 模块运行得到有效点输出，结果明确显示参数区间不可用且不渲染 ribbon；完整 Hill 参数区间运行显示“参数区间”曲线和可见包络；
- 1280×720 下抽屉宽 560 px；内部滚动容器 `clientHeight = 619`、`scrollHeight = 1411`、`overflow-y = auto`，操作按钮底部为 676 px，保持在 720 px 视口内；文档 `scrollWidth = clientWidth = 1280`，无横向溢出；
- 深色主题的字段、分组、焦点、固定 footer、画布和结果 Dock 层级清晰；浏览器 warn/error 日志为 0。

### Complete gates 与 frozen diff

- TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；只对本批明确变更文件执行 Prettier，没有全仓格式重排；
- 首次全量回归定位到 1 个旧 Catalog integration 断言仍把显式零输出写成 `lower = upper = 0`。生产逻辑已符合 2.1；测试改为要求点输出 `0`、`lower/upper = null` 和 uncertainty unavailable，单文件 12 项测试通过；
- 修正后完整 Vitest 共 137 个测试文件、1102 项测试全部通过；没有删除、skip、todo 或弱化科学断言；
- Vite 7.3.6 生产构建通过，297 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB，主 CSS 为 277.31 kB、gzip 46.33 kB，主 JavaScript chunk 为 3,300.11 kB、gzip 452.37 kB；保留既有大于 500 kB chunk 提示；
- 从精确冻结基线 `499f44e8a57e8e80a678aaf29e14cba7da99cd2a` 复核：Sender V1.2 source/loader/validator/admission、Receiver V1.1 data/whitelist/formulas、Inverse Design、Ontology assignment、Port Compatibility policy、Temporal policy、BFN-IR schema/migration、Workspace IndexedDB store/index、`package.json` 与 lockfile 均为零差异；
- 当前代码与通过的硬回归再次确认 20 个 trusted runnable Receiver、53 条 Sender evidence、0 admitted Sender，以及 `production_rate → concentration` hard incompatibility；
- BFN-IR 保持 `2.2`，Workspace IndexedDB 保持 v1；Batch 12.1 状态为 `ACTIVE`，等待 Master Control review，不自我声明冻结。以上结论为 local full validation passed，不声明 CI passed。

### Master Review narrow fix

- Materializer provenance 回归覆盖 draft ID 原样保存、同 ID/同 kind/同 reference 复用，以及 kind/reference 冲突返回 `provenance_record_conflict`；model 的 `sourceDatasetIds` 继续为空；
- 新建 materialization 只接受 `not_recorded`、`none` 与完整 `parameter_interval_envelope`；`posterior_samples`、`bootstrap`、`covariance` 分别返回 `uncertainty_method_not_authorable`。既有项目的三种方法继续通过 BFN-SIM 兼容测试生成点估计与 `lower/upper = null`；
- Target-monitor 回归覆盖四种情况：主路径 authored input 缺失时阻止运行、第二 Monitor 路径缺失时主路径成功、主路径显式连接零成功、完全不可达 authored module 不阻塞。生产 issue 保持 `missing_required_input`；目标路径为 `error`，目标外 authored input 为 `warning`；
- provenance、uncertainty、target-monitor、历史 BFN-SIM repository 与 authoring UI 定向门共 8 个测试文件、86 项测试全部通过；
- Receiver/Sender 数量、admission、Port Compatibility、BFN-IR migration、BFN-SIM repository 与 Workspace IndexedDB 专项门共 8 个测试文件、107 项测试全部通过，再次固定 20/53/0 与版本边界；
- `npm run typecheck`、`npm run lint`、完整 Vitest 137 个测试文件/1111 项测试、`npm run build` 全部通过；Vite 7.3.6 转换 297 个模块，主 JavaScript chunk 为 3,300.79 kB、gzip 452.59 kB，保留既有大于 500 kB chunk 提示；
- Batch 12.1 继续为 `ACTIVE`。以上结论为 local full validation passed，不声明 CI passed。

## 2026-08-31 Batch 12.2 Designed Sender Authoring & Signal Production Semantics

### Contract、identity 与 materialization gates

- Designed Sender 联合定向门为 8 个测试文件、79 项测试全部通过，覆盖纯合同、draft builder、trusted signal identity projection、generic materializer 扩展、Designed Sender materialization、authoring form、Add Module drawer、页面集成与中英文翻译键；
- builder 固定一个 concentration control input 和一个 production_rate output，仅接受 Hill activation / repression。输入单位限制为 `M | mM | uM | nM | pM`，输出单位限制为 `nM/h | uM/h`；K 跟随输入单位，n 为 dimensionless，ymin/ymax 跟随 rate unit，且 `ymax >= ymin`；
- Context、Evidence、Implementation 与 uncertainty 继续复用 Batch 12.1 合同：支持 `not_recorded` 和 partial Context，拒绝 placeholder；Evidence 默认 `proposed_unbuilt_design`，强证据要求 provenance；Implementation 保持 unspecified；可 author 的 uncertainty 只包含 `not_recorded`、`none` 和完整 parameter interval envelope；
- trusted signal projection 只读取 release signal 的 identity 字段。已知信号保留 canonical Entity ID 且不创建 user-defined registry record；custom signal 创建独立 user-defined Entity；相同 ID 的 display-name conflict fail closed；Designed Sender 生产代码不依赖 Sender V1.2 数据、loader、validator 或 Runtime Admission；
- generic materializer 新增可选 authoritative external Entity 输入。缺省调用保持 Batch 12.1 行为；权威 Entity 完全匹配时复用且不写 registry，冲突时返回结构化失败，未知 Entity 继续走既有 user-defined creation 路径。provenance identity 与 uncertainty authorability 的冻结回归保持通过。

### Runtime、connection 与 authoring integration

- Add to Network 通过一次 project edit 生成一个普通 `FunctionalModule`，没有 Designed Sender node marker，不创建 Sender Catalog record、Edge、Input Source、Output Monitor 或 Run；BFN-IR 2.2 validator 与项目 JSON roundtrip 保留完整模块、Port authoring label、canonical/custom Entity 语义；
- real Catalog Receiver `resp.kylilis2018.lux.3oc6` 集成回归确认双方使用相同 3OC6-HSL Entity，`production_rate` 输出到 `concentration` 输入仍因 quantity mismatch hard reject；没有 hidden conversion，也没有自动 Signal Pool；
- Designed Sender 直接使用冻结的 generic BFN-SIM-2.1 路径：有效 control Input Source 可执行有限 point estimate；output-reachable control input 未连接产生 `missing_required_input`；显式连接零值正常执行；没有新增特殊 Sender evaluator；
- UI 回归覆盖两个 authoring 入口、打开/取消零 Project mutation、仅显示 Hill activation/repression、known/custom signal、固定 quantity 与单位、evidence/uncertainty 约束、parameter interval 完整性、单模块原子添加、新模块选择、Inspector 语义、精确 Undo/Redo，以及到 concentration Receiver 的禁用连接。

### Visual Audit

- 真实应用 1440×900 完成 10 个规定场景：双 authoring 入口、默认表单、known signal、custom signal、Hill activation、validation error、添加到画布、Inspector production_rate、connection rejection 与 dark theme；
- 1280×720 下抽屉宽 560 px；内部滚动区 `clientHeight = 619`、`scrollHeight = 1325`、`overflow-y = auto`，测试 `scrollTop = 700`；操作区 top/bottom 为 633/686 px，主按钮 bottom 为 676 px，保持可达且未被 Result Dock 覆盖；
- 文档 `scrollWidth = clientWidth = 1280`，无页面级横向溢出；浏览器 console 新增 warning/error 均为 0。截图与复核说明保存在 `docs/ui-audit/designed-sender-authoring/`。

### Complete gates 与 frozen diff

- `npm ci`、TypeScript `tsc --noEmit` 与 ESLint `eslint . --max-warnings 0` 全部通过；
- 默认并发 `npm test` 两次分别因既有 UI 用例达到 5 秒 timeout 得到 2 项和 1 项超时；对应 ModelingPage 1/1 与 Workspace 33/33 单文件复跑通过。保持测试和断言不变后，`npm test -- --maxWorkers=4` 完整回归为 142 个测试文件、1141 项测试全部通过；
- 冻结科学边界定向回归为 17 个文件、197 项测试全部通过；再次固定 20 个 trusted runnable Receiver、53 条 Sender evidence、0 admitted Sender、`production_rate -> concentration` hard block、BFN-IR 2.2、BFN-SIM-2.1 与 Workspace IndexedDB v1；
- Vite 7.3.6 生产构建通过，301 个模块完成转换；`index.html` 为 0.54 kB、gzip 0.37 kB，主 CSS 为 278.47 kB、gzip 46.47 kB，主 JavaScript chunk 为 3,327.49 kB、gzip 457.69 kB；保留既有大于 500 kB chunk 提示；
- 仅对相对冻结基线的 23 个文本变更文件执行 Prettier write/check，没有全仓格式重排；`git diff --check` 通过；
- 相对精确冻结基线 `1fa9c11909817b3e3b4873e7bf85a1a158b68338`，Sender V1.2 source/hash/loader/validator/admission、Receiver V1.1 source/whitelist/formulas、Catalog Receiver parameter binding、Inverse Design、Ontology assignment、Port Compatibility、Temporal、BFN-IR schema/migration、BFN-SIM result contract/equations、Workspace DB 结构、`package.json` 与 lockfile 均为零差异；
- Batch 12.2 状态保持 `ACTIVE`，等待 Master Control review，不自我声明冻结。以上为本地完整验证结果；GitHub check 状态在正常 push 后单独记录。

## 2026-08-31 Batch 12.3 First-order Dynamic User Module Authoring

### Contract、materialization 与 runtime gates

- dynamic authoring contract 覆盖 Hill activation/repression、linear transfer 与 independent inputs，拒绝 identity、任意 expression、非法或非 `h` 的 tau、非有限 initial state、非法时间范围和不完整 tau interval；
- pure materialization 为同一普通 `BfnFunctionalModule` 创建 paired static/dynamic variants，逐值核对 `static.response` 与 `dynamic.steadyStateResponse`，并保持 static materializer 默认行为不变；
- 一阶 step fixture 核对初值、单调趋近与长时间稳态；运行继续使用 BFN-SIM-2.1 既有方程，不通过 runtime clamp 接受非法 authoring tau；
- parameter interval envelope 同时要求全部 steady-state 参数区间和 tau 区间；缺失或畸形区间形成 unavailable uncertainty snapshot，不伪造零宽区间；
- output-reachable feedback cycle 含有效动态用户模块时产生 `dynamic_feedback_unsupported` severity-error，项目拓扑仍可保存，`runBfnSimulation()` 被阻止。

### Authoring、persistence 与隔离回归

- generic authoring 默认保持 Steady-state；选择 First-order dynamic 后显示独立 Dynamics 区域，采集 tau、继承输出单位的 initial output、可选 time validity 和 tau interval；全部可见文案提供中英文翻译；
- Add to Network 覆盖 paired model、一次 Project edit、原子 Undo/Redo，以及不自动创建 Edge、Input Source、Output Monitor、Run、Signal Pool 或 network mode switch；
- BFN-IR 2.2 JSON 与 Workspace v1 roundtrip 覆盖 model IDs、Port metadata、tau、initial state、time range、Context、provenance、Implementation 和 uncertainty；
- Designed Sender 隔离回归明确检查表单无 response-mode/Dynamics/tau/initial-state 控件，物化结果只有一个 static variant 且没有 dynamic active model 或动态字段；Designed Sender 生产代码不改变；
- 冻结差异审计保持 BFN-IR schema/migration、BFN-SIM equation、Workspace DB structure、Sender/Receiver source/admission、Catalog formulas、Port Compatibility、Ideal Edge、Temporal evidence、Inverse Design、Ontology、Signal Pool、`package.json` 与 lockfile 不变；
- Batch 12.3 状态保持 `ACTIVE`。完整测试数量与本地 typecheck/lint/build/format/diff 结果以本轮 Handoff Packet 的真实命令输出为准，不声明 CI 或 Master Review 结果。

## 2026-09-01 Batch 12.3 Master Review Runtime-admission Correction

### Central runtime contract

- 修正从 pre-fix Head `ba1f80312796c31c2b0832f085e72e242b7e3e43` 开始，中央实现提交为 `7520623c3f75c8ae5ee6173d4a507f7b7825227f`；
- `validateBfnProject()` 仅检查目标 Output Monitor 可达路径中的 effective `user_defined + dynamic` 模型。family、tau 值/单位/可选区间、initial state、paired active static model、steady-state response 深值一致性、可选时间范围和 parameter-envelope 完整性在进入 BFN-SIM 前统一 fail closed；
- 新稳定错误为 `dynamic_model_contract_invalid`，`details.reason` 覆盖 `family_invalid`、`tau_missing`、`tau_non_finite`、`tau_non_positive`、`tau_unit_invalid`、`tau_interval_invalid`、`initial_state_invalid`、`paired_static_missing`、`steady_state_response_mismatch`、`time_range_invalid` 与 `parameter_interval_incomplete`；
- JSON 导入的负 tau/错误单位/null initial state、Workspace 持久化后的负 tau、直接对象中的 NaN、缺失或非 static 配对模型、steady-state mismatch、逆序时间范围和不完整 envelope 均被中央校验阻止，`runBfnSimulation()` 返回既有 `BFN_VALIDATION_FAILED`；
- static mode 的 dormant malformed dynamic variant 继续按有效 static model 运行；selected Monitor 之外的 malformed dynamic 路径不阻断当前目标；结构深比较不依赖对象属性插入顺序；
- `dynamic_feedback_unsupported` 范围保持不变，Designed Sender 继续 static-only；`simulation.ts`、一阶方程、solver clamp、BFN-SIM 2.1、BFN-IR 2.2 与 Workspace DB v1 均未修改。

### TDD、完整门禁与冻结审计

- TDD RED 首次运行新增文件的 15 项测试时得到 13 项预期失败、2 项既有边界通过；最小中央闸门完成后 15/15 通过，补入 Workspace 持久化路径后该文件为 16/16；
- dynamic runtime、dynamic materialization/contract、Batch 12.1 static materialization/contract、uncertainty、feedback、simulation 与 Designed Sender 联合定向回归为 11 个文件、133 项测试全部通过；
- `npm ci` 按 lockfile 成功安装 288 个包；`npm test -- --maxWorkers=4` 完整回归为 146 个测试文件、1198 项测试全部通过；
- `npm run typecheck` 与 `npm run lint` 全部通过；Vite 7.3.6 生产构建转换 303 个模块，主 CSS 为 279.02 kB、gzip 46.50 kB，主 JavaScript chunk 为 3,348.45 kB、gzip 462.80 kB，保留既有大 chunk 提示；
- 5 个代码/测试/i18n 变更文件通过 Prettier check，`git diff --check` 通过；Windows checkout 的 Sender raw source 仅在全量测试期间临时恢复 canonical bytes，测试后立即恢复工作树，未进入 correction diff；
- 相对 `ba1f80312796c31c2b0832f085e72e242b7e3e43`，修正只涉及中央 validation/type、单个 runtime regression 文件和中英文 validation message；相对 `b76945246e56ed1fb494dc6f59c972a9f3999eda` 的扩展审计确认 BFN-IR migration、BFN-SIM equation、static materializer、Designed Sender production、Sender/Receiver、Compatibility、Temporal、Inverse Design、Ontology、Workspace production、`package.json` 与 lockfile 无生产差异；
- Batch 12.3 保持 `ACTIVE`，等待 Master Control 复核；本轮未检查 GitHub checks，不声明 CI、PASS、FROZEN 或 Master Review completed。

## 2026-09-01 Batch 12.4.0 BFN-IR 2.3 Dynamic Process Representation Extension

### Representation、migration 与 persistence gates

- BFN-IR current representation 升级为 2.3；2.0、2.1、2.2 项目通过中央 migration 保守升级至 2.3，current 2.3 走 validate + deep clone，未知 2.4/3.0 继续 fail closed；
- accumulator 作为独立 dynamic family 保存 `inputPortId`、`outputPortId` 与 finite `initialState`，不包含 `tau`、`steadyStateResponse` 或 static `response`；module-level validator 同时验证 Port 存在性与 input/output direction；
- `activeModelIds` 支持 static-only、paired static/dynamic 与 dynamic-only，并拒绝空对象、缺失引用和 mode 错配；static network 对 dynamic-only module 解析为 null，dynamic network 保持 dynamic-first/static-fallback 语义；
- JSON、localStorage、Workspace IndexedDB Draft 与 Version 对 current 2.3 accumulator representation 无损往返；读取历史 2.0/2.1/2.2 snapshot 返回 2.3 copy，底层 immutable Version snapshot 保留原始版本；Workspace DB version、store、index 与 storage key 均未改变；
- computation signature 纳入 accumulator 的 active model、Port references、initial state 与既有 scientific metadata；descriptive authoring metadata 与 position 继续不影响 signature。

### Runtime boundary 与 complete gates

- target-reachable effective accumulator 产生稳定 severity-error `dynamic_process_runtime_unsupported`，并在任何 accumulation calculation 前由既有 `BFN_VALIDATION_FAILED` 路径阻止；off-target accumulator 不阻断当前 Monitor，static mode 的 dormant accumulator 不阻断 static run；
- BFN-SIM 保持 2.1；`simulation.ts` 只增加 family narrowing、fail-closed guard 与 target-reachable module filtering，一阶 update equation、timestep semantics 和 dynamic metrics 保持不变；没有 accumulator equation、SIM 2.2 或 uncertainty propagation；
- 迁移、repository、model resolution、signature、Workspace、Temporal、validation、uncertainty、first-order、feedback、Designed Sender、Catalog Receiver、Port Compatibility 与 simulation 联合定向门为 20 个测试文件、252 项测试全部通过；
- 第一次完整回归定位到一个遗漏的 current schema 2.2 测试断言，以及 Windows `core.autocrlf` 下 Sender V1.2 immutable source 清单的混合换行检出形态；修正断言并仅在测试期间按清单恢复物理字节后，失败文件定向复跑为 2 个文件、14 项测试全部通过；冻结 Sender Git blob 与基线哈希一致且 diff 为零；
- 最终 `npm test -- --maxWorkers=4` 为 148 个测试文件、1220 项测试全部通过；`npm run typecheck` 与 `npm run lint` 全部通过；
- Vite 7.3.6 生产构建通过，303 个模块完成转换；主 CSS 为 279.02 kB、gzip 46.50 kB，主 JavaScript chunk 为 3,353.39 kB、gzip 463.92 kB；保留既有大于 500 kB chunk 提示；
- 本批变更文件通过 Prettier check 与 `git diff --check`；相对精确基线 `f444433ee13acbc2a69602550c1163c263b313a5`，package dependencies、Sender V1.2、Receiver V1.1、Designed Sender scientific contract、Port Compatibility、Ideal Edge、Temporal evidence、Inverse Design、Ontology production、Workspace DB structure 与 first-order scientific semantics保持不变；
- Batch 12.3 为 `FROZEN`；Batch 12.4.0 为 `ACTIVE` implementation candidate；Batch 12.4.1 与 Batch 12.4 为 `PLANNED`。本节不声明 CI、PASS、FROZEN 或 Master Review completed。

### Master Control Correction Pass — IR fail-closed 与 SIM-2.1 zero-diff

- TDD RED 在只加入 mandatory regressions、未修改生产代码时得到 2 个文件 / 40 项测试中的 2 项预期失败：first-order-shaped unknown family 被 BFN-IR 2.3 接受，以及 off-target existing first-order module 未出现在 dynamic `moduleOutputs`；最小修正后同组为 2/2 文件、40/40 测试通过；
- BFN-IR 2.3 dynamic discriminator 只接受 `first_order` 与 `accumulator`；已有 accumulator-shaped unknown-family 回归保留，并新增 first-order-shaped unknown-family 对 `isBfnProjectV23()`、`upgradeBfnProjectToCurrent()` 与 `parseBfnProject()` 的联合拒绝；
- `simulateDynamicScenario()` 恢复 `dynamicModuleOrder(project)` 全模块 evaluation scope。一阶与 static fallback 的初始化、求值、`moduleOutputs`、domain 与 timestep 语义保持冻结；target reachability 只区分 accumulator：off-target skip，target-reachable defense-in-depth hard stop；
- Master Control 指定的 migration、accumulator boundary、simulation、resolution、validation、uncertainty、feedback、dynamic runtime、Designed Sender、Catalog integration、Port Compatibility 与 Workspace 联合门为 12 个文件 / 148 项测试全部通过；
- 本次重新运行的 `npm test -- --maxWorkers=4` 为 148 个测试文件 / 1222 项测试全部通过；`npm run typecheck` 与 `npm run lint` 全部通过；
- Vite 7.3.6 生产构建通过，303 个模块完成转换；主 CSS 为 279.02 kB、gzip 46.50 kB，主 JavaScript chunk 为 3,353.31 kB、gzip 463.91 kB；保留既有大于 500 kB chunk 提示；
- changed-file Prettier 与 `git diff --check` 通过；Windows checkout 的 Sender immutable source 仅在完整测试期间按冻结 manifest 临时恢复物理字节，Git blob/hash/diff 保持不变，测试后恢复默认检出态；
- Correction 相对 pre-fix head `68dcc00339667d4ea6fa52238074985fda459021` 仅涉及 parser、simulation、两个回归文件和本节/状态账本；BFN-IR 保持 2.3，BFN-SIM 保持 2.1，Workspace DB 保持 1，package dependencies 与其他冻结科学区域无变化；Batch 12.4.0 保持 `ACTIVE`，等待 Master Control Correction Review。

## 2026-09-01 Batch 12.4.1 BFN-SIM 2.2 Accumulator Runtime

### Scientific contract and causal execution

- 唯一合法 base 为 `cb41a6e49829249b5b2fbf44206cfb6436a425bf`；Batch 12.4.0 是 Implementation Review 与 Correction Review 均通过、bookkeeping deferred 的 reviewed predecessor；Batch 12.4.1 保持 `ACTIVE` implementation candidate；
- central accumulator admission 覆盖 exact input/output arity 与 bindings、same Entity、`production_rate -> concentration`、`nM/h -> nM | uM/h -> uM`、非负 initialState 和 `none | not_recorded` uncertainty；每个失败原因使用稳定 `accumulator_model_contract_invalid/details.reason`；
- runtime regression 固定 `C(k+1) = C(k) + r(k) * deltaT` 的 left-endpoint sample-and-hold / deferred commit，包括 t0 初值、zero/constant/step rate、实际 partial final step、两组 exact unit pair、负值与非有限 rate fail-closed、validity domain；
- real Designed Sender -> explicit Accumulator -> trusted Catalog Receiver fixture 使用 IPTG step 得到 Sender rate `[0, 0, 5, 5, 5]` 和 concentration `[2, 2, 2, 4.5, 7]`；Receiver 在 t0/t1 读取当前 Ck，不提前读取未来 state；移除 accumulator 后直接 rate-to-concentration edge 继续返回 quantity/unit mismatch；
- accumulator feedback、accumulator-to-first-order mixed ordering fail closed；first-order-to-accumulator regression 把 current first-order output sample 用于未来积分区间；accumulator-free first-order point values、moduleOutputs、sample count 与 input samples保持冻结 expected values。

### Uncertainty, metrics, persistence, and local gates

- BFN-SIM 2.2 uncertainty snapshot 区分 `parameter_interval`、`deterministic_transform` 与 `unavailable`；上游 envelope 经 accumulator 及 downstream static Receiver 保持 interval，deterministic-only 路径不伪造零宽区间，off-target bad branch 不影响 selected Monitor；
- output-reachable accumulator result 记录 terminal value，并把 steady state、rise time、overshoot、DC gain 与 frequency gain 标为 unavailable；accumulator-free dynamic result保持既有数值并同时提供 terminal/steady availability metadata；
- repository 与 Workspace regression 同时读取 BFN-SIM 2.0、2.1、2.2 payload，不重写历史结果；BFN-IR 保持 2.3，Workspace IndexedDB structural version 保持 1；
- accumulator contract/runtime、simulation、uncertainty、repository、validation、feedback、temporal、Workspace、Designed Sender、Catalog Receiver、Port Compatibility 与 first-order dynamic 联合定向门为 27 个测试文件、323 项测试全部通过；Phase C integration/uncertainty 窄门为 2 个文件、19 项测试全部通过；
- `npm test -- --maxWorkers=4` 完整回归为 152 个测试文件、1263 项测试全部通过；Windows checkout 的 12 个 Sender immutable source 文件仅在测试期间按冻结 manifest 恢复物理字节，finally 后 source diff 为零；
- `npm run typecheck` 与 `npm run lint` 全部通过；Vite 7.3.6 production build 转换 304 个模块，主 CSS 为 279.02 kB、gzip 46.50 kB，主 JavaScript chunk 为 3,359.28 kB、gzip 465.24 kB；保留既有大于 500 kB chunk 提示；
- changed-file Prettier 与 `git diff --check` 通过。以上只声明 local validation；GitHub workflow/check/status context 由 push 后实际查询结果单独回传；不声明 CI、PASS、FROZEN 或 Master Review completed。

### Master Review correction — target scope 与真实 uncertainty source

- correction 从 pre-fix Head `8e43a17ac6072721c2c269aef94405f64e1dd4e1` 线性追加；Batch 12.4.1 保持 `ACTIVE`、not `FROZEN`，等待 Master Control re-review；
- 双 Monitor static regression 固定 selected Monitor 的 temporal hard gate：Monitor A 的有效静态路径可运行，off-target Monitor B 的 dynamic-only accumulator 不产生 run-scoped `temporal_execution_unsupported`；无 target 的 whole-project validation 仍报告 Monitor B；
- zero-parameter identity regression 固定 `parameter_interval_envelope` 声明不构成真实参数源：identity 记录为 `deterministic_transform`，deterministic-only path 的 snapshot 为 unavailable 且全部 `lower/upper = null`；真实 producer interval 经 identity 与 accumulator 后保持可用上下界；
- correction 定向门为 2 个测试文件、27 项测试全部通过；完整回归为 152 个测试文件、1266 项测试全部通过。12 个 Sender immutable source 文件按逐文件 length/SHA-256 清单临时物化混合 LF/CRLF 字节，finally 后 source diff 为零；
- `npm run typecheck`、`npm run lint` 与 Vite 7.3.6 production build 全部通过；build 转换 304 个模块，主 CSS 为 279.02 kB（gzip 46.50 kB），主 JavaScript chunk 为 3,359.41 kB（gzip 465.26 kB），保留既有大于 500 kB chunk 提示；
- BFN-IR 保持 2.3，BFN-SIM 保持 2.2，Workspace IndexedDB structural version 保持 1；accumulator equation、first-order equation、mixed ordering、feedback、Sender/Receiver/Compatibility、metrics schema 与 repository persistence 均未修改。

## 2026-09-02 Batch 12.4.1 Final Correction + Batch 12.4 Signal Pool

### Phase 0 — SIM-2.2 deterministic-transform persistence

- final correction 从唯一合法 pre-fix Head `1fd4b60225b90c9e5da41b92eaec77c7c97687c8` 线性追加为 `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`，仅修改 `repository.ts` 与 `repository.test.ts`；
- regression 构建 real parameter-envelope producer → zero-parameter identity → accumulator → Monitor，确认 identity snapshot 同时保存 `method = parameter_interval_envelope`、`propagationMode = deterministic_transform`、`intervalExecutable = true` 与 `reason = null`；
- 实际 `runBfnSimulation() → saveBfnRun() → loadBfnRuns()` 对完整 Run deep-equal，包括 interval bounds、engine version、dynamic metrics、temporal snapshot 与 context snapshot；
- repository 继续拒绝 `bootstrap | posterior_samples | covariance` 与 deterministic-transform 的 malformed 组合，并按各自合同读取 BFN-SIM 2.0、2.1、2.2；
- repository 与 simulationUncertainty 定向门为 2 个测试文件、45 项测试全部通过；`npm run typecheck` 通过；Phase 0 diff check 通过；
- Phase 0 工作树 clean 后普通 push，local 与 origin correction SHA 均为 `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`。Batch 12.4.1 为 `CANDIDATE`、not `FROZEN`，等待联合 Master Review。

### Phase 1 — Signal Pool contract、materialization 与 authoring

- Phase 1 分支 `codex/bfn-signal-pool-authoring-integration` 从 exact base `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111` 创建；Signal Pool 只收集 name、optional description、explicit signal、`nM | uM` 与 finite non-negative `C0`；
- known signal 复用 Designed Sender canonical identity，existing project Entity 保留 exact ID，custom signal 只创建一个 ordinary user-defined Entity；pure materializer 创建 exactly one dynamic-only accumulator Functional Module 和最小 ValidityDomain；
- module input/output 固定为同 Entity 的 `production_rate nM/h → concentration nM` 或 `production_rate uM/h → concentration uM`；evidence 为 `independent_assumption`，uncertainty 为 `none`，Context 为 `null`，Implementation 为 `unspecified`；
- Add Module 中英文 UI 覆盖 known/existing/custom signal、unit pair、initial concentration 与 invalid-state blocking。一次 Add 是一个 Undo/Redo transaction，不创建 Edge、Input Source、Output Monitor 或 Run，不自动连线、插入或切换 network mode；
- JSON、localStorage、Workspace Draft 与 Workspace Version 无损保存 dynamic-only family、Entity、units、initialState 与 authoring metadata；BFN-IR 保持 2.3，BFN-SIM 保持 2.2，Workspace IndexedDB structural version 保持 1；
- production materializer constant-rate regression 使用 `10 nM/h`、`C0 = 2 nM`、`dt = 0.5 h` 得到 `[2, 7, 12, 17]`；static selected path 返回 `temporal_execution_unsupported`；
- production Designed Sender → Signal Pool → trusted Catalog Receiver 集成得到 Sender rate `[0, 0, 5, 5, 5]`、Pool concentration `[2, 2, 2, 4.5, 7]`，Receiver 同步读取当前 `Ck`；直接 Sender → Receiver 继续因 Quantity/Unit mismatch 被拒绝；
- upstream real parameter interval 经 Signal Pool 保持 output `[2, 7, 12]`、lower `[2, 4.5, 7]`、upper `[2, 9.5, 17]`；Pool snapshot 声明 `method = none` 与 `propagationMode = deterministic_transform`，不成为 uncertainty source；
- computation signature 随 `C0`、signal Entity 与 unit pair 改变，name、description 与 position 不改变；Undo/Redo 与 persistence 保持同一科学状态；
- contract、draft、materialization、authoring、platform、persistence、runtime、uncertainty、Designed Sender、Catalog Receiver、Port Compatibility、temporal、feedback、first-order 与既有 authoring 联合定向门为 33 个测试文件、357 项测试全部通过；lint 类型修正后的 4 个相关文件、28 项测试复跑通过；
- 最终 `npm test -- --maxWorkers=4` 为 158 个测试文件、1303 项测试全部通过；12 个 Sender immutable source 文件按 length/SHA-256 清单临时物化为规定的混合 LF/CRLF 字节，finally 后逐字节恢复；
- `npm run typecheck` 与 `npm run lint` 全部通过；Vite 7.3.6 production build 转换 308 个模块，主 CSS 为 279.02 kB（gzip 46.50 kB），主 JavaScript chunk 为 3,377.46 kB（gzip 468.79 kB），保留既有大于 500 kB chunk 提示；
- 全部分支变更文件通过 changed-file Prettier 和 `git diff --check`；相对 Phase 0 base，accumulator/first-order equations、IR migration、runtime contract、uncertainty runtime、repository、Port Compatibility、unit system、Designed Sender/Receiver science、Temporal evidence、Ontology、Inverse Design、Workspace DB 与 dependencies 保持零差异；
- 以上只声明 local validation。GitHub workflow runs、check runs 与 status contexts 在 push 后按实际查询结果回传；本节不声明 CI、PASS、FROZEN、Master Review passed 或 freeze bookkeeping complete。

### Batch 12.4 Correction Pass — Signal eligibility 与 source identity

- correction 从 pre-fix candidate `9d45d350abf07ef6034a8ce04f82d3b0d90fd76b` 线性追加为 implementation candidate `6150203fe9c75b9acbc308cb782104e80cab22cb`；Batch 12.4 保持 `CANDIDATE`、not `FROZEN`，Correction Pass complete，等待最终联合复核；
- TDD RED 在 3 个 Signal Pool 测试文件、34 项测试中得到 5 项预期失败：activity-only、expression-level-only 与 registry-only Entity 被 draft 接受，UI 展示 activity Entity，未知 serialized `signal.source` 先落入 `draft_invalid/ports`；最小修正后 34/34 通过；
- `collectSignalPoolEligibleEntityIds()` 只收集当前 Input Source、module 与 Output Monitor Port 上 `quantityType = concentration | production_rate` 的 exact Entity ID，并由 UI、draft builder、materializer 共用；回归覆盖 concentration-only 与 production-rate-only 接受，`normalized_promoter_activity`、`normalized_reporter_expression`、registry-only untyped Entity 拒绝，以及唯一 eligible Port 删除后的 stale draft 拒绝；
- materializer 在构造 BFN object 前通过 runtime `switch` 只接纳 `known | existing | custom`。forged `future_signal_mode` 返回 `signal_identity_invalid`，输入 Project 保持 deep-equal；known catalog exact identity、custom generated ID/nonblank label 与 Entity conflict protection保持不变；
- 指定 Signal Pool、platform、persistence、runtime、Designed Sender→Pool→Receiver、Port Compatibility、uncertainty、Temporal 和既有 authoring 定向门为 18 个测试文件、150 项测试全部通过；
- 完整 `npm test -- --maxWorkers=4` 为 158 个测试文件、1310 项测试全部通过。Windows 默认检出的首轮完整测试为 157/158 文件、1309/1310 项，唯一失败是冻结 Sender source 的逐字节换行清单；按每个 manifest SHA-256 临时选择 Git raw blob 或 CRLF 工作树字节后，完整性单测为 1 文件、6 项通过，最终全量通过，finally 后 12 个 source 文件逐字节恢复且 source diff 为零；
- `npm run typecheck` 与 `npm run lint` 全部通过；Vite 7.3.6 production build 转换 309 个模块，主 CSS 为 279.02 kB（gzip 46.50 kB），主 JavaScript chunk 为 3,378.07 kB（gzip 468.90 kB），保留既有大于 500 kB chunk 提示；
- 10 个代码、测试与文档变更文件通过 changed-file Prettier，`git diff --check` 通过；相对 pre-fix candidate，diff 只包含 Signal Pool eligibility、source discriminator hardening、regressions 与文档；
- 相对 Phase 1 base `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`，BFN-IR 保持 2.3，BFN-SIM 保持 2.2，Workspace DB 保持 1；accumulator equation、first-order equation、uncertainty runtime、repository、Port Compatibility、Designed Sender/Receiver science、Temporal、Ontology、Inverse Design 与 dependencies 均未修改。本节不声明 Batch 12.4 PASS、FROZEN、Master Review completed 或 CI passed。

## 2026-09-02 Batch 12.4 Series Unified Freeze Bookkeeping

- Master Control 最终联合复核结论为：Batch 12.4.0 Final Review PASS / Further FIX NONE，Batch 12.4.1 Final Review PASS / Further FIX NONE，Batch 12.4 Correction Review PASS / Further FIX NONE；三者统一登记为 `FROZEN`；
- Batch 12.4.0 的 legal predecessor 为 `f444433ee13acbc2a69602550c1163c263b313a5`，reviewed implementation 为 `cb41a6e49829249b5b2fbf44206cfb6436a425bf`；Batch 12.4.1 的 exact base 为 `cb41a6e49829249b5b2fbf44206cfb6436a425bf`，final reviewed implementation 为 `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`；
- Batch 12.4 的 exact base 为 `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`，reviewed production correction 为 `6150203fe9c75b9acbc308cb782104e80cab22cb`，distinct pre-freeze integrated branch Head 为 `29b3ec8bdf44f0d0bc39f6da1640d4ece09b27c6`；docs-only Head 不冒充 production implementation；
- 本次严格执行 docs-only freeze bookkeeping，不修改或重新物化 production、test、fixture、Sender source、runtime、package 或 lockfile，也不重跑完整软件测试；本次 docs-only bookkeeping commit 建立统一 Batch 12.4 freeze checkpoint，其实际 SHA 由提交后 handoff 记录；
- 引用最终 correction 已经 Master-reviewed 的 LOCAL validation evidence：定向 18 个测试文件 / 150 项测试通过，完整 158 个测试文件 / 1310 项测试通过，typecheck 与 lint 通过，production build 通过并转换 309 个模块，changed-file Prettier 10/10 与 `git diff --check` 通过；
- candidate 的 GitHub evidence 为 workflow runs 0、check runs 0、status contexts 0。No CI claim；aggregate `pending` 不表示 active CI；
- Batch 12.5 Reusable User Module Library 保持 `PLANNED / NOT AUTHORIZED`，Batch 13 保持 `FUTURE`。

## 2026-09-02 Batch 12.5.0 Reusable Module Template Representation Contract

### Targeted contract tests

- `src/features/bfn/module-library/template/templateParser.test.ts`：严格 runtime parser、exact shape、plain data tree、unknown schema/version/discriminator、canonical resolver、local-reference 和 payload-signature hard gates；
- `src/features/bfn/module-library/template/templateCapture.test.ts`：static、paired first-order、accumulator capture，deterministic local keys，complete minimal closure，canonical/embedded/slot policy，shared/external Entity scan，以及 demo/catalog/dataset/dormant/unresolved rejection；
- `src/features/bfn/module-library/template/templateInstantiation.test.ts`：三类跨 Project roundtrip，existing/create same-entity decisions，fresh unified ID maps，collision and malformed-binding rejection，no graph side effects，copy-on-create 和 input immutability；
- `src/features/bfn/module-library/template/templateSignature.test.ts`：ID-independent scientific projection equality，property-order/source-ID/instance-ID/presentation stability，以及 scientific-field sensitivity；
- 最终定向结果：4 个测试文件、84 项测试全部通过；`npm run typecheck` 与模板目录 ESLint 通过。

### Candidate validation boundary

- 最终完整 `npm test -- --maxWorkers=4` 为 162 个测试文件、1394 项测试全部通过。Windows 默认 checkout 的早期候选首轮为 161/162 文件、1380/1381 项，唯一失败是 `senderExtensionLoader.test.ts` 的冻结 source 换行字节清单；按既有 manifest 临时物化 12 个文件后最终全量通过，`finally` 已逐字节恢复且 Sender source diff 为零；
- `npm run typecheck` 与全项目 `npm run lint` 通过；Vite 7.3.6 production build 通过并转换 309 个模块，主 CSS 279.02 kB（gzip 46.50 kB），主 JavaScript chunk 3,378.07 kB（gzip 468.90 kB），保留既有大于 500 kB chunk 提示；
- 17 个 Template TypeScript 文件与 3 个文档文件通过 changed-file Prettier check 与 `git diff --check`；
- 本批不修改 BFN-IR 2.3、BFN-SIM 2.2、Workspace DB 1、冻结 scientific/runtime files、package dependencies、persistence、UI 或 i18n。

### Batch 12.5.0 Correction Pass

- Correction 从远端精确 pre-fix Head `42bafecf908f3ba11d50b840a0b35f495266d919` 在线性历史上追加；分支继续为 `codex/bfn-module-template-representation-contract`，不 rebase、merge、squash 或 reset；
- Entity regression 覆盖 two-slot convergence、canonical-slot convergence、re-signed duplicate canonical identity 与 instance projection relation collapse；distinct template Entity keys 必须映射到 distinct concrete Project Entity IDs；
- accumulator parser/capture regressions分别覆盖 dynamic model Evidence、dynamic uncertainty 与 module Evidence。Template 1.0 固定 model/module `independent_assumption` 和 model `none`，冻结 runtime contract 与 Signal Pool materializer 零差异；
- malformed runtime regression 覆盖 first-order steady-state response、tau、initial state、ValidityDomain ranges/time range、Dataset Entity arrays、selected module、dependency record 及 target Project；capture/instantiate 均 non-throwing、fail closed；
- duplicate-ID regression 覆盖 selected module、Context、ValidityDomain、Provenance 与 Implementation；零匹配返回 `dependency_missing`，多个匹配返回 `dependency_conflict`。targeting selected module 的 Calibration Map 返回 `calibration_map_unsupported`，unrelated map 不进入 closure；
- dangling-reference regression 同时占用将生成的 module、input/output Port、Context、ValidityDomain 与 Implementation IDs，引用来自 Edge、existing model、module、ValidityDomain 和 Calibration Map；实例化返回 `generated_id_collision`，输入 target deep-equal 且引用保持 unresolved；
- 最终 Template 定向结果为 4 个测试文件、112 项测试全部通过；相对首轮 84 项新增 28 项 correction assertions；
- 默认 checkout 首轮完整测试为 158/162 个文件、1418/1422 项通过；失败为 3 个既有 UI 测试的 5 秒资源竞争 timeout 和冻结 Sender source 换行字节清单。3 个 UI 文件按原断言单独复核为 42/42 项通过；按 manifest 临时物化 12 个 Sender 文件后，最终 `npm test -- --maxWorkers=4` 为 162/162 个文件、1422/1422 项通过，`finally` 后逐字节恢复且 Sender source diff 为零；
- `npm run typecheck` 与全项目 `npm run lint` 通过；Vite 7.3.6 production build 通过并转换 309 个模块，主 CSS 279.02 kB（gzip 46.50 kB），主 JavaScript chunk 3,378.07 kB（gzip 468.90 kB），保留既有大于 500 kB chunk 提示；
- correction 的 10 个 Template TypeScript 文件与 3 个文档文件进入 changed-file Prettier 和 diff gate；BFN-IR schema/migration、BFN-SIM runtime/equations、accumulator runtime、Signal Pool、Designed Sender、Sender/Receiver、Workspace、Compatibility、unit system、dependencies、UI 与 i18n 均不在 correction diff；
- 以上只声明 local validation。Batch 12.5.0 为 `CANDIDATE` correction implementation complete、not `FROZEN`；GitHub workflow/check/status context 由 push 后实际查询，不声明 CI 或 Master Review。

## 2026-09-03 Batch 12.5.1 Local Versioned Module Library Persistence

### Phase 0 Template identity regression

- duplicate slot `sourceEntityId` 与 canonical AHL/HSL ID encoded as slot 均由 re-signed parser fixture 拒绝；
- canonical-as-slot 加 `create_same_entity` 返回 `template_schema_invalid`，不能生成 ordinary Entity；
- two distinct slots、normal canonical roundtrip 与 shared noncanonical slot roundtrip 保持有效；
- Phase 0 纳入既有四个 Template 测试文件，定向门为 4 个文件 / 118 项测试通过。

### Repository contract tests

`src/features/bfn/module-library/moduleLibraryRepository.test.ts` 对 IndexedDB 和 localStorage 运行同一套 repository contract，并直接覆盖：

1. create template 与 revision 1；
2. metadata roundtrip；
3. strict frozen version roundtrip；
4. metadata 与 version deterministic ordering；
5. metadata-only rename 不创建 revision；
6. changed payload 创建 N+1；
7. identical latest signature no-op；
8. metadata edit、new revision 与 Project instantiation 后 historical bytes/science 不变；
9. metadata 与全部 versions cascade delete；
10. unknown metadata/version 的稳定 null/not-found 结果；
11. corrupt metadata fail closed；
12. corrupt schema/schemaVersion/template ID/version ID/revision/payload/signature/missing field fail closed；
13. returned metadata mutation 与 frozen version mutation不改变 persistence；
14. IndexedDB/localStorage observable result parity；
15. Workspace IndexedDB schema 与 localStorage namespace isolation；
16. 两个 repository instance 并发保存分配连续 revision 且不覆盖历史；
17. incompatible database、malformed envelope 与 orphan version 的 repository-state rejection。

定向结果：1 个文件 / 50 项测试通过。测试使用现有 `fake-indexeddb`，没有新增 package dependency。

### Validation results

- Template targeted：4 个文件 / 118 项测试通过；
- Module Library targeted：1 个文件 / 50 项测试通过；
- 默认 checkout 首次 full suite：162/163 个文件、1477/1478 项通过，唯一失败为既有 Sender immutable source 的 Windows CRLF/LF 物理字节清单；
- manifest-protected final `npm test -- --maxWorkers=4`：163/163 个文件、1478/1478 项通过；`finally` 后 12/12 Sender source 恢复 hash 与运行前一致，Sender source diff 为零；
- `npm run typecheck` 与 `npm run lint` 通过；
- Vite 7.3.6 `npm run build` 通过，转换 309 个模块；主 CSS 279.02 kB（gzip 46.50 kB），主 JavaScript chunk 3,378.07 kB（gzip 468.90 kB），保留既有 chunk-size warning；
- 14 个 changed files 通过 Prettier check，`git diff --check` 通过；
- frozen boundary audit：Workspace 与 package files 零差异，BFN-IR/SIM、accumulator、Compatibility/unit、Signal Pool、Designed Sender/Receiver、Temporal、Ontology、Inverse Design 零差异，production repository 无 Project linkage 引用。

本节记录 Batch 12.5.1 local validation，不声明 Batch 12.5.0 或 12.5.1 frozen，也不声明 Master Review PASS。

## 2026-09-03 Batch 12.5 Reusable Module Library User Workflow

### Targeted workflow and presentation tests

- `moduleLibraryWorkflow.test.ts`、`BfnModuleLibraryWorkspace.test.tsx` 与 `BfnPlatformModuleLibraryWorkflow.test.tsx` 为 3 个文件 / 65 项测试，覆盖支持性判断、保存策略、新建与显式追加版本、same-science no-op、metadata-only edit、确定性列表、历史版本只读、科学信息呈现、Entity 确认、独立项目副本、整体删除、损坏记录和普通用户文案边界；
- Template targeted regression 为 4 个文件 / 118 项测试通过；Module Library Repository contract regression 为 1 个文件 / 50 项测试通过；
- 新增工作流与 Catalog、generic static authoring、Designed Sender、Signal Pool、组件级 authoring 及中英文 key 的联合 BFN UI regression 为 12 个文件 / 114 项测试通过；
- presentation regression 确认普通用户可见内容不暴露 raw ID、raw JSON、存储实现或内部 contract 字段，同时显示 quantity、unit、model、parameters、applicability、evidence、uncertainty、version 和明确主操作。

### Full validation

- Windows 默认工作树首轮完整测试为 165/166 个文件、1542/1543 项通过，唯一失败是冻结 Sender source 的 CRLF/LF 物理字节与清单不一致；
- 按现有安全策略逐文件选择满足清单长度与 SHA-256 的 Git blob 或 Windows 工作树字节后，Sender loader 为 1 个文件 / 6 项通过，最终 `npm test -- --maxWorkers=4` 为 166/166 个文件、1543/1543 项通过；
- `finally` 恢复 12/12 Sender source 的运行前字节，逐文件 SHA-256 相同，Sender source diff 为零；
- `npm run typecheck` 与全项目 `npm run lint` 通过；
- Vite 7.3.6 `npm run build` 通过，转换 332 个模块；主 CSS 为 289.59 kB（gzip 47.91 kB），主 JavaScript chunk 为 3,508.06 kB（gzip 501.34 kB），保留既有大于 500 kB chunk 提示；
- 本批只声明 local validation。Batch 12.5 为 `CANDIDATE / implementation complete / awaiting Master Review / not FROZEN`，不声明 CI 或 Master Review PASS。
