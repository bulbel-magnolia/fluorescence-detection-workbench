# BFN Development State Ledger

- 最后核查日期：2026-08-29
- Repository：`bulbel-magnolia/fluorescence-detection-workbench`
- 当前冻结实现基线：`2a33365c40d4852d2270252560e148b7dc247aaf`

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

Batch 12.0 从 `099294b018d1a6c4644156a9e083edde87570a43` 创建，并经 Master Control 完成实现审核与窄修正复核。`2a33365c40d4852d2270252560e148b7dc247aaf` 是正式审定的实现 Head；本次仅更新状态账本的 freeze bookkeeping commit 不改变该实现基线，其实际 SHA 由 GitHub 提交结果记录，并可作为后续 Batch 12.0.1 的合法起始 ref。

## 当前状态

| Workstream                                      | State   | Branch / commit verification                                                                                                        | Current boundary                                                             |
| ----------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Batch 10 — Temporal Semantics & Compatibility   | FROZEN  | 最终修复 `cca73311de398a68902d1f5af354f346e781c32f`；合同与集成 SHA 见上表                                                          | Port Compatibility、Temporal semantics 和 Context Applicability 冻结         |
| Batch 11 — Sender Evidence & Runtime Admission  | FROZEN  | 最终 checkpoint `099294b018d1a6c4644156a9e083edde87570a43`                                                                          | Sender V1.2 source、loader、validator、admission 与 presentation 冻结        |
| Batch 12.0 — User-defined Module Contract       | FROZEN  | `codex/bfn-user-defined-module-contract`；base `099294b018d1a6c4644156a9e083edde87570a43`；reviewed implementation `2a33365c40d4852d2270252560e148b7dc247aaf` | Authoring contract、representation audit 与测试冻结；无 schema/UI/runtime integration |
| Batch 12.0.1 — BFN-IR Representation Extension | PLANNED | 尚未启动；必须从包含本冻结状态的 bookkeeping Head 创建                                                                              | 单独实现并冻结 BFN-IR schema / migration；不进入 authoring UI                |
| Sender Public Evidence Research                 | FROZEN  | Master Control formal boundary；不据此声明新的 production commit                                                                    | public evidence retrieval phase complete；runtime candidate outputs found: 0 |
| Batch 11.2                                      | FUTURE  | NOT AUTHORIZED；无实施 commit                                                                                                       | 不进入 Sender production runtime                                             |
| Batch 7 — Calibration                           | PLANNED | 尚未启动；无实施 commit                                                                                                             | blocked pending experimental data                                            |
| Batch 12.1 — Static Functional Module Authoring | PLANNED | 尚未启动；无实施 commit                                                                                                             | 等待 Batch 12.0.1 schema / migration 单独审核并冻结                          |
| Batch 12.2 — Designed Sender                    | PLANNED | 尚未启动；无实施 commit                                                                                                             | 等待 12.1 authoring 与 materialization                                       |
| Batch 12.3 — Stateful / Dynamic Custom Modules  | PLANNED | 尚未启动；无实施 commit                                                                                                             | 不由 static user model 自动获得 stateful execution                           |
| Batch 12.4 — Signal Pool / Accumulation         | PLANNED | 尚未启动；无实施 commit                                                                                                             | 负责显式 rate-to-amount/concentration 过程                                   |
| Batch 12.5 — Reusable User Module Library       | PLANNED | 尚未启动；无实施 commit                                                                                                             | 等待稳定 template/version contract                                           |
| Batch 13                                        | FUTURE  | 范围与 SHA 均未建立                                                                                                                 | 不在当前授权范围                                                             |

## Batch 12.0 frozen boundary

- User-defined Functional Module Authoring Contract：`FROZEN`；
- reviewed implementation head：`2a33365c40d4852d2270252560e148b7dc247aaf`；
- BFN-IR remains `2.0` at the Batch 12.0 implementation boundary；
- no authoring UI, materialization, Designed Sender production implementation, Signal Pool or reusable library was authorized in Batch 12.0；
- Computational capability、Evidence basis、Implementation maturity 保持独立；
- `independent_inputs` 的 `independent_unverified` 属于模型层假设，不强制 Evidence basis；
- provenance `provided` 只表示结构记录已提供，不表示科学验证、充分证据、Catalog trust 或 runtime authorization；
- 后续 schema 变化必须作为 Batch 12.0.1 单独实施、审核和冻结。

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
- [时间语义、兼容性与适用性](temporal-and-compatibility.md)
- [Sender Evidence Extension V1.2](sender-evidence-v1.2.md)
