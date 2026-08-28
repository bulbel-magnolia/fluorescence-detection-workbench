# Batch 8.2.1 + 8.3 Catalog inverse design visual audit

审计日期：2026-08-28

审计对象：真实桌面应用 `网络设计 → 按目标设计` 生产路径

主题：语义 token 驱动的浅色与深色主题；`08`–`12` 使用浅色主题，`13` 截图前已在应用设置中确认深色主题。

## 场景截图

| 文件                                         | 真实交互状态                                   | 核对重点                                                                                                           |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `01-target-initial-1440x900.png`             | 首次进入，未选择 Signal                        | 单层“设计目标 / 匹配结果 / 响应详情”标题；浓度为空；实时无效 Draft 禁用搜索                                        |
| `02-matched-results-1440x900.png`            | 3OC6-HSL (L)，使用共同可信范围并显式搜索       | Matched 分组、真实 Catalog identity、61 点曲线、可读 log 刻度与低/高目标约束                                       |
| `03-near-not-applicable-1440x900.png`        | 3OC6-HSL (L)，Host 不限、Strain 单独限定 TOP10 | 2 Matched、2 Near Match、1 Not Applicable；Near Match 显示未满足项数，EsaR 以 `菌株不符 · DH5α` 解释不适用且不绘图 |
| `04-stale-search-1440x900.png`               | 搜索后把低点浓度改为 0.001 nM                  | 旧结果保留；明确显示“条件已修改”与重新搜索入口                                                                     |
| `05-candidate-comparison-1440x900.png`       | 手动选择 LuxR 与 TraR                          | 两条各 61 点归一化响应曲线、共享的一组目标约束、参数表与 `对比 2 / 3`；没有自动 Top 3                              |
| `06-dark-mode-1440x900.png`                  | 深色主题下重新搜索并打开 LuxR 详情             | 三栏层级、状态色、可读坐标轴、荧光曲线和数据表继续使用共享语义 token                                               |
| `07-strain-only-filter-1440x900.png`         | Host 不限、Strain 选择 TOP10 后显式搜索        | Strain-only Draft 精确生效，真实结果分组与直接 engine 搜索一致                                                     |
| `08-evidence-entry-1440x900.png`             | 选择 RhlR Near Match 候选                      | 紧凑证据摘要只呈现主要来源、Host / Strain、可信范围与机制；入口携带候选身份                                        |
| `09-full-literature-detail-1440x900.png`     | 从候选打开既有 Catalog Full Detail             | 3OC6 Response、RhlR / pRhl、TOP10、Kylilis 2018 与 DOI 保持同一 fresh 目录身份                                     |
| `10-add-settings-blank-project-1440x900.png` | 空项目中的 runnable Response 详情              | 既有 Add Panel 默认选择 Module + Input Source，并明确不自动连线或修改输出                                          |
| `11-after-add-network-design-1440x900.png`   | 点击显式 Add 后                                | 返回 Network Design，新增 Module 被选中；Input Source 同步加入，Edge 与 Run 保持为空                               |
| `12-comparison-evidence-link-1440x900.png`   | 手动比较 LuxR 与 RhlR                          | 每个比较列都有候选特定的文献入口，表头没有 Apply                                                                   |
| `13-evidence-dark-mode-1440x900.png`         | 深色主题下选择 RhlR 候选                       | 证据摘要、状态、曲线与表格沿用共享语义 token，没有独立深色覆盖                                                     |

`01`、`02`、`03`、`05`、`06` 与 `07` 由 Batch 8.2.1 的真实 Application 页面生成；`04` 保留 Batch 8.2 的 stale-search 证据。`08`–`13` 由 Batch 8.3 的真实 Windows Application 交互生成。全部截图均为 1440×900，没有使用静态 HTML、设计稿或拼图。

## Responsive audit

| 视口     | document client / scroll | body client / scroll | Target | Results | Inspector | 页面横向溢出 |
| -------- | ------------------------ | -------------------- | -----: | ------: | --------: | ------------ |
| 1440×900 | 1440 / 1440              | 1440 / 1440          | 303 px |  357 px |    505 px | 0 px         |
| 1280×720 | 1280 / 1280              | 1280 / 1280          | 286 px |  330 px |    422 px | 0 px         |
| 1180×700 | 1180 / 1180              | 1180 / 1180          | 261 px |  302 px |    378 px | 0 px         |

1180×700 下主搜索按钮、Candidate compare toggle、Inspector 曲线与条件表仍直接可见。Target、Results 和 Inspector 各自管理纵向内容；对比表容器 client / scroll width 为 348 / 540 px，并使用内部水平滚动。1280×720 下该容器为 392 / 540 px；页面宽度始终与视口一致。

Batch 8.3 在 Comparison 状态复核了三档视口：document 与 body 的 client / scroll width 分别为 1440 / 1440、1280 / 1280、1180 / 1180；主内容 client / scroll width 分别为 1224 / 1224、1090 / 1090、990 / 990。1180×700 打开 Full Detail 后，Drawer 为 560 px，正文 client / scroll width 均为 549 px，纵向 client / scroll height 为 599 / 3401 px。页面没有新增横向溢出，详情正文保持独立纵向滚动。浏览器控制台没有 warning 或 error。

## Visual findings

- 使用 `Pane → Section → Row` 层级，没有 hero、排行榜、奖牌、渐变、玻璃拟态或发光效果。
- Matched 使用成功状态，Near Match 使用警示状态，荧光响应曲线保留 signal 色；状态同时有文字，不依赖颜色单独表达。
- Matched 列表没有排名编号，Near Match 不显示综合分并直接概括未满足项数，Not Applicable 不渲染无依据曲线。
- 宽量程横轴只显示 5 个可读整十倍刻度；低点 `≤ 0.20` 与高点 `≥ 0.80` 是锚定对应浓度的短约束段，不会被误读为贯穿全范围的目标曲线。
- 单候选图为 1 条 61 点曲线，对比图为 2 条各 61 点曲线并共享 2 条约束段；图中文字与科学表格为 10.5 px，轴标题为 11 px。
- 1440、1280 与 1180 三档均保留 Target、Results、Inspector 三部分，不把主搜索或比较操作隐藏进菜单。
- 所有表单、候选行、比较选择、details 和 tab 沿用统一 `:focus-visible` 规则；未新增持续动画，深色主题没有独立 inverse stylesheet。
- 证据摘要与 Full Detail 形成清楚的渐进披露：候选页保留判读所需的四项事实，完整来源、实验条件与 Add 决策继续由既有 Drawer 承担。
- 浏览证据不切换工作区；显式 Add 成功后才进入 Network Design，并保留一次 Undo 的原子编辑语义。
