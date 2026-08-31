# BFN Development State Ledger

- 最后核查日期：2026-08-31
- Repository：`bulbel-magnolia/fluorescence-detection-workbench`
- 当前冻结实现基线：`499f44e8a57e8e80a678aaf29e14cba7da99cd2a`

本文件是 BIO-NET 开发状态的正式账本。状态字段只允许：

- `FROZEN`：合同和生产边界已冻结；
- `ACTIVE`：已授权且正在开展；
- `CANDIDATE`：研究结论已形成候选，正在校正或评审；
- `PLANNED`：路线已确定，尚未进入实施；
- `FUTURE`：未来能力，当前未授权。

## Git 核查记录

以下 SHA 均由 GitHub / Git 重新核实：

| Delivery                               | Verified commit                            | Commit message                                              |
| -------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Batch 10.0 contract                    | `73f29f39d446b4eb16603f2a8ccd61dc4509790f` | `feat(bfn): define temporal and compatibility contracts`    |
| Batch 10.1 runtime integration         | `cb3d8a470d02b445580e501abb5bff90e75b7aee` | `feat(bfn): integrate temporal and compatibility runtime`   |
| Batch 10.1.1 presentation fix          | `cca73311de398a68902d1f5af354f346e781c32f` | `fix(bfn): prioritize blocking validation issues`           |
| Batch 11 Sender V1.2 integration       | `68d90cbbd71997babdb1a63c6fc00e7aa6f1a2cd` | `feat(bfn): integrate sender evidence extension v1.2`       |
| Batch 11 final presentation checkpoint | `099294b018d1a6c4644156a9e083edde87570a43` | `fix(bfn): preserve sender evidence presentation semantics` |
| Batch 12.0 initial contract            | `2d84acdf52933706632fd1684b418a0fbcde9103` | `feat(bfn): define user module authoring contract`          |
| Batch 12.0 reviewed implementation     | `2a33365c40d4852d2270252560e148b7dc247aaf` | `fix(bfn): preserve user module evidence independence`      |
| Batch 12.0 freeze bookkeeping          | `42e4cf6770c2986c950c89efc724a981e9ccf5d9` | `docs(bfn): freeze batch 12.0 contract`                     |
| Batch 12.0.1 schema implementation     | `9773b1d030c867d396e91671985f1c31532e2a6e` | `feat(bfn): extend ir for user module representation`       |
| Batch 12.0.1 reviewed implementation   | `d22918712ca9affe1edf4da077e1f51696f8d426` | `fix(bfn): preserve missing context semantics`              |
| Batch 12.0.1 freeze bookkeeping        | `8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2` | `docs(bfn): freeze batch 12.0.1 schema`                     |
| Batch 12.0.2 reviewed implementation   | `9fd60049145ccc21237623a9b657d2a84fecb325` | `feat(bfn): preserve user port labels in ir`                |
| Batch 12.0.2 freeze bookkeeping        | `499f44e8a57e8e80a678aaf29e14cba7da99cd2a` | `docs(bfn): freeze batch 12.0.2 schema`                     |
| Batch 12.1 runtime phase               | `1f106c833d6f99b780e4e8dc896b8103e9573d6b` | `feat(bfn): add uncertainty-aware static runtime`           |
| Batch 12.1 materialization phase       | `ff0db81fe0e226f810af0c349b0ebabb7056117e` | `feat(bfn): materialize user-defined static modules`        |

Batch 12.0 从 `099294b018d1a6c4644156a9e083edde87570a43` 创建，并经 Master Control 完成实现审核与窄修正复核。`2a33365c40d4852d2270252560e148b7dc247aaf` 是正式审定的 Batch 12.0 实现 Head，`42e4cf6770c2986c950c89efc724a981e9ccf5d9` 是其 freeze bookkeeping commit。

Batch 12.0.1 从 `42e4cf6770c2986c950c89efc724a981e9ccf5d9` 创建。初始 BFN-IR 2.1 实现为 `9773b1d030c867d396e91671985f1c31532e2a6e`，Master Review 后通过窄修正 `d22918712ca9affe1edf4da077e1f51696f8d426` 固定 missing-Context placeholder 语义；`8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2` 是其 freeze bookkeeping head。

Batch 12.1 首次 preflight 在 `8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2` 上发现 mandatory user-authored Port label 无损表示缺口，并按硬门 STOP，没有产生 Batch 12.1 实现提交。Batch 12.0.2 随后从该精确基线创建，并以 `9fd60049145ccc21237623a9b657d2a84fecb325` 补齐 BFN-IR 2.2 Port authoring metadata；`499f44e8a57e8e80a678aaf29e14cba7da99cd2a` 是经 Master Review 后的正式 freeze-bookkeeping Head。

Batch 12.1 已从精确冻结基线 `499f44e8a57e8e80a678aaf29e14cba7da99cd2a` 重新授权，并在 `codex/bfn-static-user-module-authoring` 按 runtime uncertainty → pure materialization → authoring UI 顺序实施。该 Batch 当前为 `ACTIVE`，等待 Master Control review，不在本分支自我冻结。

## 当前状态

| Workstream                                      | State   | Branch / commit verification                                                                                                                                       | Current boundary                                                                      |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Batch 10 — Temporal Semantics & Compatibility   | FROZEN  | 最终修复 `cca73311de398a68902d1f5af354f346e781c32f`；合同与集成 SHA 见上表                                                                                         | Port Compatibility、Temporal semantics 和 Context Applicability 冻结                  |
| Batch 11 — Sender Evidence & Runtime Admission  | FROZEN  | 最终 checkpoint `099294b018d1a6c4644156a9e083edde87570a43`                                                                                                         | Sender V1.2 source、loader、validator、admission 与 presentation 冻结                 |
| Batch 12.0 — User-defined Module Contract       | FROZEN  | `codex/bfn-user-defined-module-contract`；reviewed implementation `2a33365c40d4852d2270252560e148b7dc247aaf`                                                       | Authoring contract、representation audit 与测试冻结；无 schema/UI/runtime integration |
| Batch 12.0.1 — BFN-IR Representation Extension  | FROZEN  | `codex/bfn-ir-2-1-user-module-representation`；base `42e4cf6770c2986c950c89efc724a981e9ccf5d9`；reviewed implementation `d22918712ca9affe1edf4da077e1f51696f8d426` | BFN-IR 2.1 schema、中央 migration 与表示语义冻结；不包含 authoring UI/materialization |
| Batch 12.0.2 — BFN-IR Port Label Representation | FROZEN  | `codex/bfn-ir-2-2-port-authoring-label`；base `8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2`；reviewed implementation `9fd60049145ccc21237623a9b657d2a84fecb325`       | BFN-IR 2.2 Port authoring label 表示与迁移冻结；无 UI/runtime/materialization         |
| Sender Public Evidence Research                 | FROZEN  | Master Control formal boundary；不据此声明新的 production commit                                                                                                   | public evidence retrieval phase complete；runtime candidate outputs found: 0          |
| Batch 11.2                                      | FUTURE  | NOT AUTHORIZED；无实施 commit                                                                                                                                      | 不进入 Sender production runtime                                                      |
| Batch 7 — Calibration                           | PLANNED | 尚未启动；无实施 commit                                                                                                                                            | blocked pending experimental data                                                     |
| Batch 12.1 — Static Functional Module Authoring | ACTIVE  | `codex/bfn-static-user-module-authoring`；base `499f44e8a57e8e80a678aaf29e14cba7da99cd2a`；runtime `1f106c8`；materialization `ff0db81`                            | BFN-SIM-2.1、纯 2.2 物化与 static single-output authoring 正在接受 Master Review      |
| Batch 12.2 — Designed Sender                    | PLANNED | 尚未启动；无实施 commit                                                                                                                                            | 等待 12.1 authoring 与 materialization                                                |
| Batch 12.3 — Stateful / Dynamic Custom Modules  | PLANNED | 尚未启动；无实施 commit                                                                                                                                            | 不由 static user model 自动获得 stateful execution                                    |
| Batch 12.4 — Signal Pool / Accumulation         | PLANNED | 尚未启动；无实施 commit                                                                                                                                            | 负责显式 rate-to-amount/concentration 过程                                            |
| Batch 12.5 — Reusable User Module Library       | PLANNED | 尚未启动；无实施 commit                                                                                                                                            | 等待稳定 template/version contract                                                    |
| Batch 13                                        | FUTURE  | 范围与 SHA 均未建立                                                                                                                                                | 不在当前授权范围                                                                      |

## Batch 12.0 frozen boundary

- User-defined Functional Module Authoring Contract：`FROZEN`；
- reviewed implementation head：`2a33365c40d4852d2270252560e148b7dc247aaf`；
- BFN-IR remains `2.0` at the Batch 12.0 implementation boundary；
- no authoring UI, materialization, Designed Sender production implementation, Signal Pool or reusable library was authorized in Batch 12.0；
- Computational capability、Evidence basis、Implementation maturity 保持独立；
- `independent_inputs` 的 `independent_unverified` 属于模型层假设，不强制 Evidence basis；
- provenance `provided` 只表示结构记录已提供，不表示科学验证、充分证据、Catalog trust 或 runtime authorization；
- schema 变化由后续独立 Batch 实施、审核并冻结。

## Batch 12.0.1 frozen boundary

- Batch 12.0.1：`FROZEN`；
- reviewed implementation head：`d22918712ca9affe1edf4da077e1f51696f8d426`；
- Batch 12.0.1 boundary project schema：`BFN-IR 2.1`；
- BFN-SIM 保持 `BFN-SIM-2.0`，Workspace IndexedDB structural version 保持 `1`；
- user-authored origin/name/description、Project Entity registry、partial/not-recorded Context、`none | not_recorded` uncertainty、generic provenance 与 implementation maturity 获得无损表示；
- legacy Context placeholder raw text 可逐字保留，但 Context Applicability 中按 missing information 处理；native user authoring 拒绝 placeholder；
- `contextId = null` 与 partial Context 遵守 Batch 10 missing-information 语义；Catalog-backed Receiver 继续由 trusted Catalog parameter context 决定；
- computation signature 不因 schema 描述元数据、module authoring、Entity display、provenance 或 maturity 产生假过期；
- 本批不包含 authoring UI、draft materialization、Designed Sender、Signal Pool 或新的 runtime semantics。

## Batch 12.0.2 frozen boundary

- Batch 12.0.2：`FROZEN`；
- reviewed implementation head：`9fd60049145ccc21237623a9b657d2a84fecb325`；
- current project schema：`BFN-IR 2.2`；合法 2.0、2.1 与 2.2 项目通过唯一中央迁移入口读取为 2.2；
- `BfnPort.authoring?` 显式保存 `origin = user_defined` 与逐字 `name`；Port role label、Entity ID、Entity display label 与 localized Port displayName 保持独立；
- 2.0/2.1 migration 不创建、不推断 Port authoring metadata；2.2 输入验证后返回深拷贝；
- Port authoring metadata 不进入 computation signature 或 Port Compatibility；Port `id`、Entity、Quantity、Unit 与 Direction 的科学行为不变；
- Workspace IndexedDB structural version 保持 `1`，storage keys 不变，旧 Draft/Version 读取为 2.2 copy，历史 Version read 不改写 snapshot；
- BFN-SIM 保持 `BFN-SIM-2.0`；本批不修改 Simulation equations、uncertainty runtime/output semantics、Inverse Design、Ontology、Temporal、Sender/Receiver runtime、UI 或 materialization；
- 冻结草案在 Batch 12.1 既定静态单输出范围内完成逐字段 representability audit，结果全部 `LOSSLESS NOW`；
- Batch 12.1 在本提交后仍为 `PLANNED`，需要 Master Control 以 BFN-IR 2.2 冻结基线重新授权。

## Batch 12.1 active boundary

- Batch 12.1：`ACTIVE`；不会在实现分支自我声明 `FROZEN`；
- exact frozen base：`499f44e8a57e8e80a678aaf29e14cba7da99cd2a`；current project schema 保持 `BFN-IR 2.2`；
- 新运行使用 `BFN-SIM-2.1`，以 `number | null` 区分点估计和定量区间，并保存 output-reachable uncertainty snapshot；历史 BFN-SIM-2.0 Run 继续读取；
- 输出可达的 user-defined active model 缺少 enabled incoming Edge 时明确阻止运行；已连接的显式零值保持有效；
- 纯 materializer 映射模块、Port authoring、Entity、static model、Context、validity domain、uncertainty、provenance 与 implementation，不使用历史 2.0 representation audit 作为门；
- authoring UI 仅提供 static Hill activation/repression、同单位 linear transfer 与 `independent_unverified` 多输入模型，且为单输出；
- Add to Network 只创建一个 FunctionalModule 和必要 registry sidecar；Edge、Input Source、Output Monitor 与 Run 不自动创建；一次添加对应一个 Undo/Redo 单元；
- Workspace IndexedDB structural version 保持 `1`，BFN-IR schema、中央 migration、Sender/Receiver source、Inverse Design、Ontology、Port Compatibility、Temporal 与 package dependencies 均未获修改授权；
- Designed Sender、dynamic custom module、Signal Pool / Accumulation 与 reusable user module library 继续为后续 `PLANNED` Batch。

## Sender Public Evidence Research formal boundary

- Sender Public Evidence Research：`FROZEN`；
- Sender Admission Gap Analysis correction pass：`FROZEN`；
- Gan 2024 targeted public evidence research：`FROZEN`；
- public evidence retrieval phase complete；
- runtime candidate outputs found：`0`；
- Frozen Sender V1.2 remains `53 evidence / 0 admitted`；
- Batch 11.2 remains `FUTURE / NOT AUTHORIZED`；
- reopening requires archived exact-target evidence or new experimental evidence。

## 维护规则

1. 状态变化必须与已授权范围一致，并使用本文件规定的五种状态。
2. Branch、commit 和 parent/history 必须重新从 Git 核实；找不到时写 `verification pending`。
3. 研究结论进入生产前，先从 `CANDIDATE` 经过明确评审，不用文档措辞代替 runtime admission。
4. 已冻结 Batch 的科学或生产边界发生变化时，必须记录新的授权任务和真实 commit。
5. 当前 Sender 统计只描述冻结 V1.2 release：53 evidence、0 admitted Sender、20 trusted runnable Receiver。
6. Freeze bookkeeping commit 可以更新正式状态账本，但不替代对应 Batch 的 reviewed implementation head。

相关合同：

- [用户定义功能模块科学与计算合同](user-defined-functional-modules.md)
- [用户定义静态功能模块创作与运行](user-defined-static-authoring.md)
- [BFN-IR 2.2 端口标签表示扩展](bfn-ir-2.2.md)
- [BFN-IR 2.1 用户模块表示扩展](bfn-ir-2.1.md)
- [时间语义、兼容性与适用性](temporal-and-compatibility.md)
- [Sender Evidence Extension V1.2](sender-evidence-v1.2.md)
