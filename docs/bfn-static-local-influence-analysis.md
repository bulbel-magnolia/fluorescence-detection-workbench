# BFN 静态输入作用分析

## 状态

Batch 13.1 当前为 `CANDIDATE / implementation complete / awaiting Master Review / not FROZEN`。本实现建立在 Batch 13.0 correction checkpoint 上；该 checkpoint 当前为 `CANDIDATE / awaiting Master Correction Review / not FROZEN`。

## 用户目的

输入作用分析回答一个 module-local 问题：在用户明确给定的当前输入条件附近，各输入会使所选模块的输出向什么方向变化，以及影响有多强。

入口位于选中模块的 Inspector。用户为 active response 的每个输入填写非负有限值，端口单位固定显示，系统同时给出已记录范围。分析条件仅存在于 Drawer 的 React state；关闭后丢弃，不修改 Project、Input Source、Module、Workspace 或 Module Library。

## 计算 API

`calculateBfnLocalInfluence(project, request)` 是 pure、deterministic、non-mutating API：

1. 先调用 `assessBfnLocalInfluenceRequest()`；
2. unsupported request 在求值前返回；
3. 通过 admitted target 精确解析 active static model；
4. 使用 `evaluateStaticResponse(response, inputs, 'estimate')` 计算同一点输出；
5. 使用 nominal parameters 的解析偏导计算每个输入作用；
6. 返回 readonly `BfnLocalInfluenceResultV1`，其 persistence 明确为 `ephemeral`。

生产路径不使用 finite difference、epsilon、数值扰动或导数 fallback。测试中的中心差分只作为解析结果的独立 oracle。

## 支持的响应

### Hill activation 与 repression

正输入处使用：

```text
dH/dx = n K^n x^(n-1) / (K^n + x^n)^2
```

activation 乘以 `ymax-ymin`，repression 乘以其相反数。输入为零时：

- `ymax === ymin`：gain 为 0；
- `n > 1`：gain 为 0；
- `n === 1` 且 amplitude 非零：gain unavailable，原因是该点导数不唯一；
- `0 < n < 1` 且 amplitude 非零：gain unavailable，原因是解析值非有限。

### Linear transfer

未截断区域的 gain 为 `scale`，严格位于 output clamp 外时为 0，固定输出 `minimum === maximum` 时为 0。恰好位于 clamp boundary 且 `scale !== 0` 时不选择单侧斜率，gain 标记为 unavailable。

### Identity

只有 input/output 的 Entity、quantity type 与 unit 完全一致的 identity 才能通过 admission；其 gain 为 1。

### Independent inputs

每个 term 先按自己的 Hill direction 与 contribution 求解析偏导。bounded sum 的 raw partial 等于该 term partial；multiplicative 使用：

```text
(maximum - basal) dti/dxi Π[j != i](1 - tj)
```

随后按 production `clamp(combined, min(0, basal), maximum)` 处理：严格内部保留 raw partial，严格外部为 0，边界处只有 raw partial 为 0 才返回 0。一个 term 的导数不可用不会抹掉其他输入的可计算结果。

## 输出与相对敏感度

当前输出 `y0` 始终来自生产静态 evaluator。若 evaluator 对 admitted request 返回 NaN 或 Infinity，calculator 以 `output_non_finite` fail closed，不形成结果。

每个 gain 保留 output/input unit pair。available gain 必须 finite；解析计算得到非有限值时返回 unavailable，不 clamp 为 0。

相对敏感度采用：

```text
E = (x / y) gain
```

availability 顺序固定为 gain unavailable、input 不为正、output 不为正、最终结果非有限。最终结果非有限沿用 derivative unavailable 语义。multi-input `perInput` 顺序跟随 admitted response input order。

## ValidityDomain

- 所有必要输入均有 recorded range 且位于闭区间内：生成正式结果；
- 至少一个必要输入没有 recorded range：生成结果，同时标记适用范围未完整记录；
- 任一输入超出 recorded range：不执行求值，不生成正式结果，界面列出对应输入与允许范围。

`applicability_not_recorded` 不表示无限适用或已经验证。

## Evidence

结果继承 admitted active static model 的 evidence grade、uncertainty method、model provenance、dataset、Context、ValidityDomain 与 Catalog mapping identity。Implementation maturity 和 BiologicalImplementation provenance 不升级或替代 Model Evidence。当前 gain 按 nominal parameters 计算，不传播参数不确定性。

## 用户界面

Drawer 使用现有科研桌面工作台的 section divider、property row、table、Button、Icon、focus 与证据等级视觉映射。主界面展示：

- 模块与 output scientific identity；
- response 的自然语言名称；
- 输入值、固定单位与已记录范围；
- 当前输出；
- 每个输入的增强、抑制、无局部变化或不可计算状态；
- 局部响应增益及其单位；
- 相对敏感度；
- applicability 与 model evidence。

主界面不显示公式、Jacobian、gradient、raw ID、enum、schema 或 internal issue code。输入变化立即清除旧结果；关闭并重新打开时字段恢复为空。

## 动态与后续批次边界

同时具有 paired first-order model 的模块只解释稳态响应关系，界面明确说明不包含时间响应。τ、initial state、frequency response 和 dynamic gain 不参与计算。

Accumulator / Signal Pool 是动态积分过程，没有静态 input-output response。Inspector 禁用本操作并显示自然语言说明，不构造 gain 1 或有限 DC gain。

- Batch 13.2：whole-network influence propagation 与 chain rule；
- Batch 13.3：local ANN approximation view、weight 与 bias；
- Batch 13.4：dynamic/frequency gain 与积分过程解释。

本批次不改变 Edge、BFN-IR 2.3、BFN-SIM 2.2、Template 1.0、Module Library Persistence 1.0、`annApproximation.ts` 或 `analysis.annThresholds`。
