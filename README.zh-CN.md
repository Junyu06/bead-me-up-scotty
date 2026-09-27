# Beads PM — Scotty fork

[English](README.md) | 简体中文

这个仓库基于 [Bead Me Up, Scotty](https://github.com/brendan-appstart/bead-me-up-scotty) 的 fork 开发。仓库保留现有 Scotty 应用，并在 `pm-client/` 内开发 Mac 项目管理客户端 **Beads PM**，复用部分 Scotty 工具函数。

## 两个应用入口

| 应用 | 源码 | 数据 | 启动 |
|---|---|---|---|
| Beads PM 预览 | [`pm-client/`](pm-client/README.zh-CN.md) | 合成数据；修改仅保留本次会话 | `npm --prefix pm-client run dev` |
| Scotty | `app/`、`components/`、`lib/` | 已配置的本地 Beads 工作区，或 Scotty 示例数据 | `npm run dev` |

Beads PM 已有 Projects、Board、Map、Need Me、统一详情和项目内 Timeline，支持新建、编辑、逐张验收、决策/操作答复及完成时间筛选。目前仍是交互预览，尚未接入真实 Beads 工作区。重新加载会恢复示例记录；显示偏好保存在本机。

## 运行 Beads PM

需要 Node.js 22.12 或更高版本及 npm。预览已在 Node.js 22.23.2、npm 10.9.8 下检查。客户端会引用 Scotty 的共享 schema 和清单工具函数，因此两处依赖都要安装。

在仓库根目录执行：

```sh
npm ci
npm --prefix pm-client ci
npm --prefix pm-client run dev
```

打开 [http://127.0.0.1:1420](http://127.0.0.1:1420)。这会启动 Vite，与 Scotty 的 Next.js 服务分开运行。

要构建本地 macOS 应用，先安装 Rust/Cargo 和 Xcode 命令行工具，再执行：

```sh
npm --prefix pm-client run desktop:build -- --debug
```

应用输出到 `pm-client/src-tauri/target/debug/bundle/macos/Beads PM Preview.app`。应用内置前端，无需开发服务。当前为开发包，尚未完成发行签名和公证。

## 开发检查

```sh
npm --prefix pm-client test
npm --prefix pm-client run lint
npm --prefix pm-client run build
```

测试使用合成数据，不调用 `bd`。[验证与剩余工作](pm-client/docs/PROGRESS.md) 分别记录自动检查、浏览器检查和原生检查。真实数据接入仍是后续开发阶段。

## 仓库结构

```text
pm-client/          Beads PM：React、TypeScript、Vite 和 Tauri 外壳
app/                Scotty：Next.js 页面与 API
components/         Scotty 界面组件
lib/                Scotty 的 BD 适配与共享工具
desktop/            Scotty 已有的 macOS 外壳
docs/scotty.md      Scotty 的功能、安装与使用说明
```

两个桌面应用使用独立的应用标识。Beads PM 复用部分工具函数和当前 Scotty 图标，不启动 Scotty 服务，也不接入其 BD 写入适配器。

## Scotty 与 fork

现有应用的用法见 [Scotty 使用说明](docs/scotty.md) 和 [桌面配置](desktop/README.md)。Scotty 配置后可操作真实本地 Beads 数据；PM 预览目前没有这项能力。

- 当前 fork：[Junyu06/bead-me-up-scotty](https://github.com/Junyu06/bead-me-up-scotty)。
- 上游：[brendan-appstart/bead-me-up-scotty](https://github.com/brendan-appstart/bead-me-up-scotty)。
- 定制开发分支：`local/simple-project-backlog`。
- 上游更新经检查后合入定制分支，保留 fork 自己的改动。

仓库保存应用源码。本地 `.beads` 数据库、凭据、机器配置、依赖和构建出的 App 不纳入源码提交。

## 文档与许可

- [Beads PM 中文使用说明](pm-client/README.zh-CN.md) · [English guide](pm-client/README.md)
- [设计](pm-client/docs/DESIGN.md) · [Beads 接入边界](pm-client/docs/BD_CONTRACT.md)
- [进度与验证](pm-client/docs/PROGRESS.md)

采用 [MIT 许可证](LICENSE)。原 Scotty 项目由 Brendan 开发，`LICENSE` 保留原版权声明；Beads PM 在此 fork 内开发。
