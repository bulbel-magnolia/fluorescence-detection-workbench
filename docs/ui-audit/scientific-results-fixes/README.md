# Batch 4.1 Scientific Result Semantics & Integrity Audit

- 审计日期：2026-08-26
- 分支：`codex/bfn-scientific-results-fixes`
- 桌面视口：1440×900
- 界面语言：简体中文

## Visual audit

| 文件                                      | 验收内容                                                          | 结果 |
| ----------------------------------------- | ----------------------------------------------------------------- | ---- |
| `01-user-facing-axis-1440x900.png`        | 稳态图横轴显示 `3OC6-HSL 浓度 (nM)`，纵轴显示 `报告信号 (相对值)` | 通过 |
| `02-user-facing-tooltip-1440x900.png`     | Tooltip 显示用户语言输入、输出和单位，不显示内部 entity code      | 通过 |
| `03-full-model-hidden-1440x900.png`       | Full / 网络响应关闭后，ANN 与参数区间继续可见                     | 通过 |
| `04-log-narrow-domain-1440x900.png`       | 手动 Log10 范围 `[5, 10]` 保留 5、10 两个可读工程刻度             | 通过 |
| `05-visible-domain-keyboard-1440x900.png` | 手动范围 `[10, 15]` 下按 Home，光标落在可见求解点 `10.156 nM`     | 通过 |

`06-legacy-run-1440x900.png` 是条件审计项。本轮没有通过浏览器开发脚本写入 localStorage 或组件内部状态来伪造旧运行；当前产品界面也不提供运行记录导入入口，因此没有生成该截图。旧运行缺少快照时的 Unknown / 未记录语义回退由 repository、统一 resolver、chart model 和页面自动化测试验证。

## Export audit

实际使用结果工作台“导出”菜单生成以下文件：

| 文件                                    | 核验                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `exports/corrected-static-response.svg` | 包含 `报告信号`、`相对值`；不含 `normalized_reporter_expression`、`normalized_promoter_activity`、`dimensionless` |
| `exports/corrected-static-response.png` | 由同一 SVG 模型生成，尺寸 2280×900（3×）                                                                          |
| `exports/corrected-static-data.csv`     | UTF-8 CSV；保留 `input:source-ahl`、`module:module-ahl-sensor` 等稳定机器字段                                     |

CSV 的原始 ID 属于科研数据交换 schema，不是用户图表文案。屏幕图、Tooltip、图注、SVG/PNG 和运行溯源中的可读信号字段统一由运行结果的语义快照解析。

## Integrity checks

- 新运行保存稳定语义，不保存已翻译文本；切换语言时重新通过 presentation layer 翻译。
- 旧运行不从当前项目借用标签、entity、quantity type 或 unit。
- 两条带快照的运行只有在输入和输出语义完全一致时才允许直接比较；旧运行使用四项 ID 的 legacy compatibility，并明确提示语义不完整。
- 视图状态只影响图表显示，不修改项目、计算签名、Undo/Redo 或结果新鲜度。

最终验证：TypeScript 通过，ESLint 通过，76 个 Vitest 文件中的 477 项测试通过，Vite 生产构建转换 215 个模块并成功生成产物。
