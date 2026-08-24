# BFN V2 UI / UX 重构实施计划

> 状态：执行中。PR 1 审计与规范、PR 2 基础设计系统与文案已完成；后续页面框架与业务工作流按本计划分阶段实施。
>
> 实施原则：小范围、可审查、每阶段可回滚；先基础语义，再页面框架，再业务页面；不擅自修改科学算法或持久化能力。

## 1. 目标与非目标

### 1.1 目标

- 让用户快速识别当前项目、对象、状态、主任务、下一步和科学边界。
- 统一功能模块、理想连接、端口、完整模型、ANN 近似和反向设计术语。
- 建立四级按钮、对象状态、空/加载/错误/禁用/危险操作体系。
- 把 BFN 单一长页面重构为可维护的对象与任务视图。
- 保留现有 BFN-IR 2.0 计算、验证、仿真、ANN 和反向设计行为。
- 在 1440×900、1280×800 和 960×640 下达到定义的可用性。

### 1.2 非目标

- 不在 UI PR 中更改模型方程、参数拟合或反向设计算法。
- 不把荧光检测记录重命名为 BFN 实验数据集。
- 不制造真实实验数据、证据、适用域、负载、串扰、噪声或稳定性。
- 不在未批准时新增 BFN 数据库 schema、云同步或多人协作。
- 不把平台改成浏览器 H5、营销网站或通用 SaaS 仪表盘。

## 2. 实施前产品门槛

| 决策           | 建议默认值                              | 阻塞范围      |
| -------------- | --------------------------------------- | ------------- |
| BFN 产品壳     | 同一桌面应用中的独立 BFN 工作区         | PR 3          |
| 项目数量       | 先支持单本地项目，UI 为未来列表留边界   | PR 3/5        |
| BFN 数据持久化 | PR 5 前仅只读 fixture；另开 schema 设计 | 数据创建/编辑 |
| 模块编辑       | 先只读详情，创建/版本保存单独评审       | PR 5          |
| 候选未知值     | 批准 discriminated union 后实施         | PR 7          |
| 最小编辑器宽度 | ≥1280 完整三栏；960 使用抽屉            | PR 3/4        |

PR 2 不依赖这些决策，可立即实施。PR 3 开始前至少确认产品壳和最小宽度。

## 3. 页面优先级

### P0：先修科学误导和主任务

1. IdealEdge 检查器移除 weight/bias/delay/noise 可见字段。
2. 多输入假设改为“默认独立，输入间交互关系未验证”。
3. ANN 近似与完整模型视觉/文案分离。
4. 每个任务区只保留一个主按钮，并按静态/动态/工作域命名。
5. 重置项目、移除对象、清空记录进入危险操作体系。
6. BFN 页面不再让 BLE 设备状态成为首要上下文。

### P1：完成核心科研工作流

1. BFN 项目概览。
2. 网络编辑器工作站布局。
3. 输入源、静态工作域、动态仿真。
4. 功能模块列表/详情（先只读）。
5. 反向设计三阶段。
6. 适用域、外推、证据、演示和 unknown 的统一呈现。

### P2：增强可维护性和高级工作流

1. 版本与证据详情。
2. 实验数据专用导入与详情（持久化获批后）。
3. 自定义动态时间序列。
4. 运行日志和高级求解设置。
5. 网络列表/多项目能力。

### P3：后续能力

1. 协作与云同步。
2. 真实数据 repository、引用完整性和迁移工具。
3. 可取消 worker 计算或远程长任务。

## 4. PR 1：UI 审计与规范

### 范围

只提交：

- 当前 UI/UX 审计。
- 页面地图。
- 文案词典。
- 组件规范。
- 实施计划。
- 改造前截图。

### 文件

- \`docs/current-ui-ux-audit.md\`
- \`docs/BFN_V2_SCREEN_MAP.md\`
- \`docs/BFN_V2_COPY_DICTIONARY.md\`
- \`docs/BFN_V2_UI_COMPONENT_SPEC.md\`
- \`docs/BFN_V2_UI_IMPLEMENTATION_PLAN.md\`
- \`docs/ui-audit/before/*.png\`

### 验收

- 事实、判断、待确认决策明确分离。
- 覆盖需求指定页面、状态和三档窗口。
- 截图覆盖概览、模块列表/详情、网络、静态、动态、ANN、反向设计。
- 不修改源代码和科学计算。

### 风险与回滚

- 风险低；文档可能随产品决策更新。
- 回滚只涉及 docs 和截图，不影响应用。

## 5. PR 2：基础设计系统与文案

> 实施状态：已完成（2026-08-20）。基础组件、BFN P0 文案、理想连接防回归、危险确认与定向测试已经落地；未改动科学计算和持久化结构。

### 目标

先解决跨页面一致性和科学语义风险，不重排核心页面结构。

### 主要工作

1. 扩展 \`src/theme/tokens.css\`：
   - 中性背景/表面/边界。
   - 标准 action/status/data-series token。
   - 移除新组件对 glow、grid、gradient 的依赖。
2. 扩展现有基础组件：
   - Button 四级体系。
   - StatusBadge（由 StatusPill 演进）。
   - BoundaryNotice。
   - ValidationSummary。
   - EmptyState。
   - InlineFeedback/TaskProgress。
   - ConfirmDialog。
3. 更新 \`PageHeader\` 为可复用标题/状态/动作合同。
4. 统一 \`bfn-zh-CN.ts\` 与 \`bfn-en-US.ts\`。
5. 优先替换：
   - “运行完整模型”。
   - “搜索候选实现”。
   - \`independent_unverified\`。
   - PASS/REJECT。
   - 模糊成功/空状态。
6. 修复隐藏文件输入的本地化 aria-label。

### 预计文件

- \`src/theme/tokens.css\`
- \`src/theme/global.css\`
- \`src/components/PageHeader.tsx\`
- \`src/components/StatusPill.tsx\`
- \`src/components/Button.tsx\`（若当前无统一 Button，则在现有 components 内新增）
- \`src/components/BoundaryNotice.tsx\`
- \`src/components/ValidationSummary.tsx\`
- \`src/components/EmptyState.tsx\`
- \`src/components/ConfirmDialog.tsx\`
- \`src/i18n/locales/bfn-zh-CN.ts\`
- \`src/i18n/locales/bfn-en-US.ts\`
- 对应测试

### 测试

- 四级按钮与 disabled reason。
- 状态同时包含文字和非颜色信号。
- BoundaryNotice 语义。
- ConfirmDialog 对象化文案与焦点。
- 中文/英文 key 对齐。
- IdealEdge 禁词先增加防回归断言。

### 验收

- 每个 BFN task region 只有一个 primary。
- 文案词典中的 P0 词汇进入 UI。
- ANN 已拒绝不使用 error tone。
- 未知不被组件格式化为 0。
- 新组件无独立私有色板。

### 风险与回滚

- 风险：按钮替换影响快照和选择器。
- 缓解：先补语义测试，再替换调用点。
- 回滚：组件与调用点同 PR 回退，不影响领域逻辑。

## 6. PR 3：全局导航与 BFN 页面框架

### 前置确认

- 产品壳。
- 近期单项目/多项目策略。
- 960px 行为。

### 主要工作

1. \`AppShell\` 增加 workspace 概念。
2. 保留荧光检测导航；进入 BFN 后显示 BFN 对象导航。
3. \`TopBar\` 在 BFN 上下文显示项目、版本、保存、验证和演示状态。
4. 创建 BFN 项目概览。
5. 将当前四张大型流程 tab 改为稳定对象/任务导航。
6. 导入、导出、重置进入低频菜单/危险操作。
7. 修复单一 main 地标、breadcrumb 和焦点管理。
8. 定义 section 状态到页面 ID 的可恢复映射；暂不强行引入 URL Router。

### 预计文件

- \`src/app/AppShell.tsx\`
- \`src/app/NavigationRail.tsx\`
- \`src/app/TopBar.tsx\`
- \`src/store/appStore.ts\`
- \`src/pages/ModelingPage.tsx\`
- \`src/features/bfn/BfnWorkspaceShell.tsx\`
- \`src/features/bfn/BfnProjectOverview.tsx\`
- BFN i18n、CSS 和测试

### 测试

- 荧光工作区不受影响。
- BFN 工作区不显示无关设备首要状态。
- 当前 BFN 页面选择可恢复。
- skip link 目标唯一。
- 960 下导航/检查器触发器可键盘操作。

### 验收

- 首屏可见当前项目、对象、状态和主动作。
- 不再先滚过 manifest 和四张大卡才进入任务。
- 导航语义是导航，不是执行按钮。

### 风险与回滚

- 风险：appStore section 状态影响既有页面测试。
- 缓解：保留兼容映射，逐页迁移。
- 回滚：保留原 ModelingPage 入口开关，避免一次删除旧结构。

## 7. PR 4：网络编辑器

### 目标

把现有网络组合重构为桌面科研工作站，不改变网络验证和仿真内核。

### 主要工作

1. 顶部 TaskActionBar：
   - 网络名称、版本、保存、模式。
   - 验证网络 secondary。
   - 运行对应仿真 primary。
2. 左侧 ModuleLibrary：
   - 搜索和筛选。
   - 输入源、功能模块、输出监视器、显式转换模块。
3. 中央 BfnNetworkCanvas：
   - 端口选择和连接状态。
   - 键盘等价操作。
   - 自动单位换算可视与文字。
4. 右侧 ObjectInspector：
   - discriminated union。
   - IdealEdge API 不含传播参数。
5. 底部问题/结果/日志面板。
6. 删除/移除确认说明引用影响。
7. 1280 三栏、960 抽屉。

### 预计文件

- \`src/features/bfn/BfnNetworkCanvas.tsx\`
- \`src/features/bfn/BfnPlatformPage.tsx\`（拆分后逐步缩小）
- \`src/features/bfn/components/NetworkWorkbench.tsx\`
- \`ModuleLibrary.tsx\`
- \`ObjectInspector.tsx\`
- \`IdealEdgeInspector.tsx\`
- \`NetworkIssuesPanel.tsx\`
- BFN CSS、i18n、测试

目录只在组件实际落地时创建，不预建空目录。

### 测试

- IdealEdge 不包含 weight/bias/gain/delay/noise。
- P=(E,Q,U) 显示和校验。
- nM ↔ μM 自动换算文案。
- nM/h → nM 阻断并建议插入积累模块。
- 画布选择、连接、移除和焦点恢复。
- 960 抽屉开关与 Esc。

### 验收

- 网络工作区首屏可用。
- 主动作唯一。
- 连接心智模型是恒等传播。
- 验证问题可定位到对象。

### 风险与回滚

- 风险：画布交互和 selection 状态回归。
- 缓解：先提取选择/检查器，不同时改 validation。
- 回滚：保留现有 \`BfnNetworkCanvas\` 数据接口。

## 8. PR 5：实验数据与功能模块

### 前置确认

- BFN 实验数据/模块 repository 是否获批。
- 只读还是创建/编辑。

### 方案 A：未批准持久化（推荐近期）

- 基于 fixture 建立只读实验数据列表/详情。
- 基于 registry 建立只读模块列表/详情。
- 所有对象显示演示边界。
- 创建、保存和删除动作不显示，不制造假按钮。

### 方案 B：批准持久化

先单独提交领域与数据库设计：

- Dataset、Module、ModelVersion、EvidenceSource、引用关系。
- SQLite migration。
- repository 接口和测试。
- 导入事务、版本和引用完整性。

数据层合并后再开放创建/编辑 UI。

### 页面工作

- 数据列表。
- 七步导入。
- 数据详情。
- 模块列表。
- 模块详情五个标签。
- 响应模型参数表、上下文、适用域、证据和版本。
- 多输入默认独立提示。

### 测试

- fixture 不被写成实验验证数据。
- 导入错误定位到行/列/值。
- 多输入默认独立完整句。
- 无生物实现显示“暂无记录”。
- 版本和来源关系可读。
- 危险删除说明引用对象。

### 风险与回滚

- 最大风险是把检测 repository 复用于不同领域对象。
- 明确禁止通过重命名 DetectionRecord 交付 BFN Dataset。
- schema 变更必须单独 migration、备份和回滚说明。

## 9. PR 6：仿真与 ANN 近似

### 主要工作

1. 静态固定值任务。
2. 静态工作域任务。
3. 动态输入任务。
4. FullModelResultPanel。
5. 外推、适用域和上下文边界。
6. ANN 近似作为静态工作域的显式 secondary action。
7. ANN 来源版本、工作域、采样、W、b、R²、NRMSE、最大误差、状态和对比图。
8. 本地运行记录降低为历史/运行日志。

### 保持不变

- \`simulation.ts\`
- \`annApproximation.ts\`
- \`responseMath.ts\`

仅在发现 UI 与返回类型不一致时另开科学逻辑议题。

### 测试

- 静态单点不出现 ANN。
- 工作域可生成 ANN。
- accepted/rejected 两种结果。
- rejected 不视为运行失败。
- 来源版本和采样信息完整。
- 外推靠近结果。
- 动态 y(t) 为主结果。
- 输入模式切换保持/重置规则。

### 浏览器用例

- 静态 5–20：ANN accepted。
- 静态 0–100：ANN rejected + extrapolation。
- 动态阶跃：完整时间响应 + 81 点摘要。
- 空、运行中（引入异步后）、失败、取消。

### 风险与回滚

- 风险：从自动 ANN 改为显式动作影响使用习惯。
- 缓解：工作域完成后提供明确下一步，不改变计算函数。
- 回滚：保留同一 annApproximation 调用，只调整触发位置。

## 10. PR 7：反向设计

### 前置确认

- 候选指标 unknown 类型。
- 真实设计空间数据来源。

### 主要工作

1. 三阶段 stepper。
2. \(\theta^*\) 目标功能表单。
3. \(\mathbf q\) 生物设计空间与评价偏好。
4. 候选比较表/矩阵。
5. 完整响应、功能参数区间和七维评价。
6. 证据、数据缺口、推荐实验。
7. 综合分只作排序。
8. 演示候选持续标记未构建/未经实验验证。

### 科学类型工作

若获批，单独修改候选指标为 discriminated union：

- measured。
- predicted。
- unknown（missing/unmeasured/mechanism-only）。

这项修改需要领域测试，不与纯布局改动混成一个提交。

### 测试

- \(\theta\) 与 \(q\) 字段分组。
- 缺失信息显示未知。
- 未知不参与错误的零值排序。
- 候选未构建边界。
- 各评价维度可见。
- 约束不可满足错误含下一步。

### 风险与回滚

- 风险：现有排序函数假定全部指标为 number。
- 缓解：先定义 missing policy 和排序策略，再改类型。
- 未确认前仅重构现有演示流程，不伪造 unknown。

## 11. PR 8：可访问性、响应式与发布检查

### 主要工作

- 引入/复用浏览器自动化工具。
- 关键页面 screenshot 测试。
- 键盘流程。
- 对比度。
- 200% 缩放。
- 1440×900、1280×800、960×640。
- 长文本、长 ID、单位换行和表格滚动。
- 弹窗层级、焦点恢复和页面状态恢复。
- 更新 README、architecture、modeling、testing。

### 浏览器覆盖矩阵

| 页面       | normal   | empty | loading | error | disabled | warning/boundary      |
| ---------- | -------- | ----- | ------- | ----- | -------- | --------------------- |
| 项目概览   | ✓        | ✓     | —       | ✓     | —        | demo                  |
| 数据导入   | ✓        | ✓     | ✓       | ✓     | ✓        | validation            |
| 模块详情   | ✓        | ✓     | ✓       | ✓     | ✓        | independent/context   |
| 网络编辑器 | ✓        | ✓     | ✓       | ✓     | ✓        | invalid edge          |
| 静态工作域 | ✓        | ✓     | ✓       | ✓     | ✓        | extrapolation         |
| 动态仿真   | ✓        | ✓     | ✓       | ✓     | ✓        | solver/context        |
| ANN        | accepted | none  | ✓       | stale | ✓        | rejected              |
| 反向设计   | ✓        | ✓     | ✓       | ✓     | ✓        | unknown/unconstructed |

### 发布门槛

- formatter（只针对改动文件）通过。
- lint、typecheck、unit/component/integration 通过。
- production build 通过。
- Rust checks 和桌面构建按改动风险运行。
- 浏览器截图人工审查。
- 无未解释的控制台 error/warning。

## 12. 建议的组件拆分顺序

```text
tokens + Button + Status
  → Boundary / Empty / Validation / Confirm
  → PageTitle / TaskActionBar / ProjectContext
  → BFN Workspace Shell
  → Network Workbench
  → Dataset & Module views
  → Simulation & ANN
  → Inverse Design
  → Browser regression
```

任何阶段如果基础组件 API 需要领域对象才能工作，先以现有 discriminated union 为输入，不复制领域类型。

## 13. 测试策略

### 13.1 单元测试

- 文案映射和状态映射。
- 端口兼容与错误结构。
- unknown 格式化。
- 页面 reducer/section 恢复。

### 13.2 组件测试

- 按钮层级。
- 表单标签/错误。
- 状态和边界。
- 网络检查器。
- 仿真/ANN 条件显示。
- 危险确认。

### 13.3 集成测试

- fixture 项目打开。
- 网络验证 → 静态/动态运行。
- 工作域 → ANN。
- 反向设计 → 候选。
- 导入失败不覆盖当前项目。
- 页面重新加载后恢复本地状态。

### 13.4 浏览器测试

- 真实用户动作，不只检查组件快照。
- 每个主要页面至少 1440 和 1280；网络另测 960。
- 保存 after 截图，与 \`docs/ui-audit/before\` 对照。

## 14. 每个 PR 的固定验证命令

以 package scripts 为准，当前建议：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

格式检查当前有 112 个历史文件失败。每个 PR 应对改动文件运行 Prettier，另开 chore 处理全仓格式基线，不能把 112 个无关文件混入 UI PR。

桌面原生层未变时可复用最近 Rust 基线；修改 Tauri、持久化或原生 API 时必须重新运行 Rust 全套和桌面 build。

## 15. 提交与审查策略

- 每个 PR 只处理一个阶段。
- 每个 PR 内按基础组件、页面迁移、测试、文档形成少量连贯提交。
- 不直接提交 main。
- 不混入无关格式化、依赖升级或科学算法改动。
- 任何领域类型/数据库迁移单独提交并标出回滚。
- 每个阶段汇报 14 项：目标、关键文件、问题、判断、改动、文案、布局、组件、测试、命令、浏览器路径/视口、截图、风险、下一步。

## 16. 阶段一完成后的建议

1. 先由用户确认第 2 节的六项产品决策。
2. 无需等待持久化决策即可启动 PR 2。
3. PR 2 完成后在浏览器中验证现有页面，确保仅语义和基础组件变化。
4. 产品壳确认后实施 PR 3。
5. 网络编辑器作为第一个完整业务页面迁移，以它验证工作区框架和组件规范。
6. 实验数据/模块 CRUD 在 schema 获批前保持只读 fixture，不制造虚假保存能力。
