# Batch 5.1 Catalog Discovery & Search Visual Audit

- 审计日期：2026-08-26
- 分支：`codex/bfn-catalog-discovery`
- 主审计视口：1440×900
- 紧凑审计视口：1280×720
- 界面语言：简体中文

## Visual audit

| 文件 | 验收状态 | 结果 |
| --- | --- | --- |
| `01-default-catalog-1440x900.png` | 默认目录，42 个 Component 全部折叠 | 通过 |
| `02-search-3oc6-1440x900.png` | 搜索 `3OC6`，只保留相关 Component 与 Response | 通过 |
| `03-runnable-filter-1440x900.png` | 可运行筛选，7 个 Component 中共 20 条真实 runnable Response | 通过 |
| `04-response-preview-1440x900.png` | Receiver 展开、选中态、状态、宿主、模型与来源轻量预览 | 通过 |
| `05-sender-preview-1440x900.png` | Sender 发现与“暂无定量发送函数”边界，不出现 runnable 语义 | 通过 |
| `06-dark-mode-1440x900.png` | 深色主题下的待标定状态、选中行、展开组与 Preview | 通过 |
| `07-built-in-modules-1440x900.png` | 文献目录与 3 个内置通用 Demo 模块保持独立层级 | 通过 |

逐图检查未发现文字重叠、关键状态截断、内部 ID 泄露、卡片堆叠、渐变或发光效果。Component、Response 与 Preview 保持 disclosure → compact row → inline detail 层级。搜索框在 Chromium 中隐藏原生 cancel control，只保留一个带可访问名称的清除按钮。

## 1280×720 measurement

- `document.documentElement.clientWidth = 1280 px`
- `document.documentElement.scrollWidth = 1280 px`
- `document.documentElement.clientHeight = 720 px`
- `document.documentElement.scrollHeight = 720 px`
- Drawer：`560 × 720 px`，`x = 720 px`，右边界 `1280 px`
- 关闭按钮：`32 × 32 px`，右边界 `1266 px`
- 搜索区：`521 × 32 px`
- 三项筛选区：`521 × 64 px`
- Preview：`521 × 128 px`
- Drawer body：可视高度 `619 px`，内容高度 `1907 px`，由 Drawer 内部滚动承载

打开与关闭 Drawer 前后，工作台 surface、network workspace 和 stage 的 `x / y / width / height` 数值完全一致。页面级水平溢出为 0，关闭按钮、搜索、三项筛选、结果行和 Preview 均位于 Drawer 可访问区域；深色空结果状态也完成实际交互复核。

## Scientific boundary

文献目录在本批次只有浏览、搜索、筛选与预览能力。截图中的 AHL/HSL Response 没有 Add to Network 操作；真正实例化保留给 Batch 5.2。内置通用 Demo 模块继续沿用原项目编辑流程。
