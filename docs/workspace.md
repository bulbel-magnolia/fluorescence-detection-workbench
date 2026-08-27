# BFN 多项目科研工作区

Batch 6 在 BFN-IR 2.0 外层建立本地科研工作区。工作区回答“当前管理哪个科研设计项目”，BFN-IR 继续回答“这个生物功能网络是什么”。项目名称、当前项目、版本历史和运行记录都不写入科学结构，也不参与计算签名。

## 对象边界

| 对象              | 职责                                                    | 可变性         | 是否属于 BFN-IR                   |
| ----------------- | ------------------------------------------------------- | -------------- | --------------------------------- |
| Workspace Project | 管理工作区项目 ID、名称、打开时间和下一版本号           | 元数据可变     | 否                                |
| Current Draft     | 当前项目持续编辑的 BFN-IR 2.0 文档                      | 可变，自动保存 | 内容本身是 BFN-IR                 |
| Version           | 用户主动保留的 Current Draft 快照、名称、备注与计算签名 | 创建后不可变   | 快照内容是 BFN-IR，版本元数据不是 |
| Run               | 一次 BFN-SIM-2.0 结果及其项目 ID、计算签名              | 创建后只读     | 否                                |
| BFN-IR Project    | 网络、端口、模块、模型、证据、上下文与适用域            | 由编辑器修改   | 是                                |

Project Version 是科研设计检查点，不是模型版本、算法版本或 Git 提交。Autosave 只更新 Current Draft，不创建 Version。Run 记录一次计算结果，也不创建 Version。BFN-IR 不包含 Workspace 历史、项目列表、版本记录或运行记录。

工作区项目 ID 与 BFN-IR Project ID 分离。复制项目会创建新的工作区项目 ID、BFN Project ID 和 Network ID，同时保留网络内部节点、端口与连接 ID。导入则保留文件中的 BFN-IR ID，并创建新的工作区项目 ID。

## 本地持久化

生产主路径使用 IndexedDB 数据库 `fluorescence-desktop-bfn-workspace`，当前数据库版本为 1。

| Object Store | 主键        | 用途                       |
| ------------ | ----------- | -------------------------- |
| `settings`   | `id`        | 当前项目与一次性迁移标记   |
| `projects`   | `id`        | 项目名称、时间与下一版本号 |
| `drafts`     | `projectId` | 每个项目的 Current Draft   |
| `versions`   | `id`        | 不可变版本快照             |
| `runs`       | `id`        | 项目级运行记录             |

`versions` 同时建立非唯一 `projectId` 索引和唯一 `[projectId, revision]` 索引；`runs` 建立 `projectId` 索引。创建项目、创建版本、删除项目级联数据和旧数据迁移均在覆盖所需 store 的单个读写事务中完成。

浏览器环境完全没有 IndexedDB 时，工作区使用新键 `fluorescence-desktop.bfn-workspace.v1` 的 localStorage 降级实现。IndexedDB 可用但打开失败时不会静默切换到另一份数据，以免用户误以为项目消失。

## 启动与旧数据迁移

启动顺序固定为：

1. 已存在 Workspace Project 时直接打开最近的有效项目，不读取旧键覆盖工作区。
2. 工作区为空且没有迁移标记时，读取旧版单项目 BFN-IR 与旧运行记录。
3. 找到旧项目时，在一个事务中创建 Workspace Project、Current Draft、最多 20 条 Run 和迁移标记。
4. 没有旧项目时，创建一个真实空白项目。

迁移不删除旧 localStorage 键。旧 Run 无法追溯原计算签名，因此迁移后的 `computationSignature` 为 `null`，界面标记为“旧版运行记录”。迁移事务失败时不会留下半个项目或错误标记；下一次启动可以重试。

旧 `loadBfnProject()`、`loadBfnRuns()` 和 `parseBfnProject()` 继续承担迁移与格式验证。生产工作区不再向旧项目键或旧运行键写入数据。

## 空白项目

首次启动和“新建空白项目”创建同一最小科学结构：

- 0 个 Input Source；
- 0 个 Functional Module；
- 1 个 Output Monitor；
- 输出身份为 `normalized_reporter_expression / expression_level / dimensionless`；
- `isDemo=false`。

空白项目不闪现 Demo 网络，也不伪造输入、模块、实验结果或参数。

## Current Draft 与自动保存

编辑器仍只处理 BFN-IR 和编辑瞬态；工作区控制器负责持久化。项目变化进入 320 ms 防抖自动保存，并在工具栏显示保存中、已自动保存或本地保存失败。

切换、复制、新建和导入项目之前会先 flush 当前草稿。flush 失败会阻止项目切换，当前编辑内容和当前项目保持可见。恢复 Version 前同样等待已有保存完成，避免较早的异步写入覆盖恢复后的草稿。

项目切换会重新建立编辑器实例，并清除：

- Undo / Redo；
- 当前节点与连接选择；
- 输入编辑瞬态；
- Catalog 与其他 Overlay；
- 反向设计候选；
- 结果面板的临时交互状态。

初始选择依次使用第一个 Module、第一个 Input Source、Output Monitor。

## Workspace Transition Integrity

工作区转换遵循 `PREPARE → COMMIT → APPLY UI`。准备阶段可以失败；持久化提交成功后，控制器必须只使用已准备的内存数据进入下一稳定界面，不再把新的关键读取作为转换成功条件。

- Existing Switch：flush 当前草稿，预读取目标项目的 metadata、draft、versions 与 runs，提交 active project，再应用目标状态。任一预读取或激活失败时，当前项目、持久化 active project 与 Project Center 保持原状。
- Delete Active：flush 当前草稿，从当前项目列表中按 `lastOpenedAt` 降序选择替代项目，完整预读取替代项目，再原子删除当前项目及其 Draft、Version 与 Run。提交后直接应用已准备的替代状态，不调用 `getActiveProjectId()`、`listProjects()` 或目标项目读取。
- Delete Non-active：Repository 删除成功后直接过滤内存项目列表。当前项目的 Draft、Version、Run 与编辑器会话保持不变，也不依赖删除后的 `listProjects()`。
- Create / Duplicate / Import：flush 当前草稿，在内存中准备新 metadata 与 Draft，通过 `createProject({ makeActive: true })` 在一个 Repository 事务中写入项目、草稿与 active project，随后直接应用 `versions=[]`、`runs=[]` 的已知状态。

活动项目删除前若无法完整准备替代项目，删除操作不会提交，当前项目继续可见且可编辑。新项目创建事务失败时，界面继续显示原项目；Repository 的原子创建合同负责避免半项目。成功的删除与创建都会重新建立编辑器实例，清空 Undo / Redo、选择和 Overlay 瞬态。

## 项目操作

Project Center 提供：

- 新建空白项目；
- 切换项目；
- 内联重命名；
- 复制当前项目；
- 删除确认；
- Current Draft 摘要；
- 保存版本、查看版本历史与恢复。

最后一个项目不能删除。删除项目会在一个事务中移除该项目的 metadata、draft、versions 和 runs，不影响其他项目。复制只复制当前 Draft，不复制版本和运行记录。

Project Center 是带 accessible name 的模态抽屉。项目行使用原生按钮并标记当前项目，重命名和版本字段都有 label。Escape 在版本表单或重命名编辑时先取消当前编辑，再关闭 Project Center。Project Center 打开时编辑器快捷键停止响应，并与 Catalog Drawer 保持互斥。

## 手动版本

“保存当前版本”创建 `structuredClone(Current Draft)`。版本同时保存项目内连续 revision、可选名称、可选备注、创建时间、摘要与 `createBfnComputationSignature(snapshot)`。

Revision 从 1 开始，只在当前项目内递增，删除项目之前永不复用。版本创建后没有编辑、重命名或删除入口。自动保存、Undo、Redo、拖动、连线、参数修改和运行分析都不会创建版本。

恢复 Version 会：

1. 等待当前自动保存完成；
2. 复制版本快照到 Current Draft；
3. 把 Draft 的 `updatedAt` 更新为恢复时刻；
4. 保留全部版本和项目运行记录；
5. 清空编辑器 Undo / Redo 与瞬态状态；
6. 重新根据当前草稿签名标记运行关系。

恢复不会自动保存“恢复前版本”，也不会修改原 Version snapshot。

## 项目级运行记录

每条 Workspace Run 包装既有 BFN-SIM-2.0 结果：

```text
result + projectId + computationSignature + createdAt
```

每个项目最多保留最新 20 条。切换项目后加载该项目最新 Run 作为当前显示结果，并用保存的签名恢复结果新鲜度。运行关系只影响展示：

- 签名等于 Current Draft：当前设计；
- 签名不同：较早设计；
- 签名为 `null`：旧版运行记录。

清空运行记录只作用于当前项目。计算成功而 Run 持久化失败时，结果继续显示，并给出“结果仍可查看，但项目运行记录保存失败”的提示。

## 导入与导出

导入继续复用 `parseBfnProject()`。每个合法 JSON 文件都会创建新的 Workspace Project，项目名来自文件名；重复导入不会覆盖既有项目。非法文件保持当前项目和项目列表不变，并显示格式错误。

导出只序列化当前 BFN-IR Project。导出文件不包含工作区项目 ID、项目列表、版本、运行记录或当前项目设置，文件名使用清理后的工作区项目名。

## Catalog 科学完整性

Workspace snapshot 不改变 Catalog scientific contract。项目切换、复制、保存版本、恢复、导出和重新导入后，`catalogReference`、端口身份、validity domain、来源追溯和可信执行门禁仍由现有 Catalog 验证链负责。工作区元数据不会进入 Catalog reference、BFN computation signature 或可信运行参数。

## 当前边界

Batch 6 是纯本地、单用户工作区，不包含云同步、协作编辑、项目归档、版本删除、分支、合并或 DAG 历史。版本用于主动保留科研设计节点，不替代源代码版本控制。
