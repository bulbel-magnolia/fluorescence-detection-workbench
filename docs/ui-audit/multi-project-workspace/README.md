# Batch 6 多项目工作区视觉审计

审计对象为本地真实应用与真实 Workspace Repository 数据，不使用静态 mock 页面。主审计尺寸为 1440×900。

## 已保存截图

| 文件                                           | 真实界面状态                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `01-project-center-1440x900.png`               | 旧单项目迁移后的 Project Center、多个项目与 Current Draft 摘要  |
| `02-new-blank-project-1440x900.png`            | 真实空白项目：0 Input、0 Module、1 Output Monitor、无 DEMO 标记 |
| `03-project-switch-1440x900.png`               | 从空白项目切回迁移项目后的独立网络与项目身份                    |
| `09-import-entry-clean-workspace-1440x900.png` | 独立浏览器工作区中的空白导入目标与 BFN-IR 导入入口              |
| `10-dark-mode-1440x900.png`                    | 深色主题下的 Project Center 与 Version 区域                     |

重命名、复制、版本表单、版本历史、恢复确认和 Current / Earlier / Legacy Run 状态均在真实应用中逐项完成。当前 Chrome 扩展未启用本地文件 URL 访问，自动化无法把刚导出的 JSON 注入原生文件选择器，因此本目录不把“导入完成”伪装成截图。真实 `File` 导入为新项目、重复导入和非法文件隔离由 `BfnWorkspacePage.test.tsx` 覆盖。

## 响应式测量

Project Center 打开、深色主题、真实三个项目和一个保存版本状态下完成测量。

| 视口     | document client / scroll | body client / scroll | Drawer            | Drawer body client / scroll | 结论                                          |
| -------- | ------------------------ | -------------------- | ----------------- | --------------------------- | --------------------------------------------- |
| 1280×720 | 1280 / 1280 px           | 1280 / 1280 px       | 680×720 px，x=600 | 679 / 679 px，653 / 653 px  | 页面无水平溢出；抽屉和底部完整                |
| 1180×700 | 1180 / 1180 px           | 1180 / 1180 px       | 680×700 px，x=500 | 679 / 679 px，633 / 633 px  | 页面无水平溢出；双列 Project / Version 仍可用 |

Project List 与 Version History 各自使用内部纵向滚动。Delete、Save current version 和 Restore 均为可聚焦按钮。视觉审计期间应用控制台没有 warning 或 error。
