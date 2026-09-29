# Beads PM

[English](README.md) | 简体中文

基于 [Scotty fork](../README.zh-CN.md) 开发的 Mac 客户端。Projects、Board、Map、Need Me 和 Timeline 共用同一份 BD 数据。桌面版通过本机 `bd` 读写工作区；浏览器版使用可重置的示例数据。

## 构建与打开

需要 Node.js 22.12+、npm、Rust 1.89+/Cargo 和 Xcode 命令行工具。已验证的数据后端为 BD 1.2.2 的本机 embedded Dolt 工作区。

在仓库根目录运行：

```sh
npm ci
npm --prefix pm-client ci
npm --prefix pm-client run desktop:build
```

打开 `pm-client/src-tauri/target/release/bundle/macos/Beads PM.app`，填写包含 `.beads` 的工作区路径。应用会查找常用位置的 BD；其他位置或操作者名称可在“BD 设置”中填写。配置保存在系统的用户应用配置目录，不进入源码或安装包。

应用内置前端，使用独立标识 `com.beads.pm` 和侧栏的双层方块图标。本机构建使用 ad-hoc 签名，未配置 Developer ID 发行签名和公证。

## 使用

- 新建工单使用顺序编号（如 `id-1`、`id-2`），默认为独立 Idea。在详情中可修改标题、描述、负责人、优先级、状态、归属、目标日期和人工计划。
- Board 提供完成时间范围与通用筛选；项目进度包含历史工单。
- Need Me 将仅带 `human` 的工单显示为“待处理”。明确的 `pm:review`、`pm:decision`、`pm:action` 标签分别表示待验收、待决策和待操作；负责人或 `human` 标签本身不等于待验收。
- 答复追加到 BD notes，并移除已答复的请求标签。要求修改会将待验收工单退回 `in_progress`，保留负责人。关闭和重新打开需要确认具体工单；会连带自动关闭父项的流程不在此版本内操作。
- Timeline 区分目标日期和人工计划，可以切换日期范围。Map 布局、视图筛选是本机偏好；拖动节点不会改变归属。
- 没有打开详情或新建表单时，每 30 秒及窗口重新获得焦点时刷新。刷新失败会保留上次内容并暂停修改，不会换成示例数据。打开详情会重读；保存前核对内容版本，保存后读回结果。

新建要求工作区未启用 BD 原生 counter 模式。失败时可能跳号；已有 ID 不迁移。

项目用 `proj-N`，里程碑用 `milestone-N`，其余工单共用 `id-N`；三组编号在同一工作区分别递增。改变类型或归属保留原号。AI 和 Scotty 网页使用[同一创建入口](../crates/beads-core/README.md)。

应用没有内置 AI 聊天或自动归类。当前版本不支持重定向、远程数据库和跨工作区路由。BD CLI 没有条件写入事务，其他进程仍可能在最后一次检查与写入之间修改工单；部分写入或结果不确定时会提示核对。协议和恢复边界见 [BD_CONTRACT.md](docs/BD_CONTRACT.md)。

## 浏览器预览与检查

```sh
npm --prefix pm-client run dev
```

打开 [http://127.0.0.1:1420](http://127.0.0.1:1420)。浏览器仍是示例预览，关闭或刷新会重置修改；桌面版进入真实工作区配置，连接失败不会退回示例。

```sh
npm --prefix pm-client test
npm --prefix pm-client run lint
npm --prefix pm-client run build
cargo test --manifest-path crates/beads-core/Cargo.toml
```

预览运行后，在 `pm-client/` 中执行：

```sh
PM_TEST_URL=http://127.0.0.1:1420 npm run test:ui
PM_BROWSER=webkit PM_TEST_URL=http://127.0.0.1:1420 npm run test:ui
cargo test --manifest-path ../crates/beads-core/Cargo.toml -- --include-ignored --nocapture
```

浏览器通过根目录的 `npx playwright install chromium webkit` 安装。浏览器测试使用示例或模拟的 IPC；Rust 集成测试会新建临时 Git/BD 工作区，验证真实写入、进程锁和其他 CLI 同时修改的情况；子进程辅助测试只使用这些临时工作区。

[设计](docs/DESIGN.md) · [接入协议](docs/BD_CONTRACT.md) · [验证](docs/PROGRESS.md) · [计划](docs/PLAN.md)

应用源码遵循仓库的 [MIT 许可证](../LICENSE)；Layers2 图标遵循 [Lucide ISC 许可证](src-tauri/icons/LICENSE.txt)。
