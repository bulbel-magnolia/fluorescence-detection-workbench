# 开发与打包

## 环境

前端开发：

- Windows 10/11 x64
- Node.js >= 22
- npm >= 10

Tauri 原生开发另需：

- Rust stable（MSVC 工具链）
- Visual Studio 2022 Build Tools
- Desktop development with C++
- Windows 10/11 SDK
- Microsoft Edge WebView2 Runtime

## 安装

```powershell
npm ci
```

不要提交 `.env`、安装包、`src-tauri/target`、PDB 或本机凭据。

## 常用命令

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run format
npm run format:check
npm run build
npm run tauri dev
npm run tauri build
```

Vite 固定监听 `127.0.0.1:1420`，与 `tauri.conf.json` 的 `devUrl` 一致。

## 目录

```text
src/
  app/              应用入口与工作台壳
  components/       共享 UI 与图表
  domain/           严格领域类型
  features/
    analysis/       纯分析与输入校验
    cloud/          Supabase、同步状态和安全存储
    detection/      检测状态机
    export/         JSON / CSV 导出
    import/         JSON / CSV 导入
    persistence/    SQLite 历史仓库
    transport/      BLE 抽象与 Demo 实现
  i18n/             中英文资源
  pages/            功能页面
  store/            Zustand 应用状态
  theme/            设计令牌和全局样式
src-tauri/
  capabilities/     Tauri 权限
  migrations/       SQLite 迁移
  src/              Rust 命令和插件装配
supabase/
  migrations/       云端表、函数和 RLS
  functions/        同步与成员邀请 Edge Functions
```

## 原生构建

```powershell
npm run tauri build
```

目标包含 NSIS 和 MSI，安装模式为当前用户。首次构建需要下载 Rust crates，离线环境必须提前准备完整 Cargo 缓存。

如果 `cargo check` 报告缺少 `sqlx-core`，说明 Tauri SQL 的依赖尚未下载；恢复 crates.io 网络后重新执行，不要删除 SQLite 插件或跳过持久化检查。

## 维护真实 BLE

1. 在 `features/protocol` 更新版本化文本协议，不在页面中分散协议常量。
2. 在 `features/transport` 维护 TypeScript 传输抽象，在 `src-tauri/src/hc08d` 维护 Windows GATT 实现。
3. UUID 选择继续遵循 FFE0/FFE1 优先、自适应能力发现和歧义拒绝。
4. 协议、分片、命令应答、重连和 `RAW_ONLY` 持久化变更必须附带测试。
5. 保留 `MockBleTransport` 作为开发、展示与回归路径。
6. 在 Windows 10 与 Windows 11 上复测蓝牙关闭、重复连接、电源循环、长时采集和安装包。
7. 在协议文档中记录每个原生、固件或配置变更。

## 新增分析算法

新算法应提供：

- 明确版本号
- 参数来源
- 输入输出样例
- 与参考实现的一致性测试
- 适用范围
- Demo/验证状态

不要把临时标定系数或竞赛展示阈值标记为最终算法。
