# Batch 8.2.1 Scientific UX & chart integrity visual audit

审计日期：2026-08-28

审计对象：真实桌面应用 `网络设计 → 按目标设计` 生产路径

主题：语义 token 驱动的深色主题；`06` 截图前已在应用“设置”中确认“外观主题：深色主题”。

## 场景截图

| 文件 | 真实交互状态 | 核对重点 |
| --- | --- | --- |
| `01-target-initial-1440x900.png` | 首次进入，未选择 Signal | 单层“设计目标 / 匹配结果 / 响应详情”标题；浓度为空；实时无效 Draft 禁用搜索 |
| `02-matched-results-1440x900.png` | 3OC6-HSL (L)，使用共同可信范围并显式搜索 | Matched 分组、真实 Catalog identity、61 点曲线、可读 log 刻度与低/高目标约束 |
| `03-near-not-applicable-1440x900.png` | 3OC6-HSL (L)，Host 不限、Strain 单独限定 TOP10 | 2 Matched、2 Near Match、1 Not Applicable；Near Match 显示未满足项数，EsaR 以 `菌株不符 · DH5α` 解释不适用且不绘图 |
| `04-stale-search-1440x900.png` | 搜索后把低点浓度改为 0.001 nM | 旧结果保留；明确显示“条件已修改”与重新搜索入口 |
| `05-candidate-comparison-1440x900.png` | 手动选择 LuxR 与 TraR | 两条各 61 点归一化响应曲线、共享的一组目标约束、参数表与 `对比 2 / 3`；没有自动 Top 3 |
| `06-dark-mode-1440x900.png` | 深色主题下重新搜索并打开 LuxR 详情 | 三栏层级、状态色、可读坐标轴、荧光曲线和数据表继续使用共享语义 token |
| `07-strain-only-filter-1440x900.png` | Host 不限、Strain 选择 TOP10 后显式搜索 | Strain-only Draft 精确生效，真实结果分组与直接 engine 搜索一致 |

`01`、`02`、`03`、`05`、`06` 与 `07` 已在本批次由运行中的真实 Application 页面重新生成，像素尺寸均为 1440×900；`04` 保留 Batch 8.2 的 stale-search 证据。没有使用静态 HTML、设计稿或拼图。

## Responsive audit

| 视口 | document client / scroll | body client / scroll | Target | Results | Inspector | 页面横向溢出 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 1440×900 | 1440 / 1440 | 1440 / 1440 | 303 px | 357 px | 505 px | 0 px |
| 1280×720 | 1280 / 1280 | 1280 / 1280 | 286 px | 330 px | 422 px | 0 px |
| 1180×700 | 1180 / 1180 | 1180 / 1180 | 261 px | 302 px | 378 px | 0 px |

1180×700 下主搜索按钮、Candidate compare toggle、Inspector 曲线与条件表仍直接可见。Target、Results 和 Inspector 各自管理纵向内容；对比表容器 client / scroll width 为 348 / 540 px，并使用内部水平滚动。1280×720 下该容器为 392 / 540 px；页面宽度始终与视口一致。

## Visual findings

- 使用 `Pane → Section → Row` 层级，没有 hero、排行榜、奖牌、渐变、玻璃拟态或发光效果。
- Matched 使用成功状态，Near Match 使用警示状态，荧光响应曲线保留 signal 色；状态同时有文字，不依赖颜色单独表达。
- Matched 列表没有排名编号，Near Match 不显示综合分并直接概括未满足项数，Not Applicable 不渲染无依据曲线。
- 宽量程横轴只显示 5 个可读整十倍刻度；低点 `≤ 0.20` 与高点 `≥ 0.80` 是锚定对应浓度的短约束段，不会被误读为贯穿全范围的目标曲线。
- 单候选图为 1 条 61 点曲线，对比图为 2 条各 61 点曲线并共享 2 条约束段；图中文字与科学表格为 10.5 px，轴标题为 11 px。
- 1440、1280 与 1180 三档均保留 Target、Results、Inspector 三部分，不把主搜索或比较操作隐藏进菜单。
- 所有表单、候选行、比较选择、details 和 tab 沿用统一 `:focus-visible` 规则；未新增持续动画，深色主题没有独立 inverse stylesheet。
