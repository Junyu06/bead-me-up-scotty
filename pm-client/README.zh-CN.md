# Beads PM 预览

[English](README.md) | 简体中文

这是在 [Scotty fork](../README.zh-CN.md) 内开发的 Mac 项目管理客户端。目前是 **UI-01 交互预览**，使用合成数据和固定时钟，不连接、写入或启动真实 Beads 工作区的进程。

## 启动

需要 Node.js 22.12 或更高版本及 npm。在仓库根目录执行：

```sh
npm ci
npm --prefix pm-client ci
npm --prefix pm-client run dev
```

打开 [http://127.0.0.1:1420](http://127.0.0.1:1420)。预览使用 React、TypeScript 和 Vite。安装根目录依赖是为了引用 Scotty 的共享 schema 与清单工具函数，不会启动 Scotty 的 Next.js 服务。

要构建 Mac 应用，先安装 Rust/Cargo 和 Xcode 命令行工具，然后在仓库根目录执行：

```sh
npm --prefix pm-client run desktop:build -- --debug
```

打开 `pm-client/src-tauri/target/debug/bundle/macos/Beads PM Preview.app`。应用内置前端，无需开发服务。当前为本地开发包，尚未完成发行签名和公证。它有独立的应用标识，不替换已安装的 Scotty；图标暂时复用 Scotty。

## 检查

在仓库根目录执行：

```sh
npm --prefix pm-client test
npm --prefix pm-client run build
npm --prefix pm-client run lint
```

测试先用 esbuild 打包共享 TypeScript 边界，再通过 Node 测试运行器执行，不调用 `bd`。[PROGRESS.md](docs/PROGRESS.md) 分别记录自动检查、浏览器检查和 Mac 原生检查。

## 预览操作

- Projects：打开项目、展开里程碑，或查看直接包含工单的项目。
- Board：按范围、负责人、优先级或标签筛选；选择完成时间范围（5 小时、1 天、默认 3 天、7 天、全部或自定义日期），每次可再显示 20 项。
- Map：展开或收起容器、查看跨里程碑依赖、平移或缩放，也可从外框拖动节点；点击工单打开统一详情。
- Need Me：查看待验收、待决策、待操作请求；提交决定或操作答复后，可以在详情回看原请求和答复。答复不会关闭工单或解除阻塞。
- 项目 Timeline：点击计划条或截止日期，在统一详情中修改日期。
- 验收：打开 `demo-a`，查看交付依据并确认通过这一张示例工单；`demo-b` 变为 Ready，`demo-e` 继续受 `demo-c` 阻塞。
- 新建：初始为 Idea，项目未分配；从项目内创建也一样。未提交的新建、编辑和答复草稿有离开确认。

创建、编辑和验收只影响内存中的示例；重新加载会恢复记录，筛选和 Map 显示偏好保存在本机。每次只验收一张工单，不自动关闭父项目或启动 agent。应用没有内置 AI 聊天或自动归类。

## 当前限制

真实 Beads 读写、原生 readiness、持久保存和真实关闭/重开尚未接入。示例中的可执行状态计算不能直接用于真实 BD。剩余界面问题和验证范围见 [PROGRESS.md](docs/PROGRESS.md)。

其他资料：[设计](docs/DESIGN.md)、[BD 接入边界](docs/BD_CONTRACT.md)、[本地环境核验](docs/LOCAL_FACTS.md)、[产品计划](docs/PLAN.md)。源码及复用资源遵循仓库的 [MIT 许可证](../LICENSE)。
