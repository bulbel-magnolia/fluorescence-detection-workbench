# Sender Evidence V1.2 Visual Audit

审计日期：2026-08-29
目标：Windows 桌面生产页面中的 Composite Catalog 与 Sender Evidence Full Detail
数据：仅使用 `sender_extension_v1_2.zip` 中的真实记录，没有新增 Demo Sender 或视觉 fixture。

## 截图

1. `01-sender-discovery-1440x900.png`
   - 搜索 `AAA063` 后的 Catalog Discovery；
   - 显示 AHL/HSL V1.1 与 Sender Extension V1.2 的双 release identity；
   - Composite count 为 76 个 Component、52 条 Receiver response、53 条 Sender evidence、20 条 runnable Receiver、0 条 runnable Sender；
   - 新 Component 显示“功能分类暂不可用”，没有名称推断；
   - Preview 分离 evidence availability 与“当前不可用于网络计算”，没有 Add to Network。
2. `02-endpoint-concentration-1440x900.png`
   - exact record：`sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1`；
   - 显示 endpoint concentration、输入/输出定义、Source 与运行准入缺口；
   - 两个 methionine level 没有被绘制或插值成连续 curve。
3. `03-fixed-condition-time-series-1440x900.png`
   - exact record：`sout.kokarakis2023.1017ec.luxi.v1.concentration.v1`；
   - 显示 fixed aTc induction 与 fixed-condition time-course scope；
   - 运行边界明确说明该时间序列不构成 control-input dose response。
4. `04-enzyme-kinetics-1440x900.png`
   - exact record：`sout.christensen2014.bjai.ivcoa.kinetics.v1`；
   - 这是 Batch 11 主界面直接显示 model code / JSON 的基线截图，保留作为 09 的对照；
   - cell-free enzyme kinetics 保持 evidence，不实例化为 cellular Sender。
5. `05-effective-pair-boundary-1440x900.png`
   - exact record：`sout.daer2018.aubi.v1.end-to-end.v1`；
   - 独立输出 Signal 保持 unresolved；
   - “整体配对边界”明确禁止把 Sender→Receiver whole-system evidence 拆成 Sender 函数或 Receiver 参数。
6. `06-dark-mode-1440x900.png`
   - 与 01 相同的真实 AAA063 Discovery/Preview 状态；
   - 深色主题沿用共享语义色，没有 glow、gradient、ranking 或决策仪表盘。
7. `07-raw-table-1180x700.png`
   - exact record：`sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1`；
   - 原始点表在 1180×700 下保留字段与数值；
   - 表格自身承担横向滚动，页面不产生水平溢出。
8. `08-raw-input-semantics-1440x900.png`
   - exact record：`sout.kokarakis2023.1017ec.luxi.v1.concentration.v1`，对应真实 raw point `rp.0013`；
   - Input 主值为结构化数值 `100 nM`；
   - `peak near 13 h` 作为次级条件说明显示，没有覆盖输入值。
9. `09-kinetic-parameters-1440x900.png`
   - exact record：`sout.christensen2014.bjai.ivcoa.kinetics.v1`；
   - 主层显示 Michaelis–Menten 和结构化 Kₘ、kcat、kcat/Kₘ 参数表；
   - 主层不显示 `reported_michaelis_menten` 或原始 JSON；两者继续保留在 Advanced / Audit。

## Responsive measurements

| Viewport | Document client width | Document scroll width | Page horizontal overflow |
| -------- | --------------------: | --------------------: | -----------------------: |
| 1440×900 |               1440 px |               1440 px |                     0 px |
| 1280×720 |               1280 px |               1280 px |                     0 px |
| 1180×700 |               1180 px |               1180 px |                     0 px |

Catalog Drawer 在三档尺寸下均为 560 px，Drawer 自身纵向滚动。Endpoint raw table wrapper 在 1280×720 与 1180×700 下的 `clientWidth` 为 495 px、`scrollWidth` 为 620 px，125 px 的水平溢出被限制在表格内部；实际滚动验证将 `scrollLeft` 从 0 改为 100。

Batch 11.1.1 复核中，1440×900 与 1180×700 的 document client width 继续等于 scroll width。Kinetic Parameter Table 在两档尺寸下均为 `clientWidth=475 px`、`scrollWidth=475 px`；Raw Table 在 1180×700 下继续为 `495/620 px`，并实际滚动到 `scrollLeft=100`。

## Integrity checks

- App tab console：0 warning、0 error；
- Sender Full Detail 中 Add to Network 按钮数量：0；
- 53 条 Sender evidence 的 runnable count：0；
- 页面级水平溢出：三档尺寸均为 0；
- 原始数据、Source、Context、Evidence Scope 与 Runtime Admission 文案均来自真实 extension；
- 深色主题中的主/次输入层级和动力学参数表均使用共享语义变量，不依赖浅色背景；
- 审计结束后已恢复浏览器默认 viewport，并停止隔离的本地 Vite 服务。
