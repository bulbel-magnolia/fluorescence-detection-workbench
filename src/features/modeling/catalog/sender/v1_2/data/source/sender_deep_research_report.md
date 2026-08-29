# AHL/HSL 发送元件及定量发送函数专项深度检索报告

**发布版本：** Sender Extension V1.2  
**检索与复核截止：** 2026-08-08  
**基线：** V1.1，SHA256 `2789c92207b57444ca21f14c0ac6590389abcf7d73cb6d2686854c58666e0b80`，全程只读  
**附件说明：** 请求中的 `deep-research-report (1).md` 未出现在可访问附件中；实际物化并完整读取的是 `deep-research-report (2).md`。V1.1 ZIP 已解包并核对全部 signals、components、parameter_contexts、receiver_responses、sender_outputs、effective_pairs、sources 和 rejected records。

## 1. 结论

本轮没有发现满足全部准入条件的 `runtime_quantitative` 发送函数，数量为 **0**；`runtime_demo` 亦为 **0**。主要限制并非缺少发送酶名称，而是公开研究通常只提供固定条件终点、固定诱导时间序列、纯化酶动力学，或发送—接收整体结果。满足“至少 3 个明确控制输入水平 + 每点绝对 AHL 输出 + 可审计原始点 + R² + RMSE + 完整构建/单位上下文”的资料未被定位。

本增量共生成 **53** 条 sender-output 证据记录：`calibration_candidate` 27 条，`effective_pair_only` 19 条，`reference_only` 7 条。拒绝函数候选台账 18 条。所有可执行开关均按规则设置，未将单点、时间序列或接收荧光伪造成发送函数。

## 2. 检索策略

### 2.1 数据库与入口

- PubMed、Europe PMC/PMC；
- Crossref/DOI 元数据和出版商页面；
- ACS、Springer Nature、PLOS、PeerJ、J-STAGE、PNAS 等原始论文页面；
- 出版商补充材料和 source-data 工作簿；
- GitHub 论文数据仓库；
- V1.1 中的 iGEM Registry/SynBioHub 仅用于构建身份追溯，不作为定量输出证据。

### 2.2 核心检索式

```text
("AHL synthase" OR "acyl homoserine lactone synthase" OR "LuxI family")
AND ("LC-MS" OR "LC-MS/MS" OR "mass spectrometry" OR HPLC OR "GC-MS")
AND (quantification OR concentration OR production OR titer OR rate)
```

对 LuxI、RhlI、LasI、CinI、RpaI、BjaI、EsaI、AubI、TraI、CerI、SinI、BraI、CepI、PhzI、AurI、CsaI、BmaI1、AhyI、NovI 等逐一组合 `concentration / production rate / titer / extracellular / supernatant / inducible / promoter strength / dose response / time course / supplementary data`。核心论文继续向后追溯参考文献、向前追踪后续复用、检索补充材料与数据仓库。

### 2.3 筛选计数的定义

数据库命中数会随搜索引擎动态变化，本报告不把重复网页、索引页和同一论文的多个入口当作独立论文计数。可审计筛选台账以“唯一研究/数据对象”为单位：纳入结构化证据的原始研究 **15** 篇；保留的来源/数据对象 **21** 个；拒绝或降级的函数候选 **18** 个。该计数可由 `sender_sources.csv` 和 `sender_rejected_candidates.jsonl` 复核。

## 3. 证据分层结果

### 3.1 直接定量但不能形成运行函数

1. **van Aalst 2025 CepI/酵母**：publisher source-data 给出 AAA063、AAA111、AAA113 在 0 与 1 g/L 甲硫氨酸条件下的重复级 C8-HSL 绝对浓度。每个构建只有 2 个输入条件；三个构建不可合并为一条表达强度曲线。
2. **Kokarakis 2023 E. coli 与 S. elongatus**：LC–MS 直接测得 3OC6/3OC8/3OC12-HSL 时间序列和最大生产率。诱导条件固定，时间不是发送控制输入；峰值随后下降。
3. **Morohoshi 2017 StFRB508 系列**：Table 2 给出 WT、单合成酶背景和三缺失背景的 24 h 多 AHL 绝对浓度。不同删除株是独立构建，不能当作同一酶的剂量水平。
4. **Kang 2015 人工 p-coumaroyl-HSL 通路**：HPLC 报告绝对滴度；SAM、甲硫氨酸和酪氨酸组合是不同干预，且时间点不完全一致。
5. **Gan 2024 NovIspR1**：LC–MS/MS 解析多产物谱并报告主要产物倍数变化；XAD-16 同时改变捕获和回收，无法隔离为纯合成函数。

### 3.2 纯化酶动力学

BjaI、BmaI1 和 AhyI 具有报告的 Km、kcat 或催化效率，适合设计无细胞标定实验。当前公开表格缺少可复算原始速率点、R² 和 RMSE；部分动力学采用 DCPIP/CoA 释放间接读出。它们被保存为 `calibration_candidate`，不进入细胞发送器运行层。

### 3.3 发送—接收整体证据

V1.1 的 10 个 Daer 构建、3 个 Múgica 构建，以及 Rai、Jiang、Ream、Chen、Zhai 的电路均保留为 `effective_pair_only`。中间 AHL 未直接测量，全部设置 `decomposition_prohibited = true`。

## 4. 软件准入审计

- `runtime_quantitative`：0
- `runtime_demo`：0
- `calibration_candidate`：27
- `effective_pair_only`：19
- `reference_only`：7
- 拒绝函数候选：18

没有条目同时具备：至少 3 个可控输入水平、绝对输出、同一构建/宿主/条件、可审计原始点、可重新拟合、R²、RMSE 和无歧义产物身份。`numerical_execution_allowed` 因而全部为 `false`。

## 5. 主要证据缺口

1. 发送构建常只在一个诱导强度下测量；
2. 时间序列丰富，但缺少独立控制输入轴；
3. 许多研究只记录接收荧光或下游产物；
4. 多产物合成酶缺少逐产物绝对浓度和完整质量平衡；
5. 补充材料常缺 R²、RMSE、原始重复点或精确构建信息；
6. 纯化酶动力学与细胞外发送浓度之间缺少宿主层转换模型。

## 6. BIT-CHINA 优先补测建议

### 第一优先：已有 V1.1 构建的同条件绝对标定

选择 `send.daer2018.luxi.v1`、`send.daer2018.rhli.v1`、`send.daer2018.lasi.v1` 和 `send.daer2018.rpai.v1`。在保持宿主、载体、启动子、RBS、培养基和采样时间固定的前提下，设置至少 6–8 个诱导水平；每点至少 3 个生物重复；用 LC–MS/MS 同位素内标和标准曲线逐一测量目标及次要 AHL。同步记录 OD、细胞干重、pH、培养体积和取样时间。

### 第二优先：CepI 作为快速可用候选

AAA063/AAA111/AAA113 已有绝对 C8-HSL 数据。团队可选定一个构建，设置 0–1 g/L 之间的至少 6 个甲硫氨酸水平，或改用同一构建的可调启动子输入。不要把三个构建合并为一条曲线。

### 第三优先：RpaI 人工芳香 AHL 通路

固定宿主与 TAL–4CL–RpaI 构建，单独扫描一个输入变量，例如 p-coumarate 或 IPTG；其他前体保持恒定。逐点测 p-coumaroyl-HSL，避免把 SAM、甲硫氨酸和酪氨酸组合当作同一剂量轴。

### 建议最低数据包

- 8 个输入水平 × 3 生物重复；
- 目标 AHL 与所有可分辨次要产物；
- 标准品、同位素内标、校准曲线、LOD、LOQ；
- 0、2、4、6、8、12、18、24 h 时间点，并预先指定稳态/终点；
- 输出同时保存 nM、nmol/L、nmol/OD/h 或 nmol/gDW/h；
- 原始峰面积、校准方程、批次信息和空白对照；
- 预先规定禁止外推范围。

## 7. 评价边界

本发布包用于 V1.2 增量导入和实验优先级制定。它没有把天然产物注释当作工程构建实测输出，没有从接收器荧光反推发送浓度，没有把 ND 设为 0，也没有将不同宿主、构建或培养条件平均合并。
