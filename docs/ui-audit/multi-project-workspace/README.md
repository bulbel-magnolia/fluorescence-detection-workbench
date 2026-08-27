# Batch 6 / 6.0.1 多项目工作区视觉审计

审计对象为本地真实应用与真实 Workspace Repository 数据，不使用静态 mock 页面。主审计尺寸为 1440×900。

## 已保存截图

| 文件                                           | 真实界面状态                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `01-project-center-1440x900.png`               | 旧单项目迁移后的 Project Center、多个项目与 Current Draft 摘要  |
| `02-new-blank-project-1440x900.png`            | 真实空白项目：0 Input、0 Module、1 Output Monitor、无 DEMO 标记 |
| `03-project-switch-1440x900.png`               | 从空白项目切回迁移项目后的独立网络与项目身份                    |
| `04-rename-duplicate-1440x900.png`             | 复制项目后完成重命名，项目身份和独立草稿均保持可辨识            |
| `05-version-history-1440x900.png`              | 连续保存版本 1、版本 2；Current Draft 与版本摘要显示真实连接数  |
| `06-save-version-1440x900.png`                 | 版本 1 保存后无需重开即可进入版本 2 表单                        |
| `07-restore-confirmation-1440x900.png`         | 恢复版本前的破坏性操作确认与可恢复性说明                        |
| `08-run-relations-1440x900.png`                | 同一项目内的当前设计、较早设计和旧版运行记录                    |
| `09-import-entry-clean-workspace-1440x900.png` | 独立浏览器工作区中的空白导入目标与 BFN-IR 导入入口              |
| `10-dark-mode-1440x900.png`                    | 深色主题下的 Project Center 与 Version 区域                     |

重命名、复制、版本表单、版本历史、恢复确认和 Current / Earlier / Legacy Run 状态均在真实应用中逐项完成。当前 Chrome 扩展未启用本地文件 URL 访问，自动化无法把刚导出的 JSON 注入原生文件选择器，因此本目录不把“导入完成”伪装成截图。真实 `File` 导入为新项目、重复导入和非法文件隔离由 `BfnWorkspacePage.test.tsx` 覆盖。

Batch 6.0.1 复核还确认：Input Settings 的 `17.25 nM` 修改在关闭抽屉时提交；Project Center 打开后语义树中只有一个对话框；半填版本名称和备注在关闭、重开后均被清空。连续保存的版本号为 V1、V2，当前项目的下一修订号为 V3。

## 响应式测量

Project Center 打开、真实三个项目和两个保存版本状态下完成测量。

| 视口     | Drawer            | 页面水平溢出 | Drawer 水平溢出 | Version History 水平溢出 | 结论                          |
| -------- | ----------------- | ------------ | --------------- | ------------------------ | ----------------------------- |
| 1280×720 | 680×720 px，x=600 | 无           | 无              | 无                       | 抽屉和底部完整                |
| 1180×700 | 680×700 px，x=500 | 无           | 无              | 无                       | 双列 Project / Version 仍可用 |

Project List 与 Version History 各自使用内部纵向滚动。Delete、Save current version 和 Restore 均为可聚焦按钮。暗色主题下重新检查了项目列表、Current Draft、连接摘要、版本历史和操作对比度。
