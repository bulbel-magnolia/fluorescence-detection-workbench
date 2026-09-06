# Fluorescence Detection Workbench

荧光检测工作台是 BIT-CHINA 面向荧光检测设备连接、数据采集、信号分析、检测记录和结果导出的独立 Windows/Tauri 科研原型。

## Scope

The application includes device and HC-08D connectivity, fluorescence acquisition, file import, fluorescence signal analysis, local detection history, export, settings, and the cloud/database capabilities used by those workflows.

Biological functional network modeling is maintained as the independent private repository `bulbel-magnolia/bfn-modeling-workbench`. This application contains no runnable BFN workspace and has no runtime or build dependency on that repository.

Batch 14.0.0 application separation remains a candidate pending Master Review.

## Development

Requirements:

- Node.js 22 or later
- npm 10 or later
- Rust and the Tauri 2 Windows prerequisites

```bash
npm ci
npm run dev
```

Validation:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

The application retains its existing Tauri identity: `FluorescenceDesktop` / `org.bitchina.fluorescencedesktop`.
