# Beads PM

English | [简体中文](README.zh-CN.md)

A Mac client for a local Beads workspace, developed in the [Scotty fork](../README.md). Projects, Board, Map, Need Me and Timeline share the same BD records. The desktop app reads and writes through the installed `bd` CLI; the browser preview uses disposable example data.

## Build and open

Requires Node.js 22.12+, npm, Rust 1.89+/Cargo and the Xcode command-line tools. BD 1.2.2 with an embedded Dolt workspace is the tested data backend.

From the repository root:

```sh
npm ci
npm --prefix pm-client ci
npm --prefix pm-client run desktop:build
```

Open `pm-client/src-tauri/target/release/bundle/macos/Beads PM.app`, then enter the workspace folder that contains `.beads`. The app discovers common BD executable locations; **BD 设置** allows another executable or actor. Configuration is stored in the operating system's per-user application configuration directory, outside this repository. It is never included in the app bundle.

The app embeds its frontend. It has its own identifier (`com.beads.pm`) and the double-layer icon used in the sidebar. Local builds use ad-hoc signing; Developer ID distribution signing and notarization are not configured.

## Daily use

- New tickets use sequential IDs under the workspace prefix (`sample-1`, `sample-2`, …), and start as independent Ideas. Edit their title, description, assignee, priority, status, parent, target date or manual plan in detail.
- Board has completion windows and shared scope/search filters. Project progress includes historical tickets.
- Need Me reads `human` requests as **待处理**. Explicit `pm:review`, `pm:decision` and `pm:action` labels distinguish review, decision and action requests. It does not infer acceptance from an assignee or an arbitrary human label.
- Responses append BD notes and remove the answered request labels. Requesting changes returns a review ticket to `in_progress`; it retains the assignee. Closing and reopening act on the explicitly confirmed ticket. Parent auto-close flows are rejected.
- Timeline separates target dates and manual plans, and offers date navigation. Map layout and view filters are local preferences; moving a node does not change its parent.
- Lists refresh every 30 seconds and on window focus while no detail or creation form is open. Refresh errors retain the last view, disable writes and never substitute examples. Opening a detail reads it again; saving checks its content version and reads the result back.

New creation requires a workspace without BD native counter mode and a prefix accepted by `bd rename` (lowercase ASCII letters before the first hyphen). Failed reservations can leave gaps. Existing IDs are not migrated.

The app has no embedded AI chat or automatic project classification. Workspaces with redirection, remote servers or cross-workspace routing are not supported by this version. The CLI has no conditional-write transaction: an external writer can still race between the last read and the mutation. Partial or uncertain writes surface an error for inspection. The complete protocol and recovery limits are in [BD_CONTRACT.md](docs/BD_CONTRACT.md).

## Browser preview and tests

```sh
npm --prefix pm-client run dev
```

Open [http://127.0.0.1:1420](http://127.0.0.1:1420). The browser remains a synthetic preview; its badge says that closing resets edits. The native app opens real workspace setup and does not fall back to this mode on failure.

```sh
npm --prefix pm-client test
npm --prefix pm-client run lint
npm --prefix pm-client run build
cargo test --manifest-path pm-client/src-tauri/Cargo.toml
```

With the preview running, from `pm-client/`:

```sh
PM_TEST_URL=http://127.0.0.1:1420 npm run test:ui
PM_BROWSER=webkit PM_TEST_URL=http://127.0.0.1:1420 npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored --nocapture
```

Playwright browsers must be installed through the root package (`npx playwright install chromium webkit`). Browser tests use examples or mocked IPC. The opt-in Rust integration tests create fresh temporary Git/BD workspaces for real writes, process-lock checks and competing CLI mutations. Their subprocess helper is used only with those temporary workspaces.

[Design](docs/DESIGN.md) · [Contract](docs/BD_CONTRACT.md) · [Verification](docs/PROGRESS.md) · [Plan](docs/PLAN.md)

Application source follows the repository [MIT license](../LICENSE); the Layers2 icon follows the [Lucide ISC license](src-tauri/icons/LICENSE.txt).
