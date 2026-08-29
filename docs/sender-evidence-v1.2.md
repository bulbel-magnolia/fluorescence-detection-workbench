# Sender Evidence Extension V1.2

## 发布关系

`AHL/HSL Sender Extension V1.2` 是 2026-08-08 发布的增量证据扩展。它声明的基础发布为 `AHL_HSL_component_database_reconstructed_release_v1_1.zip`，基础包 SHA-256 为 `2789c92207b57444ca21f14c0ac6590389abcf7d73cb6d2686854c58666e0b80`，并明确要求基础记录不可变。

本仓库把它作为独立层加载：

```text
冻结 AHL/HSL V1.1
  ├─ Receiver runtime trust：52 条响应，20 条 trusted runnable
  └─ 原始 Sender 输出：0 条

Sender Evidence Extension V1.2
  ├─ 53 条 Sender evidence
  ├─ evidence browsing / source trace
  └─ Sender runtime admission：0 条通过

两层只在 Composite Catalog 展示层合并，不交叉授信。
```

仓库内冻结 V1.1 JSON 的字节哈希为 `7f31755a24c8a3c066ecbba70c21f361ffe3a05665fbb681903310a93a404596`。它与扩展声明的基础 ZIP 哈希标识不同层级的制品，不能互相替换。V1.2 没有覆盖、追加或重写冻结 V1.1 JSON。

用户提供的 `sender_extension_v1_2.zip` SHA-256 为 `E05A053976ECA37A0433908C6AD22B149315AA02A3AE696E7F46D539B184C1BE`。12 个源文件按原始字节保存在 `src/features/modeling/catalog/sender/v1_2/data/source/`，测试逐文件核对长度与 SHA-256。

## Source Inventory

| 文件                               | 类型与记录数                                                                           |      字节 | SHA-256                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `sender_components_v1_2.json`      | JSON；3 个新 Signal、17 个新 Context、34 个新 Sender Component、13 个 V1.1 Sender 引用 |    79,543 | `DA83CF6FE55852D74B7B2677B06D3856EA1B67877A771A384D604B741CC50FB9` |
| `sender_outputs_v1_2.json`         | JSON；53 条 Sender Output                                                              |   147,627 | `7D649F3AE8FE1885925B14BE6D993E3C4877CC76C299740534855CE53D31BEEF` |
| `sender_raw_points.csv`            | CSV；60 个原始点                                                                       |    24,790 | `C3972F20C32B8FA137A9F824B75AD33999B182A91269FAE3210D5B2669318BCD` |
| `sender_function_parameters.csv`   | CSV；5 条函数参数记录                                                                  |     3,006 | `776B41BD269A72207BDE5EA4F49B33BC1DB98DB45EC4945BAAC3585D98072A4E` |
| `sender_sources.csv`               | CSV；21 条来源，其中 17 条新增、4 条显式复用 V1.1                                      |    11,939 | `585A47F8CDDDFF015053A3C6EACFDB63FDC323CF43987626AB1EBE8ECFC88CAC` |
| `sender_evidence_trace.csv`        | CSV；6,127 条字段级证据追踪                                                            | 1,628,873 | `1EA9B4E77B85A7B5CA2489A3BB79FAE1AA398F739D8904CDF0B89EB68C6D044C` |
| `sender_rejected_candidates.jsonl` | JSONL；18 条拒绝候选                                                                   |     7,428 | `8A9088876622791242717276A2CDC0556B5A941FA906B426BD6DD8EA621751ED` |
| `sender_validation_report.json`    | JSON；1 份发布校验报告                                                                 |     5,222 | `F9DBAB30F3F354A874FA189BB837312412E9F95EE2E894ADF8A285BEB1790A10` |
| `sender_deep_research_report.md`   | Markdown；1 份研究报告                                                                 |     7,179 | `6C775BF0BED761352BFC7F0EFB00C1BEBBDFFC596301B2D02D6038E315D111D6` |
| `sender_import_ready_summary.md`   | Markdown；1 份导入摘要                                                                 |     2,363 | `5F4D2812392F2A9CFF25C78D7D193B5374EE9B41CF79188705B5ED326F7927DB` |
| `sender_conflicts.md`              | Markdown；1 份冲突与边界记录                                                           |     3,119 | `0CAADD7B158B0476D981E6D40286D9353885969A912110A0BF35C05C04194AB2` |
| `fit_sender_functions.py`          | Python；1 个来源审计脚本                                                               |     5,580 | `FBB170C711A7DA34AE7B042D73705CB120CBB220F32AE0FB4FF1F418E87EC382` |

扩展引用链按精确 ID 解析：

```text
Sender Output
  ├─ Sender Component
  ├─ Output Signal（允许为 null）
  ├─ Parameter Context
  ├─ Source
  ├─ Raw Point
  ├─ Function Parameter
  └─ Field-level Evidence Trace
```

Loader 在返回深冻结对象前检查发布身份、基础发布身份、固定记录数、重复 ID、未知引用、V1.1 ID 覆盖、来源重用身份、嵌入点与 CSV 往返、证据追踪引用以及科学 null 边界。新增 Signal、Component 和 Context ID 均不与冻结 V1.1 重叠；4 条显式复用来源保持 V1.1 的核心 citation identity。

## 证据范围

53 条输出按源数据状态分为 27 条 `calibration_candidate`、19 条 `effective_pair_only` 和 7 条 `reference_only`；证据等级为 B 21 条、C 6 条、D 26 条。Presentation 根据真实字段形成可重叠的证据范围：

| 证据范围                    | 记录数 | 表达边界                                                  |
| --------------------------- | -----: | --------------------------------------------------------- |
| Endpoint concentration      |     21 | 固定终点浓度观测，不自动插值为连续输入—输出函数           |
| Production rate             |      9 | 与浓度保持不同 quantity type 和单位语义                   |
| Fixed-condition time course |      5 | 固定诱导条件下的时间序列，不作为控制输入 dose response    |
| Enzyme kinetics             |      5 | Cell-free / enzyme scope 参数，不实例化为 cellular Sender |
| Effective-pair-only         |     19 | 端到端 Sender→Receiver 证据，禁止拆成独立 Sender 数值函数 |
| Non-detection               |      4 | 记录检测状态；ND 的数值、LOD 和上下界保持 null            |
| Other quantitative evidence |      4 | 保留原测量定义，不强行归类为模型族                        |

60 个原始点包含 39 个 quantified、15 个 ND 和 6 个 reported range。ND 不转换为 0；reported range 保留上下界且点值为 null。全部原始点 `fit_eligible=false`。5 条函数参数记录保留原始公式、适用范围和来源，同时保留空的 R²、RMSE 与数据点数，且 `runtime_allowed=false`。

Quantity semantics 由 output entity、quantity type、unit、compartment、timepoint / duration 和 normalization basis 共同定义。`nmol gDW^-1 h^-1` 的产生速率不会映射为浓度；当前 BFN Unit 不支持的原始单位仍可浏览，并在 runtime admission 中安全拒绝。

## Sender Runtime Admission

`assessBfnSenderRuntimeAdmission()` 是独立、确定、无评分的 fail-closed gate。它按每条真实输出检查：

- Sender Component、Output Signal、Context 与来源能否精确解析；
- 输出 quantity 与 unit 是否受 BFN runtime 支持；
- 输出是否直接测量；
- 控制输入定义与输入工作域是否完整；
- 是否存在可执行模型、必需参数、模型质量证据和参数上下文；
- endpoint、固定条件 time course、离散构建比较、enzyme kinetics、effective pair 与 non-detection 边界；
- 数据发布是否明确授权数值执行和 pair decomposition。

当前 V1.2 的 53 条输出全部为 `numerical_execution_allowed=false`，19 条 effective pair 全部为 `decomposition_prohibited=true`，发布声明的 runtime quantitative 与 runtime demo 数量均为 0。实际 admission 结果为：

```text
Sender evidence records: 53
Admitted Sender outputs: 0
Runnable Sender modules: 0
Trusted runnable Receiver responses: 20
```

这个 0 是当前 release 的证据不变量，不是按版本号硬编码的永久规则。测试使用一条满足完整输入—输出证据与授权条件的合成 admission 输入，确认同一 evaluator 能返回 admitted；该合成输入只验证 gate 逻辑，不进入 Catalog，也不作为实验数据展示。

## Catalog 与界面

Composite Catalog 展示 76 个 Component、52 条 Receiver response、20 条 runnable Receiver、53 条 Sender evidence 和 0 条 runnable Sender。冻结 V1.1 的现有 ontology assignment 继续按精确 ID 生效；V1.2 新 Component 没有 assignment 时显示“功能分类暂不可用”，不根据 LuxI、RhlI、LasI 或其他名称推断语义。

Catalog 支持按 Sender Component、Output Signal、来源作者、标题、DOI、evidence type、host 和 strain 检索。每条 Sender Output 使用独立 detail target 与 exact ID 深链；打开一条记录不会混入 sibling output。

Sender Full Detail 分离显示 evidence availability 与 runtime state，并按真实记录提供：

- 输入扰动、输出量、单位、compartment、时间点与测量方法；
- Context、Source、Raw Points、Function Parameters；
- Endpoint、fixed-condition time course、enzyme kinetics、effective-pair 和 ND 的专用解释；
- 高级审计区中的 record ID、release、source/context ID、内部 evidence scope、admission reason code 与字段级 trace。

### Presentation integrity clarification

Raw Point 的结构化 `input_value` 在存在时是 Input 列的主科学值，并与原始 `input_unit` 组合显示。`input_label` 是补充条件或时间语境，不会覆盖结构化数值：`rp.0013` 显示为主值 `100 nM`、补充说明 `peak near 13 h`；`rp.0001` 与 `rp.0003` 分别保留 `0 g/L` 和 `1 g/L` 主值。仅当 `input_value=null` 时才使用 `input_label`；两者都缺失时回退到 `input_name`。展示层不从描述文字解析或推断数值。

Enzyme Kinetics 主界面把已知 model ID 映射为科学名称，并把 `parameter_json` 结构化为参数、数值、单位和报告误差。Christensen IV-CoA 记录因而显示 Michaelis–Menten、Kₘ、kcat 和 kcat/Kₘ，不在主层直接显示 `reported_michaelis_menten` 或 JSON blob。未知 model ID 使用中性的“文献动力学模型”回退，不根据 code 猜测生物意义。原始 model ID、原始 parameter JSON、`reported_or_refit` 与 `runtime_allowed` 仍逐字保留在 Advanced / Audit 区。

这些规则只改变 Presentation；Sender V1.2 源文件、Loader、Validator、Identity / Integrity 和 Runtime Admission 均不变。

当前所有 Sender 详情均不显示 Add to Network。Catalog Search、Full Detail、Workspace 和 Inverse Design 不把 evidence count 称为 response，不排名、不推荐，也不暗示可以进入数值模拟或 Receiver-only inverse search。

## 后续可执行 Sender 路径

未来 release 可以继续复用同一 admission evaluator。第一条 executable Sender 需要以版本化证据同时提供可解析身份、明确输入定义与工作域、直接输出测量、受支持的 quantity/unit、完整可执行模型与参数、模型评价、参数 Context、来源追踪和明确数值执行授权。Production rate 到 concentration 的转换需要显式 Signal Pool / Accumulation / Clearance 过程模块；在相应模型和证据正式发布前，不自动积分、不自动连线，也不创建 Sender-specific BFN model family。
