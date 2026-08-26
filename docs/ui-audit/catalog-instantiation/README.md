# Batch 5.2 Catalog Detail & Network Instantiation 视觉审计

审计日期：2026-08-26

审计对象：本地 Vite 桌面页面，冻结 AHL/HSL V1.1 Catalog，中文界面。01–09 使用浅色主题，10 使用深色主题。所有截图均为真实 1440×900 浏览器视口，不使用静态 mock 页面。

## 截图

| 文件                                                                                       | 审计状态                                                                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [01-runnable-detail-1440x900.png](01-runnable-detail-1440x900.png)                         | Runnable Response 首屏：Component、Signal、状态、Context、来源、Add 决策与 runtime model |
| [02-raw-vs-runtime-1440x900.png](02-raw-vs-runtime-1440x900.png)                           | 当前 0–1 runtime model 与文献 Basal / Maximum / EC50 分区                                |
| [03-experiment-context-1440x900.png](03-experiment-context-1440x900.png)                   | 完整实验条件、Property Row 与“未记录”的技术重复                                          |
| [04-non-runnable-detail-1440x900.png](04-non-runnable-detail-1440x900.png)                 | 待标定 Response；保留来源参数，无 runtime model 与 Add 操作                              |
| [05-sender-detail-1440x900.png](05-sender-detail-1440x900.png)                             | Sender Component、来源与“暂无定量发送函数”；无 Add 操作                                  |
| [06-add-no-existing-source-1440x900.png](06-add-no-existing-source-1440x900.png)           | 0 个兼容来源，默认推荐 Module + Source                                                   |
| [07-add-existing-source-1440x900.png](07-add-existing-source-1440x900.png)                 | 已有 1 个兼容来源，默认推荐 Module only                                                  |
| [08-added-catalog-module-1440x900.png](08-added-catalog-module-1440x900.png)               | 同一 Response 的第二个独立 Module instance 与真实 Component 名                           |
| [09-added-source-module-no-edge-1440x900.png](09-added-source-module-no-edge-1440x900.png) | Source-left / Module-right 成对放置；模块数增加，Edge 仍保持 3 条                        |
| [10-dark-mode-1440x900.png](10-dark-mode-1440x900.png)                                     | 深色 Detail、状态、Property Rows、来源提示、radio 推荐态与 Add Panel                     |

## 1280×720 实测

- viewport：1280×720；
- document：`clientWidth = 1280`，`scrollWidth = 1280`，`clientHeight = 720`，`scrollHeight = 720`；
- body：`clientWidth = 1280`，`scrollWidth = 1280`；
- Drawer：560×720，位置完整落在视口内；
- Drawer body：619 px 高，使用自身纵向滚动；页面级水平溢出为 0；
- Detail Back 位于首屏；Add Panel 位于 Drawer 内；
- Add 按钮初始位置只超出可视 body 约 1 px，向下滚动 90 px 后完整位于 `top 599 / bottom 631`，可直接操作；
- 滚动到详情末端时 `scrollTop = 2891.33`、最大值为 2892；最后的高级信息区底边为 672，Drawer body 底边为 686，保留约 14 px 间距，没有被 footer 遮挡。

## 交互与语义结论

- Runnable、待标定与 Sender 均通过 Preview → Full Detail 进入同一 Drawer，Back 返回保留原筛选状态；
- 待标定与 Sender 的 Add 按钮数、runtime section 数均为 0；
- 0 source 默认 Module + Source；已有 source 默认 Module only，用户仍可覆盖选择；
- Module + Source 后界面显示 `3OC6-HSL（L）` 与 `RhlR / pRhl` 两个节点，Edge 数保持不变；
- 第二次添加同一 Response 生成第二个独立 Module，节点名和端口 Signal 身份在 Canvas、Network Index、Inspector 与 Exact Connection 一致；
- 浅色与深色主题的边框、状态、选中项、提示文字和 Add CTA 均保持清晰；
- 审计期间浏览器控制台 warning/error 数为 0。
