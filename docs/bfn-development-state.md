# BFN Development State Ledger

- 最后核查日期：2026-09-06
- Repository：`bulbel-magnolia/fluorescence-detection-workbench`
- 当前正式冻结交付：Batch 12.3，以及经 Master Control 最终联合复核的 Batch 12.4.0、Batch 12.4.1 与 Batch 12.4；后三者现统一登记为 `FROZEN`
- Batch 12.4 系列锚点：12.4.0 reviewed implementation `cb41a6e49829249b5b2fbf44206cfb6436a425bf`；12.4.1 final reviewed implementation `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`；12.4 reviewed production correction `6150203fe9c75b9acbc308cb782104e80cab22cb`；pre-freeze integrated branch Head `29b3ec8bdf44f0d0bc39f6da1640d4ece09b27c6`
- Batch 12.4 docs-only bookkeeping commit 建立了该系列的统一 freeze checkpoint；实际 freeze SHA 由对应 handoff 记录
- 当前交付：Batch 13.4 Dynamic Influence Analysis Correction；分支 `codex/bfn-dynamic-gain-analysis-correction`；exact base `11f931ef0bbdeb031f5b337dcf22a9b600fbacfc`
- Batch 13.4 original candidate `11f931ef0bbdeb031f5b337dcf22a9b600fbacfc` 的 Master Review 结论为 `FIX`。当前 correction 状态为 `CANDIDATE / correction implementation complete / awaiting Master Correction Review / not FROZEN`；Phase 0 bookkeeping history 不变，本阶段不做 unified freeze bookkeeping

本文件是 BIO-NET 开发状态的正式账本。状态字段只允许：

- `FROZEN`：合同和生产边界已冻结；
- `ACTIVE`：已授权且正在开展；
- `CANDIDATE`：研究结论已形成候选，正在校正或评审；
- `PLANNED`：路线已确定，尚未进入实施；
- `FUTURE`：未来能力，当前未授权。

## Git 核查记录

以下 SHA 均由 GitHub / Git 重新核实：

| Delivery                                | Verified commit                            | Commit message                                               |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Batch 10.0 contract                     | `73f29f39d446b4eb16603f2a8ccd61dc4509790f` | `feat(bfn): define temporal and compatibility contracts`     |
| Batch 10.1 runtime integration          | `cb3d8a470d02b445580e501abb5bff90e75b7aee` | `feat(bfn): integrate temporal and compatibility runtime`    |
| Batch 10.1.1 presentation fix           | `cca73311de398a68902d1f5af354f346e781c32f` | `fix(bfn): prioritize blocking validation issues`            |
| Batch 11 Sender V1.2 integration        | `68d90cbbd71997babdb1a63c6fc00e7aa6f1a2cd` | `feat(bfn): integrate sender evidence extension v1.2`        |
| Batch 11 final presentation checkpoint  | `099294b018d1a6c4644156a9e083edde87570a43` | `fix(bfn): preserve sender evidence presentation semantics`  |
| Batch 12.0 initial contract             | `2d84acdf52933706632fd1684b418a0fbcde9103` | `feat(bfn): define user module authoring contract`           |
| Batch 12.0 reviewed implementation      | `2a33365c40d4852d2270252560e148b7dc247aaf` | `fix(bfn): preserve user module evidence independence`       |
| Batch 12.0 freeze bookkeeping           | `42e4cf6770c2986c950c89efc724a981e9ccf5d9` | `docs(bfn): freeze batch 12.0 contract`                      |
| Batch 12.0.1 schema implementation      | `9773b1d030c867d396e91671985f1c31532e2a6e` | `feat(bfn): extend ir for user module representation`        |
| Batch 12.0.1 reviewed implementation    | `d22918712ca9affe1edf4da077e1f51696f8d426` | `fix(bfn): preserve missing context semantics`               |
| Batch 12.0.1 freeze bookkeeping         | `8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2` | `docs(bfn): freeze batch 12.0.1 schema`                      |
| Batch 12.0.2 reviewed implementation    | `9fd60049145ccc21237623a9b657d2a84fecb325` | `feat(bfn): preserve user port labels in ir`                 |
| Batch 12.0.2 freeze bookkeeping         | `499f44e8a57e8e80a678aaf29e14cba7da99cd2a` | `docs(bfn): freeze batch 12.0.2 schema`                      |
| Batch 12.1 runtime phase                | `1f106c833d6f99b780e4e8dc896b8103e9573d6b` | `feat(bfn): add uncertainty-aware static runtime`            |
| Batch 12.1 materialization phase        | `ff0db81fe0e226f810af0c349b0ebabb7056117e` | `feat(bfn): materialize user-defined static modules`         |
| Batch 12.1 authoring phase              | `48ade9de119bec96d3fe133ca33ee11168424d3c` | `feat(bfn): add static functional module authoring`          |
| Batch 12.1 reviewed implementation      | `ae7fa56197386571973198e87e9b8b68c7869f7c` | `fix(bfn): preserve static authoring contracts`              |
| Batch 12.1 freeze bookkeeping           | `1fa9c11909817b3e3b4873e7bf85a1a158b68338` | `docs(bfn): freeze batch 12.1 authoring`                     |
| Batch 12.2 contract                     | `222291a4a44941bb7593cad0fd60eca012a20543` | `feat(bfn): define designed sender authoring contract`       |
| Batch 12.2 materialization              | `84d5cfda8d4c6ff393b4bb0bd47bb8ec189a4678` | `feat(bfn): materialize designed sender signal production`   |
| Batch 12.2 authoring workflow           | `d138c61606b3e5cd260257fd5b48f14124df9516` | `feat(bfn): add designed sender authoring workflow`          |
| Batch 12.2 reviewed implementation      | `b93a3524004fb4556211328a5fbcf01bd732ede8` | `docs(bfn): correct designed sender control units`           |
| Batch 12.2 freeze bookkeeping           | `b76945246e56ed1fb494dc6f59c972a9f3999eda` | `docs(bfn): freeze batch 12.2 designed sender`               |
| Batch 12.3 dynamic contract             | `ce72c95abf642ebcf46c58658a6c932b77aa6963` | `feat(bfn): define first-order dynamic user module contract` |
| Batch 12.3 contract hardening           | `9f1436e69a91487bc94003ab39e82a56c2882989` | `fix(bfn): tighten first-order dynamic user module contract` |
| Batch 12.3 malformed-draft guard        | `4a0d09aa515e6ef585ce07584c70cf7485dcb6ac` | `fix(bfn): guard malformed dynamic drafts`                   |
| Batch 12.3 materialization              | `057a79a43fca4950c02d4830e9bfd8eb919524ec` | `feat(bfn): materialize first-order dynamic user modules`    |
| Batch 12.3 materialization hardening    | `a171878405123f91e69a62cb02ec7463e463294d` | `fix(bfn): harden dynamic module materialization`            |
| Batch 12.3 authoring workflow           | `e7a7369aee9677254fbeb89d1412584d0adb30eb` | `feat(bfn): add first-order dynamic module authoring`        |
| Batch 12.3 Sender isolation regression  | `1d5a550f1122d500d1e341e4d864dddf4baf27f0` | `test(bfn): lock designed sender static isolation`           |
| Batch 12.3 runtime admission correction | `7520623c3f75c8ae5ee6173d4a507f7b7825227f` | `fix(bfn): enforce dynamic user runtime contract`            |
| Batch 12.3 correction documentation     | `ec8c177afdf34b4f21ef9f9014de140a41f31e32` | `docs(bfn): record dynamic runtime correction`               |
| Batch 12.4.0 reviewed predecessor       | `cb41a6e49829249b5b2fbf44206cfb6436a425bf` | `fix(bfn): harden ir 2.3 runtime boundary`                   |
| Batch 12.4.1 final persistence fix      | `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111` | `fix(bfn): persist deterministic sim 2.2 transforms`         |
| Batch 12.4 Signal Pool contract         | `3259818e6e32bee469591405c31be8b1be94f872` | `feat(bfn): define signal pool authoring contract`           |
| Batch 12.4 Signal Pool materialization  | `66815c0225ac43b7db3dd1e08d3c6d6ed603206a` | `feat(bfn): materialize explicit signal pools`               |
| Batch 12.4 Signal Pool workflow         | `de568c896cc4e0d143543d1e4c176598aff13663` | `feat(bfn): add signal pool authoring workflow`              |
| Batch 12.4 signature correction         | `de2b677da56af695f02ceeeb37447ba8296369da` | `fix(bfn): sign dynamic-only signal pools`                   |
| Batch 12.4 runtime integration          | `98b6b953df07758db8dfe48aad5728582767b92d` | `test(bfn): integrate signal pool runtime workflow`          |
| Batch 12.4 identity correction          | `6150203fe9c75b9acbc308cb782104e80cab22cb` | `fix(bfn): tighten signal pool identity boundary`            |
| Batch 12.4 pre-freeze integrated head   | `29b3ec8bdf44f0d0bc39f6da1640d4ece09b27c6` | `docs(bfn): record signal pool identity correction`          |
| Batch 12.5.0 reviewed contract          | `d7fdcbf13ec8847ec9480085756dfaf184c35331` | `fix(bfn): harden module template representation contract`   |
| Batch 12.5.1 reviewed persistence       | `1d59a144e03eea4cdce70b3889936cd3e2e20f74` | `feat(bfn): add local versioned module library`              |
| Batch 12.5 initial workflow candidate   | `c4295d1335448ad2ca6b7f4296d77ab2dc5a18c1` | `feat(bfn): add reusable module library workflow`            |

Batch 12.0 从 `099294b018d1a6c4644156a9e083edde87570a43` 创建，并经 Master Control 完成实现审核与窄修正复核。`2a33365c40d4852d2270252560e148b7dc247aaf` 是正式审定的 Batch 12.0 实现 Head，`42e4cf6770c2986c950c89efc724a981e9ccf5d9` 是其 freeze bookkeeping commit。

Batch 12.0.1 从 `42e4cf6770c2986c950c89efc724a981e9ccf5d9` 创建。初始 BFN-IR 2.1 实现为 `9773b1d030c867d396e91671985f1c31532e2a6e`，Master Review 后通过窄修正 `d22918712ca9affe1edf4da077e1f51696f8d426` 固定 missing-Context placeholder 语义；`8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2` 是其 freeze bookkeeping head。

Batch 12.1 首次 preflight 在 `8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2` 上发现 mandatory user-authored Port label 无损表示缺口，并按硬门 STOP，没有产生 Batch 12.1 实现提交。Batch 12.0.2 随后从该精确基线创建，并以 `9fd60049145ccc21237623a9b657d2a84fecb325` 补齐 BFN-IR 2.2 Port authoring metadata；`499f44e8a57e8e80a678aaf29e14cba7da99cd2a` 是经 Master Review 后的正式 freeze-bookkeeping Head。

Batch 12.1 从精确冻结基线 `499f44e8a57e8e80a678aaf29e14cba7da99cd2a` 重新授权，并在 `codex/bfn-static-user-module-authoring` 按 runtime uncertainty → pure materialization → authoring UI 顺序实施。Phase A、B、C 分别落在 `1f106c833d6f99b780e4e8dc896b8103e9573d6b`、`ff0db81fe0e226f810af0c349b0ebabb7056117e`、`48ade9de119bec96d3fe133ca33ee11168424d3c`；Master Review narrow fix `ae7fa56197386571973198e87e9b8b68c7869f7c` 修正 provenance identity、authorable uncertainty 边界与 target-monitor authored-input validation，并作为正式审定实现 Head。`1fa9c11909817b3e3b4873e7bf85a1a158b68338` 是 Batch 12.1 freeze bookkeeping commit，也是 Batch 12.2 的精确冻结基线。

Batch 12.2 从 `1fa9c11909817b3e3b4873e7bf85a1a158b68338` 创建，并在 `codex/bfn-designed-sender-authoring` 按 contract → materialization → authoring workflow 顺序实施。`222291a4a44941bb7593cad0fd60eca012a20543`、`84d5cfda8d4c6ff393b4bb0bd47bb8ec189a4678`、`d138c61606b3e5cd260257fd5b48f14124df9516` 分别对应三阶段实现，`b93a3524004fb4556211328a5fbcf01bd732ede8` 修正文档中的控制输入单位记录并作为 Master Review 审定实现 Head；`b76945246e56ed1fb494dc6f59c972a9f3999eda` 是 Batch 12.2 freeze bookkeeping commit。

Batch 12.3 从精确冻结起点 `b76945246e56ed1fb494dc6f59c972a9f3999eda` 创建，并在 `codex/bfn-first-order-dynamic-user-module-authoring` 按 contract/validation → pure materialization/runtime guard → authoring workflow 顺序实施。Master Review 首轮要求补齐 imported / persisted user-defined dynamic model 的中央 runtime admission；修正落在 `7520623c3f75c8ae5ee6173d4a507f7b7825227f`，随后 `ec8c177afdf34b4f21ef9f9014de140a41f31e32` 记录 correction validation。Master Control 最终复核结论为 Implementation Review PASS、Correction Pass PASS、Further FIX not required，Batch 12.3 正式 `FROZEN`。本次 freeze bookkeeping 仅写入该正式状态，不修改生产代码；本次 bookkeeping commit 完成后即成为 Batch 12.4 preflight / implementation 的唯一合法开发基线。

Batch 12.4.0 从唯一合法 predecessor `f444433ee13acbc2a69602550c1163c263b313a5` 创建，分支为 `codex/bfn-ir-2-3-dynamic-process-representation`。Final Review PASS，Further FIX NONE，审定实现 Head 为 `cb41a6e49829249b5b2fbf44206cfb6436a425bf`；其正式状态现为 `FROZEN`。

Batch 12.4.1 从精确 base `cb41a6e49829249b5b2fbf44206cfb6436a425bf` 创建，分支为 `codex/bfn-sim-2-2-accumulator-runtime`。本批保持 BFN-IR 2.3 representation 不变，新增 narrow accumulator scientific admission、BFN-SIM 2.2 deferred-state execution、deterministic uncertainty propagation 与 versioned dynamic metrics。最终 persistence correction 从 pre-fix Head `1fd4b60225b90c9e5da41b92eaec77c7c97687c8` 线性追加为 final reviewed implementation `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`，使 simulator 产生的 `parameter_interval_envelope + deterministic_transform` snapshot 无损保存。Final Review PASS，Further FIX NONE；Batch 12.4.1 现为 `FROZEN`。

Batch 12.4 从精确 base `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111` 创建，分支为 `codex/bfn-signal-pool-authoring-integration`。本批把已有 accumulator capability 作为显式 Signal Pool 接入 Add Module，覆盖受限 draft、pure materialization、中英文 UI、原子 Undo/Redo、持久化和 production Sender→Pool→Receiver 集成。identity-boundary Correction Pass 从 pre-fix candidate `9d45d350abf07ef6034a8ce04f82d3b0d90fd76b` 线性追加为 reviewed production correction `6150203fe9c75b9acbc308cb782104e80cab22cb`；之后的 docs-only pre-freeze integrated branch Head 为 `29b3ec8bdf44f0d0bc39f6da1640d4ece09b27c6`，不作为 production implementation。Correction Review PASS，Further FIX NONE；Batch 12.4 现为 `FROZEN`。BFN-IR 2.3、BFN-SIM 2.2 与 Workspace DB 1 保持不变。

## 当前状态

| Workstream                                                | State     | Branch / commit verification                                                                                                                                                                                                                     | Current boundary                                                                                |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Batch 10 — Temporal Semantics & Compatibility             | FROZEN    | 最终修复 `cca73311de398a68902d1f5af354f346e781c32f`；合同与集成 SHA 见上表                                                                                                                                                                       | Port Compatibility、Temporal semantics 和 Context Applicability 冻结                            |
| Batch 11 — Sender Evidence & Runtime Admission            | FROZEN    | 最终 checkpoint `099294b018d1a6c4644156a9e083edde87570a43`                                                                                                                                                                                       | Sender V1.2 source、loader、validator、admission 与 presentation 冻结                           |
| Batch 12.0 — User-defined Module Contract                 | FROZEN    | `codex/bfn-user-defined-module-contract`；reviewed implementation `2a33365c40d4852d2270252560e148b7dc247aaf`                                                                                                                                     | Authoring contract、representation audit 与测试冻结；无 schema/UI/runtime integration           |
| Batch 12.0.1 — BFN-IR Representation Extension            | FROZEN    | `codex/bfn-ir-2-1-user-module-representation`；base `42e4cf6770c2986c950c89efc724a981e9ccf5d9`；reviewed implementation `d22918712ca9affe1edf4da077e1f51696f8d426`                                                                               | BFN-IR 2.1 schema、中央 migration 与表示语义冻结；不包含 authoring UI/materialization           |
| Batch 12.0.2 — BFN-IR Port Label Representation           | FROZEN    | `codex/bfn-ir-2-2-port-authoring-label`；base `8d51bfdfcffca2cd8c91112714bd8b4d89b5fda2`；reviewed implementation `9fd60049145ccc21237623a9b657d2a84fecb325`                                                                                     | BFN-IR 2.2 Port authoring label 表示与迁移冻结；无 UI/runtime/materialization                   |
| Sender Public Evidence Research                           | FROZEN    | Master Control formal boundary；不据此声明新的 production commit                                                                                                                                                                                 | public evidence retrieval phase complete；runtime candidate outputs found: 0                    |
| Batch 11.2                                                | FUTURE    | NOT AUTHORIZED；无实施 commit                                                                                                                                                                                                                    | 不进入 Sender production runtime                                                                |
| Batch 7 — Calibration                                     | PLANNED   | 尚未启动；无实施 commit                                                                                                                                                                                                                          | blocked pending experimental data                                                               |
| Batch 12.1 — Static Functional Module Authoring           | FROZEN    | `codex/bfn-static-user-module-authoring`；base `499f44e8a57e8e80a678aaf29e14cba7da99cd2a`；reviewed implementation `ae7fa56197386571973198e87e9b8b68c7869f7c`                                                                                    | BFN-SIM-2.1、纯 BFN-IR 2.2 物化与 static single-output authoring 冻结                           |
| Batch 12.2 — Designed Sender                              | FROZEN    | `codex/bfn-designed-sender-authoring`；base `1fa9c11909817b3e3b4873e7bf85a1a158b68338`；reviewed implementation `b93a3524004fb4556211328a5fbcf01bd732ede8`                                                                                       | 单控制输入 Hill Designed Sender、canonical signal identity 与 `production_rate` 输出冻结        |
| Batch 12.3 — First-order Dynamic User Modules             | FROZEN    | `codex/bfn-first-order-dynamic-user-module-authoring`；base `b76945246e56ed1fb494dc6f59c972a9f3999eda`；reviewed implementation `7520623c3f75c8ae5ee6173d4a507f7b7825227f`；pre-freeze docs `ec8c177afdf34b4f21ef9f9014de140a41f31e32`           | 受限一阶动态 authoring、成对模型、中央运行合同、target scope 与反馈硬门正式冻结                 |
| Batch 12.4.0 — BFN-IR 2.3 Dynamic Process Representation  | FROZEN    | `codex/bfn-ir-2-3-dynamic-process-representation`；legal predecessor `f444433ee13acbc2a69602550c1163c263b313a5`；reviewed implementation `cb41a6e49829249b5b2fbf44206cfb6436a425bf`                                                              | Final Review PASS；BFN-IR 2.3 accumulator / dynamic-only 表示边界冻结                           |
| Batch 12.4.1 — Accumulator Runtime                        | FROZEN    | `codex/bfn-sim-2-2-accumulator-runtime`；base `cb41a6e49829249b5b2fbf44206cfb6436a425bf`；final reviewed implementation `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`                                                                               | Final Review PASS；BFN-SIM 2.2 accumulator runtime 与 persistence correction 冻结               |
| Batch 12.4 — Signal Pool / Accumulation                   | FROZEN    | `codex/bfn-signal-pool-authoring-integration`；base `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`；reviewed production correction `6150203fe9c75b9acbc308cb782104e80cab22cb`；pre-freeze integrated Head `29b3ec8bdf44f0d0bc39f6da1640d4ece09b27c6` | Correction Review PASS；Signal Pool authoring、identity boundary 与 production integration 冻结 |
| Batch 12.5.0 — Reusable Module Template Representation    | CANDIDATE | `codex/bfn-module-template-representation-contract`；reviewed implementation `d7fdcbf13ec8847ec9480085756dfaf184c35331`                                                                                                                          | Master Review `PASS`；BFN-MODULE-TEMPLATE 1.0 not `FROZEN`                                      |
| Batch 12.5.1 — Local Versioned Module Library Persistence | CANDIDATE | `codex/bfn-local-versioned-module-library`；reviewed implementation `1d59a144e03eea4cdce70b3889936cd3e2e20f74`                                                                                                                                   | Master Review `PASS`；独立本地 versioned repository not `FROZEN`                                |
| Batch 12.5 — Reusable Module Library User Workflow        | CANDIDATE | `codex/bfn-reusable-module-library-workflow`；exact base `1d59a144e03eea4cdce70b3889936cd3e2e20f74`                                                                                                                                              | implementation complete；awaiting Master Review；not `FROZEN`                                   |
| Batch 13.0 — Network Interpretation Correction            | CANDIDATE | original reviewed candidate `0717b51ae4f659dab7a91dd42444734895eedd3d`；correction checkpoint `510ce360eadaec47d373632aaf20388704bb63ad`                                                                                                         | Master Correction Review `PASS`；not `FROZEN`                                                   |
| Batch 13.1 — Static Local Influence Analysis              | CANDIDATE | original candidate `7c1eec761346f2eba85df052a8ee02067cc95ee0`；correction checkpoint `a05375798f09cf3c8d278275970baacc823ccca5`                                                                                                                  | Master Correction Review `PASS`；not `FROZEN`                                                   |
| Batch 13.2 — Network Influence Propagation                | CANDIDATE | original candidate `f3da7c9277976ba60526a28ddb3dda7b30fb9a49`；reviewed correction `f62babfa2af09156c711792d362fab687270f42c`                                                                                                                    | Master Correction Review `PASS`；not `FROZEN`                                                   |
| Batch 13.3 — Local ANN Approximation                      | CANDIDATE | reviewed implementation `e0ce3a1cee0eff68a28a40edb4bfbd8a66ac3f44`                                                                                                                                                                               | Master Review `PASS`；not `FROZEN`                                                              |
| Batch 13.4 — Dynamic Influence Analysis                   | CANDIDATE | original candidate `11f931ef0bbdeb031f5b337dcf22a9b600fbacfc` Master Review `FIX`；correction on `codex/bfn-dynamic-gain-analysis-correction`                                                                                                    | correction implementation complete；awaiting Master Correction Review；not `FROZEN`             |

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

## Batch 12.1 frozen boundary

- Batch 12.1：`FROZEN`；
- reviewed implementation head：`ae7fa56197386571973198e87e9b8b68c7869f7c`；
- current project schema 保持 `BFN-IR 2.2`；新运行使用 `BFN-SIM-2.1`，历史 BFN-SIM-2.0 Run 继续可读；
- BFN-SIM-2.1 以 `number | null` 区分点估计与定量区间；仅当全部输出可达 active model 具有可执行 parameter interval 时提供完整网络区间；`none`、`not_recorded` 与无执行载荷的 posterior/bootstrap/covariance 不伪造零宽区间；
- 实际运行目标 Output Monitor 可达的 user-defined active model 缺少 enabled incoming Edge 时以 `missing_required_input` error 阻止运行；第二 Monitor 路径中的同类 authored-input 缺失不阻塞有效主路径，已连接显式零值保持有效；
- pure materializer 不使用历史 BFN-IR 2.0 representation audit 作为门；用户模块、Port authoring、Entity、静态模型、Context、validity domain、uncertainty、provenance 与 implementation 在 BFN-IR 2.2 中无损物化；
- draft provenance ID、kind、reference 原样保存；相同 provenance 复用，冲突返回 `provenance_record_conflict`，且不写入 `sourceDatasetIds`；
- Batch 12.1 新建物化只允许 `not_recorded`、`none` 与完整 `parameter_interval_envelope`；posterior/bootstrap/covariance 仅保留既有项目运行兼容，不属于 12.1 authorable capability；
- authoring UI 只开放 static Hill activation/repression、同单位 linear transfer 与 `independent_unverified` 多输入模型，且保持单输出；无 arbitrary formula、lookup table 或 dynamic user model；
- Add to Network 只创建一个 FunctionalModule 和必要 registry sidecar，不自动创建 Edge、Input Source、Output Monitor 或 Run；一次添加对应一个 Undo/Redo 单元；
- production_rate → concentration 继续 hard block；Ideal Edge 继续为 instantaneous、lossless、identity propagation；
- Workspace IndexedDB structural version 保持 `1`，storage keys 与 object store/index 不变；BFN-IR 2.2 schema/migration、Sender/Receiver source、Inverse Design、Ontology、Port Compatibility、Temporal 与 package dependencies 均保持冻结边界；
- 本批最终本地门禁记录为 137 个测试文件 / 1111 项测试通过，TypeScript、ESLint、Vite build、changed-file Prettier 与 `git diff --check` 通过；GitHub 无 status checks，因此不声明 CI passed。

## Batch 12.2 frozen boundary

- Batch 12.2：`FROZEN`；
- reviewed implementation head：`b93a3524004fb4556211328a5fbcf01bd732ede8`；
- Designed Sender 是受限 authoring workflow/preset，持久化结果仍为普通 `BfnFunctionalModule`；BFN-IR 保持 `2.2`，没有新增 node type、tag、marker 或 ontology assignment；
- 首版固定 1 个 `concentration` 控制输入与 1 个 `production_rate` 输出，只开放 static Hill activation/repression；输入单位为 `M | mM | uM | nM | pM`，输出单位为 `nM/h | uM/h`；
- 已知 AHL/HSL 仅从 trusted V1.1 release signals 投影 `catalogSignalId + canonical_name`；canonical name 作为与 Catalog Receiver 一致的 BFN Entity identity，identity reuse 不复用 Receiver/Sender 参数、Evidence、Implementation 或 Runtime Admission；custom signal 继续创建普通 Project-defined Entity；
- 通用 Batch 12.1 materializer 只增加可选 authoritative external Entity 参数；省略该参数时冻结的 12.1 默认行为保持不变；精确 ID/display 匹配时复用且不注册为 user-defined Entity，冲突 fail closed；
- 默认 Evidence 为 `proposed_unbuilt_design`，Implementation 为 `unspecified`；authorable uncertainty 仅 `not_recorded | none | parameter_interval_envelope`；
- Designed Sender 使用冻结 generic BFN-SIM-2.1 Hill evaluator，没有新增 Sender evaluator；输出可达 control input 缺失继续以 `missing_required_input` error 阻断，显式连接零值继续有效；
- 对真实 trusted Receiver `resp.kylilis2018.lux.3oc6` 的集成回归确认双方 chemical Entity identity 一致，但 `production_rate → concentration` 继续因 Quantity/Unit mismatch 硬拒绝；不执行隐式积分、不插入 Signal Pool；
- Add to Network 只创建一个 FunctionalModule 和必要 registry sidecar，不自动创建 Input Source、Edge、Output Monitor、Run 或 Signal Pool；Undo/Redo、Workspace 与 JSON roundtrip 沿用 BFN-IR 2.2 对象图；
- Sender V1.2 source/hash/loader/validator/admission、Receiver V1.1 source/whitelist/formulas、Catalog Receiver parameter binding、Inverse Design、Ontology、Port Compatibility、Temporal、BFN-IR schema/migration、BFN-SIM result contract/equations、Workspace DB structure、`package.json` 与 lockfile 相对冻结基线保持零差异；Sender release 继续 53 evidence / 0 admitted，trusted runnable Receiver 继续 20；
- 本批定向门为 8 个文件 / 79 项测试，冻结科学边界定向回归为 17 个文件 / 197 项测试；完整 142 个测试文件 / 1141 项测试在 `--maxWorkers=4` 下全部通过，TypeScript、ESLint、Vite build、changed-file Prettier 与 `git diff --check` 通过；默认高并发 `npm test` 曾在两个既有 UI 测试上出现 5 秒资源型 timeout，单文件复跑全部通过且未修改 timeout/断言，此执行差异记录为测试环境并发稳定性事项，不改变本批科学冻结结论；GitHub 无 status checks/workflow runs，因此不声明 CI passed。

## Batch 12.3 frozen boundary

- Batch 12.3：`FROZEN`；
- reviewed implementation head：`7520623c3f75c8ae5ee6173d4a507f7b7825227f`；pre-freeze documentation head：`ec8c177afdf34b4f21ef9f9014de140a41f31e32`；
- Master Control 最终复核：Implementation Review `PASS`、Correction Pass `PASS`、Further FIX `not required`；
- BFN-IR 保持 `2.2`，Workspace IndexedDB structural version 保持 `1`，storage keys 与迁移合同不变；BFN-SIM 保持 `2.1`，既有一阶数值方程不变；
- 独立 dynamic authoring contract 只接受 `hill_activation`、`hill_repression`、`linear_transfer` 与 `independent_inputs` 的稳态响应，不接受 identity、任意表达式、lookup table 或通用 ODE；
- 一个草稿只保存一份 steady-state response source；纯物化器生成一个普通 `BfnFunctionalModule` 的 static 与 first-order dynamic variants，并设置 `activeModelIds.static` 和 `activeModelIds.dynamic`；两份 response 按值一致；
- `tau` 必须为有限正数且单位固定为 `h`；`initialState` 为继承输出单位的有限标量；可选 `timeRangeHours` 满足有限、起点不小于零且终点大于起点；
- authorable uncertainty 仍限于 `not_recorded | none | parameter_interval_envelope`；参数包络要求完整 steady-state 参数区间和 tau 区间，不为 initial state 创建区间；
- 中央 `validateBfnProject()` 只对目标 Output Monitor 可达路径中的 effective `user_defined + dynamic` 模型执行运行合同准入；它重新核对 first-order family、tau、initial state、paired static response、time validity 与 parameter envelope，并以 `dynamic_model_contract_invalid` 阻止非法导入、Workspace 持久化或外部构造对象进入 BFN-SIM；
- static mode 的 dormant dynamic variant 与目标外 malformed module 不触发该错误；Catalog、内置模型和 Designed Sender 不纳入该闸门；
- 目标 Output Monitor 可执行路径中的有向环若包含有效动态用户模块，校验返回稳定的 `dynamic_feedback_unsupported` error 并阻止运行；本批不实现耦合反馈 solver；
- Add to Network 仍是一个 Project edit / Undo unit，只创建模块与必要 registry sidecar，不创建 Edge、Input Source、Output Monitor、Run 或 Signal Pool，不切换 network mode；
- Designed Sender 生产合同与创作界面保持 static-only；Sender/Receiver evidence、Catalog runtime、Port Compatibility、Ideal Edge、Temporal evidence、Inverse Design、Ontology、Signal Pool 与 package dependencies 不在本批扩展范围内；
- correction 定向回归为 11 个文件 / 133 项测试，其中中央 runtime 文件 16/16；完整本地回归为 146 个测试文件 / 1198 项测试全部通过，TypeScript、ESLint、Vite build（303 modules）、changed-file Prettier 与 `git diff --check` 通过；GitHub 当前无 check runs/status contexts/workflow runs，因此只声明 local validation passed，不声明 CI passed；
- 本次 freeze bookkeeping 仅更新正式文档状态，不改变任何生产合同；其新 HEAD 是后续 Batch 12.4 preflight / implementation 的唯一合法 development base。

## Batch 12.4.0 frozen representation boundary

- Batch 12.4.0 BFN-IR 2.3 Dynamic Process Representation：`FROZEN`；Final Review PASS；Further FIX NONE；
- 唯一合法 base：`f444433ee13acbc2a69602550c1163c263b313a5`；
- current project schema：`BFN-IR 2.3`；合法 2.0、2.1、2.2 与 2.3 项目通过中央入口读取为 2.3 deep clone；未知 future version fail closed；
- `BfnAccumulatorDynamicModel` 只保存 input/output Port 引用、有限 initial state、既有 uncertainty method 和通用 model metadata；不保存 `tau`、`steadyStateResponse` 或 `response`；
- `activeModelIds` 明确接受 static-only、paired 和 dynamic-only，至少一个 active ID 必须存在且必须引用同 module 内 mode 匹配的 model；
- accumulator Port 引用必须存在且方向正确；generic IR 不推断 production_rate/concentration、same Entity、Signal Pool identity 或其他 biological contract；
- JSON、localStorage、Workspace Draft 与 Version 无损保存 2.3；历史 snapshot 读取为 2.3 copy 且底层记录不回写；IndexedDB structural version 保持 `1`，storage keys/stores/indexes 不变；
- accumulator 的 inputPortId、outputPortId、initialState 与 active model identity 进入 computation signature；authoring/display/description/position 继续不参与；
- output-reachable effective accumulator 产生稳定 `dynamic_process_runtime_unsupported` error；闸门遵守 target Monitor scope，static-mode dormant accumulator 不触发；
- BFN-SIM 保持 `2.1`；一阶方程、tau semantics、dynamic feedback gate、Temporal evidence、Port Compatibility、Designed Sender、Sender V1.2、Receiver V1.1、Inverse Design 与 Ontology 保持冻结边界；
- Master Control Correction Pass 从 pre-fix head `68dcc00339667d4ea6fa52238074985fda459021` 线性追加：BFN-IR 2.3 现在只接受 `dynamic:first_order` 与 `dynamic:accumulator`，first-order-shaped 和 accumulator-shaped unknown family 均在 parser/import boundary fail closed；
- BFN-SIM-2.1 恢复冻结的全模块 evaluation scope；所有既有 static fallback 与 first-order module 继续进入 `moduleOutputs`，target reachability 只用于新增 accumulator family。off-target accumulator 被跳过且不初始化、不求值、不写输出，target-reachable accumulator 继续由中央 hard gate 阻止；
- 本批没有 accumulator equation、state integration、deferred commit、SIM 2.2、deterministic uncertainty propagation、Signal Pool materializer/UI、feedback solver、degradation/dilution/clearance 或 amount/volume conversion；
- reviewed implementation Head 为 `cb41a6e49829249b5b2fbf44206cfb6436a425bf`；该 Head 是 Batch 12.4.1 的精确 base；本冻结记录不把后续 SIM 2.2 runtime 归入 Batch 12.4.0 scope。

## Batch 12.4.1 frozen runtime boundary

- Batch 12.4.1 BFN-SIM 2.2 Accumulator Runtime：`FROZEN`；Final Review PASS；Further FIX NONE；
- exact legal base：`cb41a6e49829249b5b2fbf44206cfb6436a425bf`；branch：`codex/bfn-sim-2-2-accumulator-runtime`；
- BFN-IR 保持 `2.3`；Workspace IndexedDB structural version 保持 `1`；历史 BFN-SIM 2.0/2.1 payload 按原合同读取，新 run 只生成 BFN-SIM 2.2；
- narrow accumulator 只接受单 input/output、same exact Entity、`production_rate nM/h -> concentration nM` 或 `production_rate uM/h -> concentration uM`、finite non-negative `C0`，以及 `none | not_recorded` uncertainty declaration；
- 执行方程为 `dC/dt = r(t)` 与 `C(k+1) = C(k) + r(k) * deltaT`，采用 left-endpoint sample-and-hold、deferred state commit 和实际 short final timestep；当前 `Ck` 在当前 `r(k)` 影响未来区间前可见，运行时 rate 必须 finite 且非负；
- accumulator uncertainty snapshot 标记为 `deterministic_transform`；只有输出可达路径全部可传播且至少含一个真实 parameter interval source 时才生成网络区间；
- Master Review correction 从 pre-fix Head `8e43a17ac6072721c2c269aef94405f64e1dd4e1` 线性追加：run admission 的 `temporal_execution_unsupported` 只检查 selected Monitor 的 runtime-reachable modules；无 target 的 whole-project audit 继续覆盖所有 Monitor 上游；
- 零参数 identity 即使声明 `parameter_interval_envelope` 也只记录为可执行 `deterministic_transform`；真实 parameter source 要求参数数量大于零且全部区间可执行，上游真实区间仍可经 identity 与 accumulator 传播；
- final persistence correction 从 pre-fix Head `1fd4b60225b90c9e5da41b92eaec77c7c97687c8` 线性追加为 `c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`；SIM-2.2 repository 无损接受 simulator 产生的 `method = parameter_interval_envelope` 与 `propagationMode = deterministic_transform`，并继续拒绝 bootstrap、posterior_samples 与 covariance 的 malformed deterministic-transform 组合；
- output-reachable accumulator 路径记录 terminal value，不声明 finite steady state，并把 steady-state-dependent metrics 标记为 unavailable；
- accumulator feedback 与 accumulator-to-first-order ordering fail closed；first-order-to-accumulator 使用 current first-order output 作为未来积分区间 rate；
- Designed Sender、Catalog Receiver、Port Compatibility、Ideal Edge、Temporal evidence inference、Sender admission、Ontology、Inverse Design、Workspace DB structure、dependencies 与 first-order equation 保持冻结语义；
- Signal Pool authoring/UI/materializer 不属于 Batch 12.4.1 runtime scope；Batch 12.4 独立实现并冻结该创作层。自动图变换、degradation/dilution/clearance、amount/volume、多 rate 求和、initialState uncertainty 与反馈 solver 均不在本批范围。

## Batch 12.4 frozen Signal Pool boundary

- Batch 12.4 Signal Pool Authoring & Integration：`FROZEN`；Correction Review PASS；Further FIX NONE；
- exact base：`c1a350f7f3dfa81f985cd84e7b86dd1292fe2111`；branch：`codex/bfn-signal-pool-authoring-integration`；reviewed production correction：`6150203fe9c75b9acbc308cb782104e80cab22cb`；pre-freeze integrated branch Head：`29b3ec8bdf44f0d0bc39f6da1640d4ece09b27c6`；二者严格区分；
- Add Module 中的 Signal Pool 表单只收集 name、optional description、explicit signal、`nM | uM` concentration scale 与 finite non-negative `C0`；
- known signal 复用 Designed Sender canonical identity，availability 不依赖当前 graph；existing project signal 只接受当前 `concentration | production_rate` Port 已赋予语义的 exact Entity ID，activity-only、expression-level-only 与 registry-only untyped Entity 均不 eligible；custom signal 只增加一个 ordinary `origin = user_defined` Entity，冲突 fail closed；
- UI、draft builder 与 materializer 共用 `collectSignalPoolEligibleEntityIds()`；materializer 重新检查 stale existing selection，并通过 exhaustive runtime dispatch 仅接受 `known | existing | custom`，未知 source 返回 `signal_identity_invalid` 且不改变输入 Project；
- pure materializer 只创建一个由用户显式创建的 ordinary `BfnFunctionalModule`，其 active model 为 dynamic-only、`family = accumulator`，恰好包含 1 个 input 与 1 个 output；同时只创建最小且不虚构科学范围的 ValidityDomain 和必要 custom Entity；evidence 为 `independent_assumption`，uncertainty 为 `none`，Context 为 `null`，Implementation 为 `unspecified`；
- Port 固定为同 Entity 的 `production_rate nM/h -> concentration nM` 或 `production_rate uM/h -> concentration uM`；每个结果通过既有中央 accumulator runtime contract；
- Add 是一个原子 Project edit / Undo/Redo transaction，不创建 Edge、Input Source、Output Monitor 或 Run，不自动连线、插入或切换 network mode；static target path 继续由 `temporal_execution_unsupported` 阻止；
- JSON、localStorage、Workspace Draft/Version 无损保存 dynamic-only model、Entity、units、initialState 与 authoring metadata；Workspace DB version 保持 `1`；
- production materializer 已进入 constant-rate、上游 parameter envelope 与 Designed Sender→Signal Pool→Catalog Receiver 集成回归；当前 Receiver 读取 `Ck`，不存在未来浓度泄漏；
- BFN-IR 2.3、BFN-SIM 2.2、accumulator/first-order equations、mixed ordering、feedback、Designed Sender、Catalog Receiver、Port Compatibility、Ideal Edge、Temporal evidence、Sender admission、Ontology、Inverse Design、Workspace DB 与 dependencies 保持既有边界；
- pure accumulation only；degradation、dilution、clearance、decay、half-life model、amount state、compartment volume conversion、multiple production-rate inputs、automatic rate summation、initial-state uncertainty、feedback ODE solver、accumulator→first_order、automatic Signal Pool insertion、automatic graph rewiring、automatic network mode switch、automatic simulation run 与 reusable User Module Library 均为 NOT IMPLEMENTED / NOT FROZEN AS CAPABILITY。

## Unified Batch 12.4 freeze checkpoint

- 本次 docs-only bookkeeping commit 建立 Batch 12.4.0、12.4.1 与 12.4 的统一 freeze checkpoint，不修改 production、test、fixture、source data、runtime 或 package dependency；
- Existing Signal v1 eligibility 冻结为：当前 Project 至少一个 Port 同时满足 exact `port.entity = selected Entity` 且 `port.quantityType` 为 `concentration | production_rate`；activity-only、expression-level-only 与 registry-only untyped Entity 均不 eligible；Known AHL/HSL canonical path 不依赖当前 graph，Custom signal 继续由用户显式创建；
- Signal Pool materializer 的 source discriminator 只接受 `known | existing | custom`；未知 `signal.source` fail closed，不 silently fallback；
- Edge 原则保持：**Edge = instantaneous, lossless, identity propagation only.** Edge 不积分 rate；`production_rate -> concentration state` 只由显式 Signal Pool Functional Module 完成；
- Designed Sender 保持独立的 static/quasi-static FunctionalModule，执行 `control concentration -> production_rate`；Signal Pool 执行 `production_rate -> concentration state`；二者不合并为一个模块；
- 本冻结不修改 Sender source、loader、validator、admission、evidence counts 或 research records，也不把 Signal Pool capability解释为任何 Sender evidence record 的 runtime authorization；
- 最终 correction 的 Master-reviewed LOCAL validation evidence 为：18 个定向测试文件 / 150 项测试通过，完整 158 个测试文件 / 1310 项测试通过，typecheck、lint、build（309 modules transformed）、changed-file Prettier 10/10 与 `git diff --check` 通过；
- 该 candidate 的 GitHub evidence 为 workflow runs 0、check runs 0、status contexts 0；No CI claim，aggregate `pending` 不表示 active CI；
- Batch 12.5 Reusable User Module Library 保持 `PLANNED / NOT AUTHORIZED`，Batch 13 保持 `FUTURE`；本任务不启动后续实现。

## 2026-09-02 Batch 12.5.0 Reusable Module Template Representation Contract

- 本批从唯一合法 base `2d55b3b92c474bf70a2a28fe957590eb2345168c` 创建分支 `codex/bfn-module-template-representation-contract`；首轮 implementation candidate Head 为 `42bafecf908f3ba11d50b840a0b35f495266d919`。Correction Pass 从该精确远端 Head 线性追加，不创建新分支，不改写已评审历史；
- 独立 `BFN-MODULE-TEMPLATE 1.0` schema 将 metadata、immutable version envelope 与 normalized scientific payload 分开，严格区分 `static | first_order | accumulator`。parser 对 runtime `unknown` 执行 exact-shape、plain-data-tree、local-reference、class、canonical Entity 和 payload-signature 校验，统一失败码为 `BFN_MODULE_TEMPLATE_SCHEMA_INVALID`；
- pure capture 只接纳 BFN-IR 2.3 中非 demo 的 `user_defined` module，覆盖当前受支持 static families、paired first-order 与 accumulator；dormant model、active dataset、model catalog reference、缺失依赖和不完整科学合同均 fail closed；
- deterministic template-local keys 消除 source project-local IDs，并完整闭包 Context、ValidityDomain、Provenance 与 Implementation。canonical Entity 由 AHL/HSL resolver 精确复核，private ordinary user-defined Entity 由显式 policy 选择 embedded 或 slot，共享/外部引用 Entity 强制为 slot；
- pure instantiation 要求每个 slot 提供 `same_scientific_entity` 决策，使用统一 ID map 创建一个独立 module 及最小 sidecars；ID 冲突、canonical 失配、引用失配、BFN-IR 2.3 失效或 projection 差异均 fail closed。操作不创建 Edge、Input Source、Output Monitor、Run、lineage 或持久化记录；
- ID-independent scientific projection 完整覆盖 ports、Entity semantics、active models、parameters、Context、ValidityDomain、Provenance、evidence、uncertainty 与 selected Implementations；presentation metadata、project/template/instance IDs 和 position 不参与 equality。payload signature 使用本地确定性非加密 fingerprint，对 property order 与 ID 重分配稳定，对科学字段变化敏感；
- 新增合同定向门为 4 个测试文件、84 项测试全部通过；最终完整 `npm test -- --maxWorkers=4` 为 162 个测试文件、1394 项测试全部通过。Windows 默认 checkout 的早期候选首轮为 161/162 文件、1380/1381 项，唯一失败是冻结 Sender source 换行字节清单；按既有 manifest 临时物化 12 个文件后最终全量通过，`finally` 已逐字节恢复且 Sender source diff 为零；
- `npm run typecheck`、`npm run lint` 与 Vite 7.3.6 production build 全部通过；build 转换 309 个模块，主 CSS 为 279.02 kB（gzip 46.50 kB），主 JavaScript chunk 为 3,378.07 kB（gzip 468.90 kB），保留既有大于 500 kB chunk 提示；20 个 changed files 通过 Prettier check 与 `git diff --check`；
- BFN-IR 保持 2.3，BFN-SIM 保持 2.2，Workspace IndexedDB structural version 保持 1；没有修改冻结 materializer/runtime/scientific files、Workspace、package dependencies、UI 或 i18n；
- Correction Pass 要求 distinct template Entity keys 到 concrete Project Entity IDs 的映射保持单射：slot-slot、canonical-slot 与 duplicate-canonical convergence 均 fail closed，instance projection 不用 local-key ordinal 掩盖关系塌缩；
- Template accumulator 现在精确要求 model/module `evidenceGrade = independent_assumption` 且 model `uncertaintyMethod = none`，不修改冻结 accumulator runtime 或 Signal Pool materializer；
- 新增 template-local Project runtime preflight；capture/instantiate 对 malformed first-order、ValidityDomain、Dataset、module 与 dependency records 稳定返回错误。selected module 必须唯一，Context、ValidityDomain、Provenance 与 Implementation 引用必须解析到唯一 registry record；
- targeting selected module 的 Calibration Map 返回 `calibration_map_unsupported`；unrelated maps 不进入 closure。目标 Project 的 Edge、model、module、ValidityDomain、Dataset 与 Calibration Map 引用 ID 全部进入 collision reservation，generated IDs 不会把既有 dangling reference 变为 resolved；
- correction 定向回归为 4 个测试文件、112 项测试全部通过；最终 manifest-protected `npm test -- --maxWorkers=4` 为 162 个测试文件、1422 项测试全部通过。首次默认 checkout 完整运行中的 3 个既有 UI timeout 已按原测试单独复核为 3 文件、42 项通过；Sender source 在最终全量期间按 manifest 临时物化，`finally` 后 12 个文件逐字节恢复且 source diff 为零；
- `npm run typecheck`、`npm run lint` 与 Vite 7.3.6 production build 全部通过；build 转换 309 个模块。Correction 只修改 Template 目录和三份授权文档；BFN-IR 2.3、BFN-SIM 2.2、Workspace DB 1、冻结 runtime/materializer、dependencies、UI 与 i18n 保持零差异；
- Batch 12.5.0 状态为 `CANDIDATE` correction implementation complete，not `FROZEN`，等待 Master Control re-review。Batch 12.5.1 与 Batch 12.5 保持 `PLANNED / NOT AUTHORIZED`。

## 2026-09-03 Batch 12.5.1 Local Versioned Module Library Persistence

- 本批从 exact base `d7fdcbf13ec8847ec9480085756dfaf184c35331` 创建分支 `codex/bfn-local-versioned-module-library`，不从 `main` 或 Batch 12.4 freeze checkpoint 分支，不改写已评审历史；
- Phase 0 在 Template representation 层补齐 source identity normalization：distinct slot records 的 `sourceEntityId` 必须唯一，production AHL/HSL resolver 已识别的 Entity ID 必须使用 canonical mode，canonical-as-slot 无法通过 parser 后以 `create_same_entity` 实例化；不同 slot、正常 canonical 与共享 noncanonical slot 路径保持有效；
- Phase 1 使用独立 IndexedDB `fluorescence-desktop-bfn-module-library` structural version `1`，对象仓库严格为 `templates` 与 `versions`；Workspace database、stores、indexes 与 structural version 均不改变；
- `BfnModuleLibraryRepository` 分离 metadata 与 immutable `BfnModuleTemplateVersionV1`，支持 create/get/list、metadata update、same-signature no-op、transactional N+1 scientific revision 与 metadata/version cascade delete；历史版本只用 `add` 写入，不原位覆盖；
- localStorage fallback 使用独立 key `fluorescence-desktop.bfn-module-library.v1` 和 exact versioned envelope，在同一 runtime 的共享 `Storage` 实例上串行化操作并保持相同 observable semantics；
- 每次读取完整 snapshot 并通过既有 strict metadata/template parser；schema、identity、revision、payload、signature、orphan、gap、latestRevision 和 envelope corruption 均 fail closed，不修复或推断科学字段；
- metadata 返回独立 clone，version 返回独立 deep-frozen clone；Project instantiation 保持 copy-on-create，repository 不保存 Project ID、不修改 Project、不创建 graph linkage，也不参与 Project load/run；
- repository 定向契约为 1 个文件 / 50 项测试通过，覆盖 IndexedDB/localStorage parity、corruption injection、Workspace isolation 与双仓库并发 revision allocation；Phase 0 Template 定向门为 4 个文件 / 118 项测试通过；
- 默认 Windows checkout 的首次全量为 162/163 个文件、1477/1478 项通过，唯一失败为冻结 Sender source 的物理换行字节与 manifest 不一致；按 manifest 临时物化后，最终 `npm test -- --maxWorkers=4` 为 163/163 个文件、1478/1478 项通过，`finally` 后 12 个 Sender 文件逐字节恢复并验证，source diff 为零；
- `npm run typecheck`、全项目 `npm run lint` 与 Vite 7.3.6 production build 通过；build 转换 309 个模块，保留既有大于 500 kB chunk 提示；14 个 changed files 通过 Prettier，`git diff --check` 通过；
- 相对 exact base 的 14 个文件全部位于授权 Template/Module Library 与文档范围；BFN-IR、BFN-SIM、Workspace、accumulator、Compatibility/unit、Signal Pool、Designed Sender/Receiver、Temporal、Ontology、Inverse Design 与 package dependencies 零差异；
- 本批没有新增依赖、UI、i18n、library import/export、cloud sync 或 Batch 12.5 主 workflow。Batch 12.5.1 保持 `ACTIVE`、not `FROZEN`，不声明 Master Review PASS。

## 2026-09-03 Batch 12.5 Reusable Module Library User Workflow

- 本批从 exact base `1d59a144e03eea4cdce70b3889936cd3e2e20f74` 创建分支 `codex/bfn-reusable-module-library-workflow`，线性继承通过审阅的 Template 1.0 与本地版本仓库，不改写 12.5.0 / 12.5.1 历史；
- 选中受支持的用户模块后，Inspector 提供“保存到模块库”；Dataset、Calibration Map、缺失依赖、dormant model 或不完整科学定义以自然文案阻止保存，不把内部失败码展示给普通用户；
- 保存流程要求用户显式选择新模块或已有模块。相同科学签名保持 no-op，科学定义变化追加不可变版本，名称和描述编辑只更新 metadata；模块名称从不用于自动关联；
- “添加模块”抽屉把“我的模块”置于首位。宽屏工作区采用左侧紧凑列表与右侧可滚动科学详情，显示输入输出、模型、参数、适用条件、证据、不确定性和版本历史，不显示 raw JSON、内部 ID 或存储实现术语；
- canonical Entity 自动解析，模块私有 Entity 默认随模块定义保存，共享 noncanonical Entity 在添加时要求逐项选择新建或 exact existing Entity，并确认同一科学身份。所有确认完成前主操作保持禁用；
- 添加到项目继续调用 Template 1.0 的纯实例化路径，只创建一个独立模块副本和其必要科学记录；不创建 Edge、Input Source、Output Monitor、Signal Pool 或 Run，不切换网络模式，不建立 Project–Library 实时关联；
- 元数据编辑不创建科学版本。删除操作通过现有确认对话框一次删除模块及全部历史版本；已经加入项目的独立副本保持不变。损坏记录进入友好的只读错误状态，不自动修复或推断；
- UI 复用现有 `Button`、`Icon`、`ConfirmDialog`、抽屉、表格、表单和主题 token；中英文 key 保持一致，长名称、独立滚动、键盘焦点、禁用原因与非颜色错误提示均纳入样式和测试；
- 新增工作流定向测试为 3 个文件 / 65 项通过；Template 回归 4 个文件 / 118 项通过；Repository 回归 1 个文件 / 50 项通过；相关 BFN UI 与 i18n 回归 12 个文件 / 114 项通过；
- manifest-protected 完整 `npm test -- --maxWorkers=4` 为 166/166 个文件、1543/1543 项通过；12/12 Sender source 在 `finally` 后逐字节恢复且 source diff 为零；`npm run typecheck`、`npm run lint` 与 Vite 7.3.6 production build 通过，build 转换 332 个模块；
- 本批不新增 package dependency，不改变 BFN-IR 2.3、BFN-SIM 2.2、Workspace DB 1、Ideal Edge、Port Compatibility、unit、Accumulator、Signal Pool、Designed Sender、Sender/Receiver、Temporal、Ontology 或 Inverse Design 合同。Batch 12.5 状态为 `CANDIDATE / implementation complete / awaiting Master Review / not FROZEN`。

## 2026-09-03 Batch 13.0 Network Interpretation Contract

- 当前 Master Control 状态统一记录为：Batch 12.5.0 `Master Review PASS / CANDIDATE / not FROZEN`；Batch 12.5.1 `Master Review PASS / CANDIDATE / not FROZEN`；Batch 12.5 `Master Correction Review PASS / CANDIDATE / not FROZEN`。统一 freeze 继续暂缓；
- 本批从 exact reviewed base `5b12d37ecffee8a0445ddf02d9c64d17e71a50a0` 创建分支 `codex/bfn-network-interpretation-contract`，不从 main 或旧 candidate/freeze 分支启动，不改写已评审历史；
- 独立 `BFN-INTERPRETATION 1.0` 将 operating point、local differential gain、log elasticity、applicability、Evidence inheritance 和 local ANN weight/bias 定义为 derived interpretation；Edge 继续只承担 instantaneous、lossless、identity topology；
- `BfnLocalInfluenceRequestV1` 使用 exact module/port identity、完整输入工作点和 Port exact unit。纯 `assessBfnLocalInfluenceRequest()` 对缺失、重复、多余、output/unknown port、单位错误、非有限值、负值、模型冲突与适用域执行 deterministic fail-closed admission；
- static interpretation 只解析 active BFN static response。paired first-order 标为 steady-state static interpretation；Accumulator / Signal Pool 没有普通 static response，明确拒绝。Catalog reference 只保留来源和映射 identity，不从来源参数建立第二套 interpretation equation；
- ValidityDomain 使用闭区间并区分 `within_recorded_domain / applicability_not_recorded / outside_recorded_domain`；域外阻断正式结果，未记录范围不解释为 unbounded。结果只继承 active model 的 version、Evidence grade、uncertainty、Context、ValidityDomain 与 model provenance，Implementation-only provenance 不进入 model Evidence；
- 当前合同只使用 nominal parameter value，规定 analytic derivative only。Derivative calculator、network propagation、dynamic/frequency analysis、uncertainty propagation、analysis UI、i18n 与 persistence 均未实现，分别保留给 Batch 13.1–13.4 或后续独立合同；
- Batch 13.0 定向合同测试为 1 个文件 / 40 项通过；相关 BFN 合同、static runtime、first-order、Accumulator / Signal Pool、Compatibility / unit、Template 与 Module Library 回归分别为 5/92、5/57、6/59、6/43、3/36、4/118 与 4/120，全部通过；
- manifest-protected 完整 `npm test -- --maxWorkers=4` 为 167/167 个文件、1588/1588 项通过；12/12 Sender source 在 `finally` 后按原工作树 byte hash 恢复且 source diff 为零；`npm run typecheck`、全项目 `npm run lint` 与 Vite 7.3.6 production build 通过，build 转换 332 个模块并保留既有大 chunk 提示；7 个 changed files 通过 Prettier 与 `git diff --check`；
- frozen-boundary audit 确认 7 个变更文件只位于授权 interpretation/docs 范围；BFN-IR、BFN-SIM、Workspace、Ideal Edge、Compatibility/unit、static/first-order/Accumulator/Signal Pool runtime、Designed Sender、Receiver、Temporal、Ontology、Inverse Design、Template、Module Library 与 package dependencies 相对 exact base 零差异；
- BFN-IR 保持 2.3，BFN-SIM 保持 2.2，Workspace IndexedDB structural version、Module Library IndexedDB version 与 fallback schema version 均保持 1，Module Template 保持 1.0；package dependencies、现有 static/dynamic/accumulator runtime、ANN range-fit thresholds、UI 和 storage 零语义变更；
- Batch 13.0 original reviewed candidate `0717b51ae4f659dab7a91dd42444734895eedd3d` 的状态为 `Master Review FIX / CANDIDATE / not FROZEN`。后续 correction 与 Batch 13.1 实现记录见下一节；Batch 13.2、13.3 与 13.4 保持 `PLANNED / NOT AUTHORIZED`。

## 2026-09-03 Batch 13.0 Correction + Batch 13.1 Static Local Influence Analysis

- 合并任务分支 `codex/bfn-static-local-influence-analysis` 从 exact reviewed candidate `0717b51ae4f659dab7a91dd42444734895eedd3d` 线性创建；Phase 0 correction checkpoint 为 `510ce360eadaec47d373632aaf20388704bb63ad`，parent 为 exact base。没有 merge、rebase、squash、reset 或历史改写；
- Phase 0 将 identity admission 固定为 input/output 的 Entity、quantity type 与 unit 三者完全一致；equal unit 不建立 scientific identity。`module_static_response` v1 同时要求 exactly one output，因为当前 static response representation 没有 explicit output binding；
- Phase 1 新增 pure `calculateBfnLocalInfluence()`：先执行 BFN-INTERPRETATION 1.0 admission，再用 production nominal static evaluator 计算工作点 output，并为 Hill activation/repression、linear transfer、identity 与 independent inputs 提供解析局部偏导；clamp boundary、零点与 non-finite 语义均 fail closed，不引入 numerical derivative fallback；
- selected-module Inspector 新增“分析输入作用…”入口和右侧科研 Drawer。分析值初始为空、单位固定、条件 ephemeral；结果展示当前输出、作用方向、局部响应增益、相对敏感度、适用性与继承的 model Evidence。域外不生成正式结果，未记录范围在结果旁明确说明；first-order 只解释稳态响应，Accumulator / Signal Pool 以自然原因禁用；
- Phase 0 定向合同为 1 个文件 / 44 项，相关 BFN 合同为 5 个文件 / 92 项，Template identity 为 4 个文件 / 118 项，均通过；Batch 13.0 + 13.1 联合专项为 5 个文件 / 90 项通过，其中 calculator 与 presentation 为 36 项，UI 为 9 项，locale parity 为 1 项；
- 显式 regression 分组为 static/first-order/runtime 9 个文件 / 100 项、Accumulator / Signal Pool 10 个文件 / 78 项、Compatibility / Template / Module Library 13 个文件 / 306 项、ANN / thresholds 4 个文件 / 72 项、BFN UI / i18n 13 个文件 / 57 项，全部通过；
- manifest-protected final `npm test -- --maxWorkers=4` 为 170/170 个文件、1637/1637 项通过。12 个 Sender immutable source 按清单临时选择 8 个 Git blob 与 4 个工作树字节，`finally` 后 12/12 恢复运行前 bytes、逐文件 hash 相同且 Sender source diff 为零；
- `npm run typecheck` 与全项目 `npm run lint` 通过；Vite 7.3.6 production build 转换 337 个 modules，主 CSS 296.67 kB（gzip 48.81 kB），主 JavaScript chunk 3,545.47 kB（gzip 510.88 kB），保留既有大于 500 kB chunk 提示；
- 真实运行界面完成 supported single-input、multi-input、outside-domain 与 Accumulator unsupported 四态截图审计；console warning/error 为 0。UI 保持紧凑科研桌面布局、表格/数值/单位对齐，不展示公式、raw ID、enum 或 internal issue code；
- frozen-boundary audit 保持 BFN-IR 2.3、BFN-SIM 2.2、Workspace DB 1、Ideal Edge、Port Compatibility、BfnUnit、static/first-order/Accumulator/Signal Pool runtime、Designed Sender、Sender/Receiver、Temporal、Ontology、Inverse Design、Template 1.0、Module Library Persistence 1.0、`annApproximation.ts`、`analysis.annThresholds` 与 package dependencies 零差异；
- Batch 13.0 Correction 为 `CANDIDATE / correction implementation complete / awaiting Master Correction Review / not FROZEN`。Batch 13.1 为 `CANDIDATE / implementation complete / awaiting Master Review / not FROZEN`。本节只记录 local validation，不声明 PASS、FROZEN 或 CI passed。

## 2026-09-04 Batch 13.1 Correction + Batch 13.2 Network Influence Propagation

- 合并任务分支 `codex/bfn-network-influence-propagation` 从 exact Batch 13.1 original candidate `7c1eec761346f2eba85df052a8ee02067cc95ee0` 线性创建；Phase 0 correction checkpoint 为 `a05375798f09cf3c8d278275970baacc823ccca5`，parent 为 exact base；
- Phase 0 使 Hill activation/repression 与 independent-input Hill term 的 derivative 在零点分类、幂运算和系数中统一使用 production `safeK/safeN`。`responseMath.ts`、生产 response 语义、BFN-IR、BFN-SIM 与 dependencies 零改动；
- Phase 1 新增 pure `assessBfnNetworkInfluenceRequest()` 与 `calculateBfnNetworkInfluence()`。结构准入只沿 selected Output Monitor 的 enabled active-response closure 解析，必要输入要求 exactly one incoming Edge；目标外环路、坏模块和无关 Input Source 不阻断当前目标；
- 工作点按目标闭包拓扑顺序传播，每个 Module 委托 `calculateBfnLocalInfluence()` 取得 production output、analytic local gains、applicability 和 model evidence。总体作用使用 per-source forward sensitivity propagation；branch/convergence 通过局部偏导和式组合；
- compatible unit conversion 沿用 frozen `convertUnit()`，内部 coordinate scale 不属于 Edge biological gain。Ideal Edge representation 与 semantics 保持不变，不增加 weight/gain/sensitivity；
- 特定 module input 的 upstream sensitivity 为精确零时，local derivative unavailable 不污染该 external source；非零 upstream sensitivity 遇到 unavailable derivative 时仅阻断该 source，其他 source 结果保持可用；
- target closure 包含 Accumulator / Signal Pool 或 feedback 时自然 fail closed。paired first-order 路径只解释 steady-state response，不描述时间过程；direct Input Source → Output Monitor 支持同科学量的单位坐标传播；
- 任一相关 Module 域外时阻断正式 network result，并保留 module/input/current/range。部分相关模型没有 recorded range 时保留结果并聚合为 `applicability_not_recorded`；
- Result 按 Project Input Source order 返回 current output、总体响应增益、exact-sign direction 与相对敏感度，并逐模块保留 Evidence、uncertainty method、model provenance、Context、ValidityDomain 与 interpretation basis；不创建 synthetic network Evidence grade，不做数值 uncertainty propagation；
- selected Output Monitor Inspector 增加“分析网络作用…”入口和右侧科研 Drawer。只显示目标相关外部输入，预填仅接受 static fixed value / dynamic constant；输入编辑清除旧结果，关闭后丢弃 ephemeral 条件并恢复焦点；
- 当前 path contribution breakdown 未实现；总体作用完整来自 forward sensitivity propagation。Batch 13.3 的后续实现记录见下一节；Batch 13.4 保持 `PLANNED / NOT AUTHORIZED`；
- Phase 1 初始定向门为 5 个文件 / 49 项通过，最终全量测试、构建、截图、frozen-boundary 与 GitHub 状态在提交前后按实际结果补充。本节不声明 CI passed、Batch 13.1 correction PASS、Batch 13.2 PASS 或 FROZEN。

Batch 13.0 与 Batch 13.1 均已通过 Master Correction Review，状态保持 `CANDIDATE / not FROZEN`。Batch 13.2 original candidate `f3da7c9277976ba60526a28ddb3dda7b30fb9a49` 的 Master Review 结论为 `FIX`。

## 2026-09-05 Batch 13.2 Correction + Batch 13.3 Local ANN Approximation

- 合并任务分支 `codex/bfn-local-ann-approximation` 从 exact Batch 13.2 original candidate `f3da7c9277976ba60526a28ddb3dda7b30fb9a49` 线性创建；Phase 0 correction checkpoint 为 `f62babfa2af09156c711792d362fab687270f42c`，parent 精确为 exact base；
- Phase 0 将 Input Source prefill 收紧为 specification/port unit exact equal；兼容量纲的不同单位保持空白。成功 network result 新增 `target_relevant_module_edges` Context snapshot，每条相关 Module→Module Edge 复用既有 Context applicability state/checks。mismatch、uncertain 与 unavailable 继续 non-blocking，并以自然 caveat 跟随结果；
- Phase 1 新增 independent `BfnLocalAnnApproximationRequestV1/ResultV1`。calculator 只委托 corrected `calculateBfnNetworkInfluence()`，直接采用 Batch 13.1 local differential gains 作为 module weights、Batch 13.2 total differential gains 作为 overall weights，并分别从同一工作点的 current output 计算 module/network affine bias；
- 完整 local ANN approximation 要求所有 relevant module active inputs 均有 finite analytic local gain。域外、Accumulator / Signal Pool、feedback 与 incomplete local linearization 均 fail closed；direct transmission 保持空 module approximation；first-order 只采用 steady-state response；
- selected Output Monitor Inspector 提供“神经网络近似 / 生成神经网络近似…”入口。Drawer 展示 relevant current conditions、overall weights、近似偏置、current output、local-only boundary、紧凑 module table、Context/ValidityDomain caveat 与折叠 Evidence basis；中英文 key 保持 parity；
- 成功结果在 existing canvas 上启用 ephemeral read-only overlay。weight identity 绑定 downstream module/input，`edgeId` 仅作定位；完整 unit 在 Drawer 与 accessible label 中可见。Canvas 保持原 topology 与 positions，不重排为 MLP，不以线宽、发光、热图或颜色强度表达 magnitude；
- condition edit、Drawer close 与 Project switch 清除 result/overlay 并回到 Biological Network view。Project、Module、Input Source specification、Edge、Workspace、Module Library 与 persistence 均不修改；
- 既有 `annApproximation.ts`、`BfnAnnApproximation`、R²/NRMSE、accepted/rejected 与 `analysis.annThresholds` 保持完全隔离；BFN-IR 2.3、BFN-SIM 2.2、Workspace DB、Ideal Edge、Port Compatibility、BfnUnit、production response equations、first-order/Accumulator/Signal Pool runtime、Sender/Receiver、Temporal、Ontology、Inverse Design、Template、Module Library persistence 与 dependencies 不在实现范围内。
- Phase 0 最终解释层回归为 9 个测试文件 / 144 项通过；Phase 1 calculator、presentation、overlay、canvas 与 UI 为 6 个测试文件 / 48 项通过；扩展 BFN 回归为 40 个测试文件 / 618 项通过；
- manifest-protected 完整 `npm test -- --maxWorkers=4` 为 178/178 个测试文件、1745/1745 项通过。Sender 临时物化选择 4 个工作树字节版本与 8 个 raw Git blob，`finally` 后 12/12 恢复且 source diff 为零；
- `npm run typecheck`、全项目 `npm run lint`、changed-file Prettier 与 Vite 7.3.6 production build 全部通过；build 转换 347 个 modules，主 CSS 为 301.10 kB（gzip 49.44 kB），主 JavaScript chunk 为 3,609.20 kB（gzip 524.26 kB），保留既有大于 500 kB chunk 提示；
- 真实界面审计覆盖 single-input、multi-input、branch/convergence、first-order steady-state、Context mismatch、applicability not recorded、local linearization unavailable 以及 Biological Network / ANN Approximation 对照八类状态；console error 为 0；
- frozen-boundary audit 确认受保护合同与 runtime 相对 exact base 零差异；`annApproximation.ts`、`types.ts`、`responseMath.ts` 与 `unitSystem.ts` 的 Git blob 分别保持 `37987c348f5a7c07990af7ed8d00badba1e879d8`、`4e7600f42c57e10f47255c5a91b6072427458a8d`、`f67457cba17daed00b3b47b9686f6ca6a1a7579c` 与 `1a789ebe55a9dbc877d2e823aff80d81269063db`。

正式状态台账：

```text
Batch 13.0
= Master Correction Review PASS
= CANDIDATE
= not FROZEN

Batch 13.1
= Master Correction Review PASS
= CANDIDATE
= not FROZEN

Batch 13.2
= Master Correction Review PASS
= CANDIDATE
= not FROZEN
reviewed correction = f62babfa2af09156c711792d362fab687270f42c
original candidate = f3da7c9277976ba60526a28ddb3dda7b30fb9a49
original Master Review = FIX

Batch 13.3
= Master Review PASS
= CANDIDATE
= not FROZEN
reviewed implementation = e0ce3a1cee0eff68a28a40edb4bfbd8a66ac3f44

Batch 13.4
= CANDIDATE
= correction implementation complete
= awaiting Master Correction Review
= not FROZEN
original candidate = 11f931ef0bbdeb031f5b337dcf22a9b600fbacfc
original Master Review = FIX
```

## 2026-09-06 Batch 13.4 Dynamic Influence Analysis Correction

- correction 从 exact reviewed candidate `11f931ef0bbdeb031f5b337dcf22a9b600fbacfc` 建立；Phase 0 bookkeeping commit `49854bd0146a2cd60da171ff9b0d51b9f6f0e3ba` 保持不变；
- static-only target 作为 quasi-static special case 支持，结果对 period 不敏感；input prefill 直接委托 Batch 13.2 exact-unit fixed-value/constant contract；
- per-source `dcGain` 直接取自同一 Batch 13.2 `totalDifferentialGain`，UI 以保留符号的“慢变化作用”显示，并与当前周期响应幅度、相位关系并列；
- Batch 13.4 在 complex propagation 前执行 complete local dynamic linearization gate，任一 relevant active input derivative unavailable 即整体 fail closed，包含 zero-upstream case；Batch 13.2 partial-source containment 未修改；
- Drawer 增加折叠“动态模块明细”，逐 input 显示瞬时/一阶类型、signed local static gain、exact `tau`、current magnitude 与 phase。功能名称统一为“动态作用分析 / Dynamic Influence Analysis”；
- Batch 13.2 helper carries a reason-classification adjustment from the reviewed 13.4 candidate; no supported-network semantics changed；
- complex representation、first-order/static transfer、unit propagation、branch/convergence、phase normalization、Accumulator/feedback gates、Context/ValidityDomain、purity 与 ephemerality 保持原 reviewed core。
- correction targeted regression 为 15 个文件 / 185 项通过；manifest-protected full suite 为 185/185 个文件、1789/1789 项通过，Sender 8 个 raw Git blob 临时物化后 12/12 恢复且 source diff 为零；
- `npm run typecheck`、全项目 `npm run lint`、Vite 7.3.6 production build、changed-file Prettier 与 `git diff --check` 通过。build 转换 352 个 modules，保留既有大 chunk warning；冻结 blob 与 package manifests 相对 exact correction base 零差异。

本轮最终状态仅为 `CANDIDATE / correction implementation complete / awaiting Master Correction Review / not FROZEN`，不声明 PASS、CI passed、unified freeze 或 FROZEN。

## 2026-09-06 Batch 13.4 Original Dynamic Gain Analysis Candidate

- Phase 1 从 exact base `e0ce3a1cee0eff68a28a40edb4bfbd8a66ac3f44` 继续，Phase 0 review bookkeeping correction 已作为独立 docs commit 完成；
- 新增 `BfnDynamicGainRequestV1/ResultV1`、dynamic gain admission、pure complex helper 与 `calculateBfnDynamicGain()`。calculator 先调用 corrected Batch 13.2 `calculateBfnNetworkInfluence()`，并复用其 target closure、source/module order、baseline output、local static gains、ValidityDomain、Context 与 Evidence；
- quasi-static module 使用 `H = g + 0j`；first-order module 使用 `tau dy/dt = f(x) - y` 与 `H(j*omega) = g / (1 + j*omega*tau)`。`tau` 只读取 exact nominal `tau.value`，不复用 simulation tau floor，不读取 trajectory、duration/timeStep、initialState、run snapshot 或 `dynamicMetrics.frequencyGain`；
- network propagation 只在 relevant target DAG 上传播 complex sensitivity。Edge 仅使用 unit coordinate scale，不拥有 gain、weight、phase 或 dynamic field；exact-zero containment 与 unavailable derivative 传播遵循 Batch 13.2 语义；
- selected Output Monitor Inspector 新增“动态响应分析…” / “Dynamic Response Analysis…”；Drawer 展示周期、baseline conditions、基线输出、dynamic gain magnitude、phase、applicability、Context caveat 与折叠分析依据。UI 不显示 direction column、raw complex terms、internal issue codes、Bode、simulation 或 formula-first 内容；
- 本批不修改 BFN-IR 2.3、BFN-SIM 2.2、Accumulator / Signal Pool runtime、unit enum、response equations、existing ANN range-fit、Local ANN approximation overlay、persistence、export schema 或 dependencies。
- Dynamic-gain focused suite 为 6 个测试文件 / 76 项通过；manifest-protected `npm test -- --maxWorkers=4` 为 183/183 个测试文件、1777/1777 项通过；Sender V1.2 source 在 `try/finally` 中完成临时清单字节 materialization 与 12/12 bytes/hash 恢复，最终 source diff 为零；
- `npm run typecheck`、`npm run lint` 与 `npm run build` 通过。Vite 7.3.6 转换 352 个 modules，主 CSS 为 301.10 kB（gzip 49.44 kB），主 JavaScript chunk 为 3,640.03 kB（gzip 529.87 kB），保留既有 chunk-size warning；
- 浏览器视觉检查覆盖 steady-state disabled reason、dynamic missing-input reason、supported demo Output Monitor workflow、空周期门禁、分析结果、numeric/unit alignment、applicability 与折叠依据。普通 UI 未出现 direction column、raw complex、internal issue code、Bode、simulation 或 formula-first presentation。

以上只登记 Batch 13.4 implementation complete 的本地候选状态；Master Review、CI passed、FROZEN 与 unified freeze 均未声明。

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
7. Batch 12.4.0、Batch 12.4.1 与 Batch 12.4 已通过最终联合复核并统一 `FROZEN`；后续工作必须以本次 docs-only freeze checkpoint 的实际提交 SHA 为唯一合法 development base，实际 SHA 仅在提交后 handoff 中登记。

相关合同：

- [用户定义功能模块科学与计算合同](user-defined-functional-modules.md)
- [用户定义静态功能模块创作与运行](user-defined-static-authoring.md)
- [用户定义一阶动态模块创作与运行](user-defined-first-order-dynamic-authoring.md)
- [Designed Sender 创作与信号产生语义](designed-sender-authoring.md)
- [BFN-IR 2.3 Dynamic Process 表示扩展](bfn-ir-2.3.md)
- [BFN-SIM 2.2 Accumulator Runtime](bfn-sim-2.2-accumulator-runtime.md)
- [Signal Pool 创作与集成](signal-pool-authoring.md)
- [BFN Module Template 1.0](bfn-module-template-1.0.md)
- [BFN Local Versioned Module Library Persistence 1.0](bfn-module-library-persistence-1.0.md)
- [BFN Reusable Module Library User Workflow](bfn-reusable-module-library-workflow.md)
- [BFN-INTERPRETATION 1.0 网络作用解释合同](bfn-network-interpretation-1.0.md)
- [BFN 网络作用分析](bfn-network-influence-analysis.md)
- [BFN-IR 2.2 端口标签表示扩展](bfn-ir-2.2.md)
- [BFN-IR 2.1 用户模块表示扩展](bfn-ir-2.1.md)
- [时间语义、兼容性与适用性](temporal-and-compatibility.md)
- [Sender Evidence Extension V1.2](sender-evidence-v1.2.md)
