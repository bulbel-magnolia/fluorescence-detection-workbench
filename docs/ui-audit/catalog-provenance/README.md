# Catalog Provenance Inspector visual audit

本目录记录 Batch 5.3 在真实建模工作台中的来源追溯视觉审计。所有 PNG 均为 1440×900 实际浏览器截图，并已校验为 PNG 编码。

| 文件                                      | 审计状态         | 核对重点                                                                                    |
| ----------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| 01-matched-provenance-1440x900.png        | 来源记录匹配     | 紧凑展示目录、响应元件、输入、实验条件、第一条来源、来源数量、详情按钮与非实验验证边界      |
| 02-provenance-detail-link-1440x900.png    | Inspector 深链接 | 不经过重新搜索，直接打开同一 response 的 Full Detail                                        |
| 03-unconnected-but-matched-1440x900.png   | 未连线且来源匹配 | Validation 的拓扑问题与 provenance 状态同时成立，二者没有混写                               |
| 04-source-mismatch-1440x900.png           | 来源不一致       | 错误语义清楚但克制，只提供“查看目录中的原始记录”                                            |
| 05-source-unavailable-1440x900.png        | 来源暂时不可核对 | warning 语义明确，不显示内部 error code，也不构造详情按钮                                   |
| 06-advanced-provenance-1440x900.png       | 高级来源信息     | 目录、response、component、context 与 source IDs 默认折叠，展开后长值可读                   |
| 07-generic-module-regression-1440x900.png | 普通 BFN Module  | 不出现无意义的文献来源区，原“实验条件与数据”入口保留                                        |
| 08-dark-mode-1440x900.png                 | 深色主题         | matched 使用 evidence accent，不使用绿色 validated badge；正文、Divider、按钮与长值保持可读 |

## 状态生成说明

Matched、深链接、未连线、advanced、generic 与 dark-mode 均由真实项目交互产生。Mismatch 与 unavailable 的视觉状态通过审计期间的临时、未提交开发态入口驱动同一正式 Inspector 分支；入口在截图后立即移除。真实 EC50/source/port/domain tamper、未知 release 和 malformed reference 的状态判定由 resolver 与 component fixtures 覆盖。

## 1280×720

在 1280×720 深色桌面视口复核：

- 来源 section 可通过 Inspector 内部滚动访问；
- “查看文献详情”按钮完整可用；
- 点击按钮直接进入目标 response Full Detail，返回目录与关闭均正常；
- documentScrollWidth = 1280、bodyScrollWidth = 1280、innerWidth = 1280，页面级水平溢出为 0；
- 关闭 Drawer 后“展开分析结果”按钮仍存在，Result Dock 未重新布局；
- 审计结束后视口恢复为 1440×900，主题恢复为进入审计前的深色设置。

浏览器日志中没有 error。视觉审计没有修改项目、创建 Undo/Redo 历史、触发自动运行或改变结果新鲜度。
