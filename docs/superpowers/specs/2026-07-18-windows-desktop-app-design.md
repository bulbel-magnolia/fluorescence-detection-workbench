# Windows 荧光检测工作台设计规格

状态：设计已于 2026-07-18 通过用户确认；界面结构与文案规则于 2026-07-24 完成复核。

## 1. 产品目标

Windows 端软件面向 BIT-CHINA 荧光检测与质量分析项目，承担两类任务：

1. 作为 Windows BLE Central/GATT Client 直接连接荧光检测硬件，完成设备发现、连接、三通道采集、实时曲线、结果生成和本地保存。
2. 导入 JSON 或 CSV 数据，经过同一套校验、分析、版本记录和历史存储流程生成结果。

软件支持 Windows 10 和 Windows 11 x64。检测和分析采用离线优先设计，账号、团队共享和云端同步不阻断本地工作流。

当前硬件 UUID、帧格式、标定参数、浓度公式和质量阈值尚未形成正式输入。首版以明确标记的 Demo 适配器和现有算法 v0.1 固定样例完成软件闭环。真实 BLE 模式只在项目提供版本化协议配置后启用。

## 2. 已确认的产品决策

| 项目       | 决策                                                                     |
| ---------- | ------------------------------------------------------------------------ |
| 运行平台   | Windows 10/11 x64                                                        |
| 应用技术   | Tauri 2、React、TypeScript、Rust                                         |
| 状态与界面 | Zustand、显式状态机、i18next、React 组件                                 |
| 硬件链路   | BLE 首发；定义串口适配接口和 Mock，不在首版接入真实串口硬件              |
| 文件导入   | JSON、CSV                                                                |
| 本地存储   | SQLite                                                                   |
| 账号与云端 | Supabase Auth、Postgres、Row Level Security、Edge Functions              |
| 协作模型   | 团队工作区；管理员与成员两种角色                                         |
| 语言       | 简体中文、英文；默认简体中文                                             |
| 分析基线   | 将 Python v0.1 参考算法移植为纯 TypeScript，并使用相同 fixtures 验证输出 |
| 发布形式   | Windows x64 安装包；开发阶段优先 NSIS setup，发布候选阶段同时验证 MSI    |

Tauri 内部开发标识使用 `FluorescenceDesktop`，界面开发名称使用“荧光检测工作台 / Fluorescence Workbench”。这些标识只服务开发与测试，不代表最终产品命名。

## 3. 设计原则

- 本地检测结果先写入 SQLite，再进入云同步队列。
- UI 不直接访问 Windows BLE、文件系统、SQLite 或凭据存储。
- 设备传输、协议解析、分析、持久化和云同步通过明确接口隔离。
- BLE 写入成功、命令被设备接受、命令执行完成分别建模。
- 真实数据与 Demo 数据在类型、界面、存储和云端记录中持续区分。
- 原始曲线和分析结果采用追加版本，已同步记录不原地覆盖。
- 账号令牌保存到 Windows 凭据库，数据库不保存明文密码或刷新令牌。
- Supabase `service_role` 密钥只存在于托管 Edge Function 环境，不进入桌面客户端。

## 4. 视觉与桌面布局

视觉语言延续移动端：浅色背景、深海军蓝主色、青色操作强调、洋红色荧光曲线、琥珀色警告、有限阴影、中等圆角和高对比文本。关键状态同时使用文字、图标和颜色。

主窗口采用“仪器工作台”布局：

- 左侧固定任务导航：概览、采集、分析、记录、设置。团队工作区从设置进入，不占用主任务导航。
- 顶部全局状态条：当前设备、连接状态、电量、Demo/真实标记、账号、工作区和同步状态。
- 中央主工作区：实时曲线、导入预览、历史列表或团队管理内容。
- 右侧上下文面板：当前通道指标、检测控制、字段校验、记录属性或成员权限。
- 长时间采集时隐藏非必要导航动作，保留停止、连接状态和错误恢复入口。

窗口最低支持 1280×720；推荐工作尺寸为 1440×900。界面适配 100%–200% Windows 缩放，不依赖仅颜色可识别的状态表达。

## 5. 页面与用户任务

### 5.1 概览

展示设备连接、最近记录、待同步数量、应用/协议/算法版本和三个快捷入口：连接设备、导入文件、运行 Demo。未登录时保留全部本机功能。

### 5.2 实时检测

包含设备抽屉、扫描和连接、样本编号、调零、校准、开始、停止、三通道选择、三通道曲线、实时指标、设备状态和结果入口。

检测状态使用单一状态机：

```text
idle → scanning → connecting → connected → preparing → ready
ready → zeroing → ready
ready → calibrating → ready
ready → running → stopping → finished
running/stopping → incomplete
任意有效连接状态 → disconnected/error
```

所有无效转换在应用层拒绝。重复点击、迟到回调和旧连接事件通过操作 ID、会话 ID 与连接代次隔离。

### 5.3 导入分析

支持拖放或文件选择：

- JSON 直接按照版本化输入 schema 校验。
- CSV 提供编码识别、表头预览和字段映射。
- 必需字段包括通道、序号、时间或相对时间、原始信号、背景值和单位。
- 错误信息定位到文件、行号和列名。
- 校验完成前不写入正式历史。
- 校验后的输入转换为与 BLE 会话相同的领域模型，再进入同一分析接口。

### 5.4 历史记录

历史列表支持样本编号、日期、来源、成员、Demo 状态、同步状态和结果状态筛选。详情显示三通道曲线、统计摘要、分析结果、警告和版本信息。导出支持 JSON 完整记录和 CSV 通道数据。

### 5.5 团队空间

团队工作区从设置进入。邮箱和密码用于登录。管理员可邀请成员、移除成员、变更角色和删除共享记录；成员可创建、查看和导出工作区记录。邀请与成员管理通过鉴权 Edge Function 执行。

### 5.6 设置

包含语言、采集设备状态、团队工作区入口、应用版本、协议版本、算法版本、标定版本和数据保存说明。尚不可用的真实设备显示明确状态，不使用看似可操作的假开关。

## 6. 系统架构

```text
React Screens / Components / i18n
               ↓
Zustand Stores + State Machines + Use Cases
               ↓
TypeScript Contracts
               ↓ Tauri commands/events
Rust Device / Protocol / Persistence / Credential Services
        ↙              ↓                 ↘
BLE Hardware       SQLite Database      Supabase Cloud
```

### 6.1 Presentation Layer

页面只消费类型化状态和用例动作。共享组件包括操作按钮、状态标签、指标卡、通道选择器、荧光曲线、错误条、空状态、数据表格和确认对话框。

### 6.2 Application State Layer

Zustand stores 分别管理：

- `deviceStore`：设备发现、连接代次、当前设备和传输错误。
- `detectionStore`：检测状态机、会话、三通道样本和结果。
- `importStore`：文件选择、字段映射、校验和导入进度。
- `historyStore`：本地查询、筛选、详情和导出。
- `authStore`：登录会话、当前用户和凭据状态。
- `workspaceStore`：当前团队、角色和成员。
- `syncStore`：队列、网络状态、重试和冲突提示。
- `settingsStore`：语言、Demo 模式和本地偏好。

高频样本只由实时检测组件按通道订阅。列表和全局框架不随每个采样点重绘。

### 6.3 Contracts

核心接口包括：

- `DeviceTransport`：扫描、连接、断开、命令发送、数据订阅、连接订阅和资源释放。
- `ProtocolCodec`：字节缓存、分包重组、消息校验、解码和命令编码。
- `AnalysisEngine`：单点处理和会话汇总。
- `ImportParser`：JSON/CSV 解析、映射和校验。
- `HistoryRepository`：事务保存、查询、删除标记、导出和迁移。
- `CredentialVault`：读取、写入和清除登录令牌。
- `CloudGateway`：认证、工作区、成员和记录同步。

### 6.4 Tauri/Rust Layer

Rust 负责所有特权能力：

- 通过 Windows BLE API 实现 `BleTransport`。
- 提供 `SerialTransport` 接口、Mock 和不支持提示。
- 完成协议字节缓存、分片重组、序号检查和错误映射。
- 安全读取 JSON/CSV，限制文件尺寸并规范化编码。
- 管理 SQLite 连接、迁移和事务。
- 使用 Windows Credential Manager 保存 Supabase 会话令牌。
- 向 React 层发送类型化 Tauri events，不传递任意文件路径或未校验字节。

## 7. 领域模型

领域类型沿用移动端的三通道语义，并增加桌面来源和同步状态：

- `ChannelId`: `channel1 | channel2 | channel3`
- `RecordSource`: `ble | json | csv | demo`
- `DetectionState`: 检测状态机联合类型
- `DevicePacket`: `ack | sample | status | result | error`
- `DetectionSession`: 会话、设备、来源、样本和完成状态
- `AnalysisResult`: 三通道结果、质量状态、警告和版本信息
- `SyncState`: `localOnly | pending | retrying | synced | syncError | pendingDelete`
- `WorkspaceRole`: `admin | member`
- `AppError`: 稳定错误码、翻译键、层级、可恢复性和技术信息

所有云端和本地记录使用客户端生成的 UUID。记录包含 `schemaVersion`、`protocolVersion`、`algorithmVersion`、`calibrationVersion`、`appVersion` 和 `isDemo`。

## 8. 分析实现

首版将 `张森威-数据解析与算法-v0.1/reference_analysis.py` 的输入、输出和演示计算规则移植为纯 TypeScript：

- 输入 schema 与现有 fixtures 保持兼容。
- 背景校正使用 `max(0, rawSignal - background)`。
- 汇总、演示标定、范围检查、质量状态和警告保持等价。
- Python 的 `normal`、`invalid_empty` 和 `out_of_range` fixtures 作为跨语言契约测试。
- 输出继续标记 Demo，不把演示参数描述为实验结果。

`AnalysisEngine` 保持可替换。正式算法进入项目时以新算法版本和新适配器接入，不覆盖旧记录使用的算法语义。

## 9. 本地数据模型

SQLite 启用外键、事务和 WAL。首版表结构包括：

- `app_metadata`：schema 和迁移版本。
- `detection_records`：会话、样本、来源、结果、版本、Demo 状态和同步状态。
- `channel_samples`：记录、通道、序号、时间、原始值、背景值和校正值。
- `record_revisions`：追加式修订关系和修订原因。
- `sync_queue`：动作、记录 ID、尝试次数、下次尝试时间和最后错误。
- `workspace_cache`：当前工作区与成员的非敏感缓存。

一次检测或导入在一个事务中写入记录和全部通道样本。事务失败时不产生半条历史记录。删除默认写入本地删除标记；已同步共享记录由管理员权限确认后进入 `pendingDelete`。

## 10. 云端模型与权限

Supabase Postgres 包含：

- `profiles`
- `workspaces`
- `workspace_members`
- `workspace_invites`
- `detection_records`

云端 `detection_records` 保存可筛选元数据和版本化 JSONB 完整载荷。记录按 `workspace_id` 隔离。RLS 规则保证：

- 未登录用户不能访问团队数据。
- 成员只能访问自己所属工作区。
- 成员可创建和读取记录。
- 管理员可管理成员和删除共享记录。
- 客户端不能自行提升角色。

成员邀请、角色变更和移除通过 Edge Function 执行。函数验证调用者 JWT 与管理员成员关系后再使用服务端权限。

## 11. 离线与同步

检测和导入首先完成本地事务，再将记录加入同步队列。同步状态流转为：

```text
localOnly → pending → synced
pending → retrying → synced
pending/retrying → syncError → pending
synced → pendingDelete → deleted
```

同步使用记录 UUID 和修订版本作为幂等键。网络断开、限流和临时服务错误使用带上限的指数退避；权限错误和无效载荷停止自动重试并显示用户动作。

首次登录后，应用明确询问是否把既有本地记录上传到当前团队。未选择上传的记录保持 `localOnly`。检测过程中不执行大批量同步，避免干扰设备数据处理。

## 12. 错误处理

错误按层级分类：

- 设备：蓝牙不可用、扫描失败、连接超时、连接丢失、服务或特征缺失、通知失败、写入失败、ACK 超时。
- 协议：版本不支持、帧畸形、分片过期、校验失败、序号间断、未知消息。
- 导入：文件过大、编码不支持、JSON schema 错误、CSV 字段缺失、行值非法、单位不一致。
- 分析：输入无效、算法版本不支持、标定范围外和结果构造失败。
- 本地存储：迁移失败、事务失败、磁盘空间不足和数据库损坏。
- 云端：未登录、会话过期、权限拒绝、限流、网络不可用和服务错误。

运行中断且已有有效样本时，应用保存 `incomplete` 会话并生成适用范围明确的结果。连续无效包达到阈值后发送安全停止命令并进入错误状态。普通错误提示说明对象、影响和恢复方式；错误代码与原始诊断信息放在可展开的技术详情中。

## 13. 安全与隐私

- 客户端只包含 Supabase URL 和 anon key。
- service-role key、数据库管理口令和邮件服务密钥只存在于托管环境。
- 刷新令牌进入 Windows Credential Manager。
- 日志不记录密码、令牌、完整私有数据集和原始凭据。
- 详细 BLE payload 日志只在显式开发开关下启用。
- 首次上传本地记录前要求用户确认目标团队。
- 导出文件由用户明确选择路径，不自动上传。

## 14. 国际化与可访问性

所有可见文本使用语义化翻译键，同时维护 `zh-CN` 与 `en-US`。界面统一使用“采集”表示从设备取得信号、“分析”表示处理数据、“记录”表示保存后的任务结果。Demo 结果不在普通页面显示质量等级、评分或换算浓度。日期、时间和数值按当前语言格式化，原始协议值保持不变。

键盘可以完成全部主任务。焦点顺序、快捷键、对话框焦点锁定、屏幕阅读器标签、200% 缩放、高对比文本和减少动画设置纳入组件验收。

## 15. 测试策略

### TypeScript

- 检测状态机和非法转换。
- 三通道样本校验和分析 fixtures 等价性。
- JSON/CSV 解析、字段映射和错误定位。
- stores 的异步代次隔离和同步状态归约。
- 页面、曲线、通道切换、历史、团队和设置组件。

### Rust

- Mock BLE 扫描、连接、命令、样本、断连、低电量、传感器错误和超时。
- 协议 buffer、分包重组、序号与错误映射。
- SQLite migration、事务回滚、查询和同步队列。
- 文件尺寸、编码和路径边界。
- 凭据库接口和 Tauri command 输入校验。

### 集成

- Demo BLE → 三通道采集 → 分析 → SQLite → 历史。
- JSON/CSV → 校验 → 分析 → SQLite → 导出。
- 本地记录 → 断网队列 → 网络恢复 → Supabase 同步。
- 管理员邀请成员、成员读取记录和跨工作区拒绝。
- 应用重启、睡眠唤醒、重复连接和长时间采集。

### 手工平台矩阵

- Windows 10 x64 和 Windows 11 x64。
- 100%、150%、200% 显示缩放。
- 蓝牙关闭、权限拒绝、设备离开范围和弱连接。
- 在线、离线、登录过期和云端不可用。
- NSIS/MSI 安装、升级、卸载和本地数据保留。

## 16. 验证命令

项目实施后提供并运行以下脚本：

```powershell
npm ci
npm run typecheck
npm run lint
npm test
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
npm run tauri build
```

Supabase schema 同时提供 migration、RLS policy 测试和 Edge Function 鉴权测试。无法执行的云端或真实硬件检查必须记录具体命令、错误、环境原因和待验证范围。

## 17. 首版交付顺序

1. Tauri/React 工程、桌面视觉系统、导航、国际化和测试基线。
2. 领域类型、状态机、contracts、Mock BLE 和三通道实时工作台。
3. Python v0.1 算法等价移植、结果和 SQLite 历史。
4. JSON/CSV 导入、校验、预览和导出。
5. Supabase schema、邮箱登录、团队角色、RLS 和离线同步队列。
6. 在硬件协议配置到位后接入 Windows BLE、协议解析和实机矩阵。
7. Windows x64 安装包、开发文档、测试报告和交付说明。

## 18. 首版不包含

- 未经确认的真实 UUID、帧字段、标定系数或质量阈值。
- 原始荧光图像通过 BLE 连续传输。
- USB/串口真实设备接入。
- 自动软件更新和静默安装。
- 多团队计费、公开注册、社交登录和复杂组织层级。
- 取代 HPLC、药典检测、实验室质量检验或监管检测的声明。

## 19. 验收标准

- Windows 10/11 x64 可安装并启动。
- Demo 模式完成扫描、连接、三通道采集、停止、结果、历史和导出闭环。
- JSON 与 CSV 样例通过同一分析管线生成可追踪结果。
- 断网不阻断检测，网络恢复后队列可幂等同步。
- 管理员和成员权限通过 RLS 与 Edge Function 测试。
- 所有 Demo 参数和输出在界面、存储和云端持续标记。
- TypeScript、Rust、组件、集成和构建检查通过。
- 仓库不包含密钥、令牌、签名口令、私有实验数据或构建产物。
