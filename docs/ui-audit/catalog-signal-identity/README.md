# Batch 5.1.1 Catalog Signal Identity visual audit

本目录记录 2026-08-26 在真实 Windows 建模工作台、冻结 AHL/HSL V1.1 Catalog 数据和本地开发构建上完成的视觉核查。截图未注入伪造 DOM 或替代 Catalog 数据。

## 1440 × 900 screenshots

1. `01-signal-identity-list-1440x900.png`：浅色主题下展开 Kylilis Lux 与 Scott Lux，核查共享常用缩写的 L、DL 与立体构型未说明条目可以逐行区分。
2. `02-signal-identity-preview-1440x900.png`：选择 Scott Lux 的真实 3OC6 立体构型未说明响应，核查预览中的输入函数身份完整且不暴露内部 ID。
3. `03-signal-filter-1440x900.png`：核查输入 Signal 筛选器同时提供 `3OC6-HSL（L）` 与 `3OC6-HSL（立体构型未说明）`，并按原始 Signal ID 正确筛选。
4. `04-built-in-placement-1440x900.png`：核查内置示例模块披露区位于 release、搜索与结果之前，默认折叠，Catalog 结果仍完整加载。
5. `05-dark-mode-1440x900.png`：核查深色主题下身份限定、选中态、预览与 usage status 的对比度；usage status 的计算字号为 10 px。

## 1280 × 720 measurements

- document：`clientWidth = 1280 px`，`scrollWidth = 1280 px`，无页面级水平溢出；
- Drawer：`560 × 720 px`，左边界 `x = 720 px`，右边界 `x = 1280 px`；
- 关闭按钮：`32 × 32 px`，右边界 `x = 1266 px`，完整可见；
- 内置示例模块：顶部 `y = 67 px`、高度 `44 px`；release summary：顶部 `y = 115 px`、高度 `38 px`；搜索框：顶部 `y = 163 px`、高度 `32 px`；筛选区：顶部 `y = 195 px`、高度 `64 px`；结果摘要：顶部 `y = 259 px`、高度 `31 px`；
- Drawer body：`clientHeight = 619 px`，`scrollHeight = 2315 px`，通过内部滚动访问全部目录；
- 真实 3OC6 立体构型未说明 Response preview：顶部 `y = 388 px`、底部 `y = 517 px`、宽度 `531 px`，身份文本完整可见。
