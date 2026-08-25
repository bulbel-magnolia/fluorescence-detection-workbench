# BFN 固定科研工作台视觉验收

验收日期：2026-08-25。截图均来自本地 Vite 运行时中的 Windows BFN-IR 演示项目；其中模型、参数、结果和候选继续属于 Demo/未验证数据。

## 视口与滚动边界

- 1440×900：工作台三栏、紧凑项目工具栏和收起结果 Dock 同屏；页面高度与视口一致。
- 1280×720：页面与 `.page-viewport` 的 `clientHeight`、`scrollHeight` 均为 720 px，没有全页面纵向或横向溢出。
- 1280×720 默认态：画布为 664×336 px，内部内容为 980×520 px，由画布自己滚动；属性栏为 254×369 px，内容由属性栏自己滚动。
- 1280×720 结果态：结果 Dock 高 301 px；页面仍保持 720 px，不随结果内容向下增长。
- 深色模式复核了选中、连接、警告、属性折叠和结果 Dock 的对比度。

## 截图

| 文件                                            | 验收重点                             |
| ----------------------------------------------- | ------------------------------------ |
| `01-workbench-default-1440x900.png`             | 无冗余 TopBar、固定三栏、结果收起    |
| `02-inspector-default-1440x900.png`             | 模块首层信息与关键参数               |
| `03-inspector-expanded-1440x900.png`            | 实验条件、公式、符号与 95% 区间      |
| `04-results-expanded-1440x900.png`              | 底部结果 Dock 与仍可见画布           |
| `05-selection-compatibility-stale-1440x900.png` | 选中、兼容目标与过期结果三类颜色语义 |
| `06-inverse-design-1440x900.png`                | 按目标设计的紧凑层级与候选排版       |
| `07-navigation-overview-1440x900.png`           | 独立概览项及检测、建模、系统分组     |
| `08-workbench-default-1280x720.png`             | 小视口三栏、Undo/Redo、运行入口      |
| `09-workbench-dark-1440x900.png`                | 深色模式工作台                       |
| `10-results-expanded-1280x720.png`              | 小视口展开结果 Dock                  |
