# BFN V2 UI 组件规范

> 状态：基础层已实现。Button、StatusBadge、BoundaryNotice、ValidationSummary、EmptyState、InlineFeedback、TaskProgress、ConfirmDialog 与 PageHeader 扩展已落地；页面框架和专业数据组件继续按实施计划推进。
>
> 原则：扩展现有组件和 token，不建立平行组件库；不改变科学计算行为。

## 1. 设计目标

组件系统服务三类成本：

- **理解成本**：对象、状态、来源、适用域和证据边界可快速识别。
- **操作成本**：每个任务区有明确主动作、保存状态、验证状态和修复路径。
- **误用风险**：完整模型、ANN 近似、理想连接、外推、默认独立和未知数据在组件层有固定表达。

## 2. 不可破坏的组件级规则

1. \`FunctionalModule\` 是网络和模型页面的核心对象。
2. \`IdealEdgeInspector\` 不接受或渲染 weight、bias、gain、delay、noise、state、transform。
3. 端口组件固定呈现 P=(E,Q,U)。
4. 静态单点结果组件不接受 ANN 结果属性。
5. \`AnnEvaluationPanel\` 只能渲染 \`ANNApproximation\`，不能写回模块或连接。
6. \`IndependentAssumptionNotice\` 固定显示“默认独立，输入间交互关系未验证”。
7. 评价指标组件区分数值、未知、暂无测量和仅机制预测；未知不转成 0。
8. 演示对象通过 \`DemoBoundary\` 显式标记。

## 3. 复用与演进策略

| 现有组件/样式        | 保留能力                   | 阶段二/三演进                                        |
| -------------------- | -------------------------- | ---------------------------------------------------- |
| \`AppShell\`         | 桌面窗口骨架、skip link    | 增加 workspace 模式和项目上下文插槽                  |
| \`NavigationRail\`   | 主导航、图标和 active 状态 | 从荧光 section 导航扩展为工作区切换 + BFN 对象导航   |
| \`TopBar\`           | 全局状态区域               | BFN 工作区改为项目/版本/保存状态，不持续显示设备状态 |
| \`PageHeader\`       | 标题、说明、actions        | 收敛为 \`PageTitleBlock\` + 单一主动作               |
| \`StatusPill\`       | 文本 + 颜色状态            | 扩展标准状态枚举和图标，不允许自由颜色               |
| \`TechnicalDetails\` | 元数据披露                 | 用于高级/低频信息，不能隐藏重要科学边界              |
| \`BfnNetworkCanvas\` | SVG 画布、对象选择、方向   | 保留计算对象与选择模型，重做工作站布局与键盘说明     |
| \`BfnResponseChart\` | 完整响应、区间和近似曲线   | 增加文本摘要、外推区域、输入曲线和图例语义           |
| \`tokens.css\`       | 全局 token 入口            | 新增语义 token，逐步去掉 neon/glow 依赖              |
| \`bfn-platform.css\` | 当前业务布局               | 拆为基础组件样式与 BFN 页面布局，避免继续增长单文件  |

## 4. 视觉 token

### 4.1 色彩角色

保留现有深海军蓝品牌基因，但默认 BFN 工作区采用中性浅色或低对比深色表面。颜色只表达动作、状态和数据系列。

| Token 角色                 | 建议用途                   | 禁止用途             |
| -------------------------- | -------------------------- | -------------------- |
| \`--color-bg-canvas\`      | 应用背景                   | 网格、粒子、装饰渐变 |
| \`--color-bg-surface\`     | 面板、表格、检查器         | 每个字段单独卡片     |
| \`--color-bg-subtle\`      | 分组、hover、只读区        | 高饱和色块           |
| \`--color-text-primary\`   | 标题和主要数值             | 纯白大面积高对比     |
| \`--color-text-secondary\` | 说明、元数据               | 小于 12px            |
| \`--color-border-default\` | 面板和表格边界             | 发光边框             |
| \`--color-action-primary\` | 唯一主动作、选中状态       | 所有按钮             |
| \`--color-signal\`         | 响应/荧光曲线              | 普通导航和卡片边框   |
| \`--color-success\`        | 已验证/已完成/已接受       | 仅靠绿色传达状态     |
| \`--color-warning\`        | 外推、证据边界、ANN 已拒绝 | 系统错误             |
| \`--color-danger\`         | 阻断错误、删除             | 科学结论             |
| \`--color-info\`           | 假设、自动单位换算         | 装饰                 |

建议色彩方向：

- 深海军蓝：主要文字、导航或浅色主题下的品牌锚点。
- 青/蓝绿：主操作和选中态，取消霓虹发光。
- 洋红：完整响应/荧光曲线的专用数据色。
- 琥珀：外推、证据不足、ANN 已拒绝。
- 红色：系统错误和危险操作。

### 4.2 字体

| 层级         | 建议                         |
| ------------ | ---------------------------- |
| 页面标题     | 24–28px / 1.25 / 600–700     |
| 对象标题     | 18–22px / 1.3 / 600          |
| 区域标题     | 16–18px / 1.35 / 600         |
| 正文/字段值  | 14px / 1.5                   |
| 字段标签     | 13px / 1.4 / 500–600         |
| 元数据/帮助  | 最小 12px / 1.45             |
| 方程/变量/ID | 等宽字体；不低于对应文本层级 |

全大写英文眉题不作为必要层级。英文代码标识只在高级面板或首次解释中出现。

### 4.3 间距与边界

采用 4px 基础网格：

- 字段内：4/8px。
- 同组字段：12px。
- 区域内：16/20/24px。
- 页面区域：24/32px。
- 圆角：表单 6px，面板 8px，独立对象卡 10px。
- 阴影：只用于浮层、抽屉和拖拽对象；常规面板使用边界线。

## 5. 应用框架组件

### 5.1 \`ScientificAppShell\`

职责：

- 切换荧光检测与 BFN 建模工作区。
- 提供单一 \`main\` 地标和 skip link。
- 放置全局导航、工作区导航和内容区域。
- 管理 1440/1280/960 三档布局。

接口草案：

```ts
type ScientificAppShellProps = {
  workspace: 'detection' | 'bfn';
  workspaceNavigation: ReactNode;
  contextBar: ReactNode;
  children: ReactNode;
};
```

### 5.2 \`ProjectContextBar\`

显示：

- 项目/网络名称。
- 当前版本。
- 本地保存状态。
- 网络/模型验证状态。
- 演示或真实数据边界。
- 一个页面级主动作和最多两个次要动作。

不得在 BFN 上下文持续显示 BLE 电量、连接和采集状态。

### 5.3 \`ObjectSidebar\`

BFN 固定对象导航：

- 项目概览
- 实验数据
- 功能模块
- 网络设计
- 仿真与分析
- 反向设计

要求：

- active 状态包含文字与图标。
- 1280 以下可收窄；960 下变为可关闭抽屉。
- 数量和问题 badge 只显示可解释值。
- 不使用“完成度 87%”等无定义指标。

### 5.4 \`Breadcrumbs\`

仅用于对象层级导航，不承载状态：

```text
项目 / 功能模块 / AHL 传感器 / 响应模型
```

最后一项为当前页，不可点击。所有链接有可见焦点。

## 6. 页面标题与任务栏

### 6.1 \`PageTitleBlock\`

组成：

- eyebrow：可选，用于对象类型，不用全大写装饰英文。
- h1：对象或任务名称。
- description：一到两句，说明当前任务。
- status row：版本、保存、验证、证据。
- actions：一个 primary、0–2 个 secondary、其余进入更多菜单。

### 6.2 \`TaskActionBar\`

适用于网络编辑器、数据导入、仿真和模块编辑。

要求：

- 主动作随当前模式精确命名。
- 持续模式使用 segmented control，不伪装成按钮动作。
- 未保存、验证失败、运行中等状态靠近动作。
- sticky 时不遮挡标题、警告或浏览器焦点。

## 7. 操作组件

### 7.1 \`Button\`

变体：

```ts
type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
type ButtonSize = 'sm' | 'md';

type ButtonProps = {
  variant: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabledReason?: string;
  leadingIcon?: IconName;
  children: ReactNode;
};
```

规则：

- primary 每个任务区最多一个。
- danger 不与 primary 共用颜色和位置。
- loading 保留按钮宽度并显示正在做什么。
- disabled 时必须在邻近帮助文本或 tooltip 暴露原因；不能只有灰色。
- 图标按钮仅用于返回、关闭、撤销、重做、缩放等通用动作，并提供 tooltip、aria-label 和可见焦点。

### 7.2 \`SegmentedControl\`

用于：

- 静态 / 动态模式。
- 固定值 / 工作范围。
- 结果信号类型。

要求：

- \`role=radiogroup\` 或符合 ARIA 的 tab/segmented 语义。
- 支持方向键、Home/End。
- active 状态包含填充、边框或图标及文字，不只改变颜色。

### 7.3 \`OverflowMenu\`

放置：

- 导入/导出。
- 历史版本。
- 复制。
- 调试日志。
- 危险操作入口。

危险动作与普通项视觉分隔，点击后仍进入明确确认。

### 7.4 \`ConfirmDialog\`

属性：

```ts
type ConfirmDialogProps = {
  title: string;
  description: string;
  impactItems?: string[];
  recoverability: 'recoverable' | 'not-recoverable' | 'unknown';
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
};
```

必须说明删除对象、引用影响和恢复能力。确认焦点默认在保留/取消动作。

## 8. 状态与反馈组件

### 8.1 \`StatusBadge\`

固定语义：

```ts
type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
```

内容始终包括图标/符号和完整状态文字。禁止自由传入十六进制颜色。

### 8.2 \`BoundaryNotice\`

用于重要科学边界：

- 外推。
- 模型上下文。
- 适用域。
- 默认独立假设。
- 演示数据。
- ANN 已拒绝。
- 候选尚未实验构建。

属性：

```ts
type BoundaryNoticeProps = {
  kind:
    | 'demo'
    | 'extrapolation'
    | 'context'
    | 'assumption'
    | 'evidence'
    | 'ann-rejected'
    | 'unconstructed';
  title: string;
  children: ReactNode;
  action?: ReactNode;
};
```

不得折叠到 tooltip。与具体结果/对象同区域。

### 8.3 \`ValidationSummary\`

显示：

- 阻断错误数。
- 警告数。
- 自动单位换算数。
- 问题列表。
- 每条问题的对象、原因、修复动作。
- “定位到对象”动作。

错误项数据结构需要稳定 code，不依赖中文文本判断。

### 8.4 \`TaskProgress\`

仅在真实异步任务存在时使用：

```ts
type TaskProgressProps = {
  label: string;
  completed?: number;
  total?: number;
  progress?: number;
  cancellable?: boolean;
  onCancel?: () => void;
};
```

不显示伪进度。未知进度时明确任务名称和已持续时间。

### 8.5 \`EmptyState\`

属性：

- 当前缺少的对象。
- 为什么需要。
- 一个明确动作。
- 可选次要帮助链接。

不接受孤立的“暂无数据”作为 description。

### 8.6 \`InlineFeedback\` 与 \`Toast\`

- 与字段/对象相关的反馈使用 inline。
- 跨页、短时且不要求后续动作的完成信息可用 toast。
- 外推、证据边界、删除影响不能只用 toast。

## 9. 科学数据组件

### 9.1 \`QuantityValue\`

职责：

- 将数值与单位作为不可拆分整体。
- 支持有效数字、范围、不确定性和未知。
- 屏幕阅读器读出完整值。

```ts
type QuantityValue =
  | { kind: 'value'; value: number; unit: string; precision?: number }
  | { kind: 'range'; min: number; max: number; unit: string }
  | { kind: 'unknown'; reason: 'missing' | 'unmeasured' | 'mechanism-only' };
```

### 9.2 \`PortSignature\`

固定呈现：

- 实体 Entity。
- 量类型 Quantity Type。
- 单位 Unit。

紧凑模式用于画布端口，完整模式用于检查器和连接错误。

### 9.3 \`ScientificTable\`

适用：

- 实验数据集。
- 参数。
- 端口。
- 上下文。
- 版本历史。
- 证据。
- 候选比较。

要求：

- 首列可固定。
- 单位写入表头或与值同行。
- 960 下横向滚动并保留表格语义。
- 空值不渲染为 0。
- 排序状态有 aria-sort。
- 行级动作放在末列更多菜单。

### 9.4 \`DefinitionList\`

用于只读元数据和短属性组；不为每个字段建立卡片。

### 9.5 \`EvidenceGrade\`

显示：

- 证据等级文字。
- 数据/文献/机制来源类型。
- 来源版本。
- 点击“查看证据来源”。

颜色不是唯一编码，不用星级制造精度幻觉。

## 10. 表单组件

### 10.1 \`Field\`

组成：

- 可见 label。
- 可选/必填标记。
- input。
- 单位或后缀。
- 帮助文本。
- 错误文本。

错误与输入通过 aria-describedby 关联。

### 10.2 \`QuantityField\`

数值和单位形成一个控件组。单位固定时作为只读后缀；可选时使用有标签的 select。

### 10.3 \`RangeField\`

用于工作域：

- 最小值。
- 最大值。
- 单位。
- 采样方式。
- 采样点数。
- 与适用域覆盖的即时摘要。

### 10.4 \`DynamicInputEditor\`

按输入类型渐进披露：

- 恒定。
- 阶跃。
- 脉冲。
- 周期。
- 自定义时间序列。

共享仿真终止时间、时间步长和高级求解设置。切换类型时说明哪些值被保留或重置。

## 11. 网络编辑器组件

### 11.1 \`NetworkWorkbench\`

```text
┌──────────────────────────────────────────────────────┐
│ TaskActionBar                                        │
├────────────┬──────────────────────────┬──────────────┤
│ Module     │ NetworkCanvas            │ Inspector    │
│ Library    │                          │              │
├────────────┴──────────────────────────┴──────────────┤
│ Validation / Simulation / Logs / Boundaries          │
└──────────────────────────────────────────────────────┘
```

### 11.2 \`ModuleLibrary\`

- 搜索。
- 实体、量类型、静态/动态、证据筛选。
- 输入源、功能模块、输出监视器、显式转换模块分组。
- 拖放和“添加到网络”两种操作都需可用。
- 未批准的模块不能显示虚构内容。

### 11.3 \`NetworkCanvas\`

- 模块卡只显示名称、类型、关键端口和验证状态。
- 端口是可操作目标，有可见焦点。
- 连接使用方向、线型和文字状态。
- 自动单位换算可有辅助线型，但选择后检查器必须写明换算。
- 提供缩放、适应画布、撤销/重做的可访问名称。
- 若保留 \`role=application\`，进入时宣告操作方式并提供退出键；否则使用普通图形/分组语义。

### 11.4 \`IdealEdgeInspector\`

只接受：

```ts
type IdealEdgeInspectorProps = {
  sourceModule: ObjectRef;
  sourcePort: PortSignatureValue;
  targetModule: ObjectRef;
  targetPort: PortSignatureValue;
  entityMatch: MatchState;
  quantityMatch: MatchState;
  unitConversion: UnitConversionState;
};
```

不在 props 中提供任何传播参数，从组件 API 防止科学语义回退。

### 11.5 \`ObjectInspector\`

根据 discriminated union 渲染：

```ts
type InspectorSelection =
  | { kind: 'input-source'; value: InputSource }
  | { kind: 'functional-module'; value: FunctionalModule }
  | { kind: 'ideal-edge'; value: IdealEdgeView }
  | { kind: 'output-monitor'; value: OutputMonitor }
  | { kind: 'none' };
```

960–1279px 作为右侧抽屉；关闭后焦点回到触发对象。

## 12. 仿真与 ANN 组件

### 12.1 \`SimulationSetupPanel\`

区分：

- 静态固定值。
- 静态工作域。
- 动态输入。

主动作名称由模式决定，且页面其他位置不重复。

### 12.2 \`FullModelResultPanel\`

始终优先显示：

- 来源网络和版本。
- 输入摘要。
- 完整模型输出。
- 参数不确定性。
- 适用域/外推状态。
- 模型上下文。
- 运行版本、时间和采样/求解摘要。

### 12.3 \`ResponseChart\`

要求：

- 完整模型为主要实线。
- 参数区间为低对比带。
- ANN 近似为可区分虚线，且只在对应面板/对比模式显示。
- 外推区域有图案/边界和文字，不只靠颜色。
- 图例可键盘访问。
- 提供一段可见或屏幕阅读器可读的结果摘要。
- 单位在轴标题中完整显示，不让值与单位断行。

### 12.4 \`AnnEvaluationPanel\`

必须属性：

```ts
type AnnEvaluationPanelProps = {
  source: { objectName: string; version: string };
  domain: AnalysisDomain;
  sampling: SamplingSummary;
  weights: number[][];
  intercept: number[];
  r2: number;
  nrmse: number;
  maxError: number;
  status: 'accepted' | 'rejected' | 'stale';
  comparisonSeries: ComparisonSeries;
};
```

接受/拒绝均使用结论样式。拒绝使用 warning，不使用 error。

## 13. 反向设计组件

### 13.1 \`InverseDesignStepper\`

步骤：

1. 目标功能。
2. 生物设计空间。
3. 候选设计。

在步骤切换时保留输入并显示校验摘要。

### 13.2 \`TargetFunctionForm\`

只编辑 \(\theta^*\) 和上下文约束。

### 13.3 \`DesignSpaceForm\`

只编辑 \(\mathbf q\) 候选范围和评价偏好。不得把功能参数字段混进该组。

### 13.4 \`CandidateComparison\`

使用表格/矩阵比较，不只使用大卡片。每个候选显示：

- 生物实现。
- 预测完整响应。
- 功能参数区间。
- 七个评价维度。
- 证据等级。
- 数据缺口。
- 推荐验证实验。

\`MetricValue\` 类型：

```ts
type MetricValue =
  | { kind: 'measured'; value: number; unit?: string }
  | { kind: 'predicted'; value: number; unit?: string }
  | { kind: 'unknown'; reason: 'missing' | 'unmeasured' | 'mechanism-only' };
```

该类型修改涉及领域模型，必须单独审查后实施，不能在纯 CSS 改造中暗改。

## 14. 响应式行为

### 14.1 1440×900

- 完整对象导航。
- 网络三栏同时可见。
- 项目上下文和 task bar 不超过约 120px 高度。
- 主要工作区进入首屏。

### 14.2 1280×800

- 收窄对象导航。
- 模块库可折叠。
- 检查器保持 280–320px。
- 避免把关键动作挤成纯图标。

### 14.3 960×640

- 应用导航使用图标+tooltip。
- 网络画布占主要区域。
- 模块库和检查器使用抽屉。
- 底部面板使用可展开 sheet。
- 列表/详情、仿真结果和候选比较仍可阅读。
- 若功能需要 ≥1280，显示清楚的推荐窗口提示，不让控件相互覆盖。

## 15. 可访问性要求

- 页面只有一个 \`main\`。
- 标题按 h1 → h2 → h3 顺序。
- 所有输入有可见 label。
- 表单错误与输入关联。
- tab/segmented 支持标准键盘行为。
- 拖放操作提供键盘等价操作。
- 图标按钮有 tooltip、aria-label 和可见焦点。
- 图表有名称、文本摘要、单位和边界说明。
- 颜色不是状态的唯一载体。
- disabled 元素旁有可读原因。
- 触发抽屉/对话框后管理焦点，关闭后恢复焦点。
- 200% 缩放时不遮挡主要动作。
- 最小文本 12px，正文 14px。

## 16. 状态覆盖矩阵

所有主要任务组件至少支持：

| 状态              | 组件表现                     |
| ----------------- | ---------------------------- |
| normal            | 对象、状态、主动作、边界完整 |
| empty             | 缺少对象 + 用途 + 动作       |
| loading           | 真实任务名称和进度/持续时间  |
| error             | 发生内容 + 原因 + 修复动作   |
| disabled          | 原因可读                     |
| saved             | 具体对象与版本               |
| dirty             | 未保存更改                   |
| validation-failed | 阻断问题与定位               |
| extrapolation     | 结果附近 warning             |
| assumption        | 默认独立完整句               |
| demo              | 未实验验证标记               |
| unknown           | 未知原因，不显示 0           |

## 17. 测试合同

### 17.1 组件测试

- Button 四级样式和每个 task region 单一 primary。
- disabledReason 可被辅助技术读取。
- StatusBadge 同时包含文字和图标。
- IdealEdgeInspector 不渲染禁用词。
- QuantityValue 未知不会转成 0。
- BoundaryNotice 不依赖 tooltip。
- SegmentedControl 键盘行为。
- ConfirmDialog 默认焦点和对象化按钮文案。

### 17.2 业务测试

- 端口不兼容错误包含实体/量类型/单位和修复动作。
- 静态单点不渲染 ANN 近似。
- 静态工作域可显式生成 ANN。
- ANN accepted/rejected 使用科学结论状态。
- 多输入默认独立提示使用规定中文。
- 外推警告靠近结果。
- 反向设计未知指标显示“未知”。
- IdealEdge 只呈现连接关系和匹配。

### 17.3 浏览器/视觉测试

- 1440×900、1280×800、960×640。
- 页面无 document 级横向溢出。
- 网络画布抽屉不遮挡主动作。
- 长单位、长模块名、长错误文案。
- 键盘焦点、弹窗层级和滚动恢复。
- 改造前后截图成对保存。

## 18. 完成门槛

组件只有同时满足以下条件才可推广到业务页面：

- 科学语义 props 经过领域核对。
- 中文与英文资源齐全。
- normal/empty/loading/error/disabled 有测试。
- 键盘与屏幕阅读器语义可用。
- 1440/1280/960 三档无阻断布局问题。
- 不引入平行 token 或第二套按钮系统。
- 不制造不存在的后端、数据或实验结论。
