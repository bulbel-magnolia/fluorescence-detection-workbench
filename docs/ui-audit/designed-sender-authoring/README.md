# Designed Sender Authoring Visual Audit

- 日期：2026-08-31
- 路径：真实 Vite 应用 `http://127.0.0.1:1420/`
- 主题：深色
- 主视口：1440×900
- 响应式视口：1280×720

## 1440×900 场景

1. `01-add-module-drawer-1440x900.png`：Add Module Drawer 同时显示“自定义功能模块”和“设计发送模块”。
2. `02-default-form-1440x900.png`：Designed Sender 默认表单。
3. `03-known-signal-selection-1440x900.png`：可信 AHL/HSL signal identity 选择。
4. `04-custom-signal-mode-1440x900.png`：自定义信号模式与普通名称输入。
5. `05-hill-activation-parameters-1440x900.png`：Hill 激活及 K、n、基础/最大产生速率。
6. `06-validation-error-1440x900.png`：必填模块名和 Port 角色名的可见校验。
7. `07-added-to-canvas-1440x900.png`：一个 Designed Sender 物化后被选中，画布未自动连线。
8. `08-inspector-production-rate-1440x900.png`：Inspector 显示 canonical signal Entity、生成速率单位、候选设计和 Hill 模型。
9. `09-connection-rejection-1440x900.png`：产生速率到浓度的精确连接被禁用，界面说明需要显式累积/清除且不会插入隐藏积分。
10. `10-dark-theme-1440x900.png`：深色主题下的画布和选中模块。

当前浏览器中的旧审查 Project 已登记一个显示名称不同的 3OC6 canonical Entity。首次尝试按可信 3OC6 identity 添加时，authoritative Entity conflict 按合同 fail closed 且没有写入模块；视觉流程随后使用未占用的可信 C4 identity。自动化平台集成测试另以完全相同的 3OC6 canonical Entity 构建真实 Catalog Receiver，确认直接连接仍因 `production_rate → concentration` 硬拒绝。

## 1280×720 响应式复核

- `11-form-responsive-1280x720.png`：表单顶部和固定操作区。
- `12-form-scroll-bottom-1280x720.png`：内部滚动到底部后，主操作仍可见。
- Drawer：560×720 px。
- 内部滚动区：`clientHeight = 619`、`scrollHeight = 1325`、`overflow-y = auto`。
- 实际滚动：`scrollTop = 700`。
- 操作区：top 633 px、bottom 686 px；submit button bottom 676 px。
- submit button 中心点的最上层元素属于操作区，Result Dock 没有遮挡按钮。
- 页面：`scrollWidth = clientWidth = 1280`，无页面级横向溢出。

## 控制台

浏览器审查结束时，warning/error 日志为空；Batch 12.2 新增 warning 为 0、error 为 0。
