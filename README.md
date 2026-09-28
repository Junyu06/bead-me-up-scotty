# Beads PM — Scotty fork

English | [简体中文](README.zh-CN.md)

This repository is a fork of [Bead Me Up, Scotty](https://github.com/brendan-appstart/bead-me-up-scotty). It contains the existing Scotty application and **Beads PM**, a Mac project-management client developed in `pm-client/` with shared Scotty helpers.

## Choose an application

| Application | Source | Data | Start |
|---|---|---|---|
| Beads PM | [`pm-client/`](pm-client/README.md) | Desktop: local BD; browser: synthetic preview | `npm --prefix pm-client run dev` |
| Scotty | `app/`, `components/`, `lib/` | A configured local Beads workspace, or Scotty's demo data | `npm run dev` |

Beads PM currently provides Projects, Board, Map, Need Me, a shared detail panel and a project Timeline. The desktop app supports real BD creation, editing, request responses, individual close/reopen and completion-date filters. The browser preview uses synthetic records; reloading it resets edits.

## Run Beads PM

Use Node.js 22.12 or later and npm. The preview has been checked with Node.js 22.23.2 and npm 10.9.8. Install dependencies for both applications because the preview imports Scotty's shared schema and checklist helper.

From the repository root:

```sh
npm ci
npm --prefix pm-client ci
npm --prefix pm-client run dev
```

Open [http://127.0.0.1:1420](http://127.0.0.1:1420). This starts Vite, independently of Scotty's Next.js server.

For a local macOS app, install Rust/Cargo and the Xcode command-line tools, then run:

```sh
npm --prefix pm-client run desktop:build
```

The bundle is written to `pm-client/src-tauri/target/release/bundle/macos/Beads PM.app`. It embeds the frontend and does not need a development server. On first launch, choose a local BD 1.2.2 embedded workspace. Distribution signing and notarization are not configured.

## Development checks

```sh
npm --prefix pm-client test
npm --prefix pm-client run lint
npm --prefix pm-client run build
```

The tests use synthetic data and do not invoke `bd`. See [verification and remaining work](pm-client/docs/PROGRESS.md) for the distinction between automated, browser and native checks. An opt-in Rust integration test uses a fresh temporary BD workspace.

## Repository layout

```text
pm-client/          Beads PM: React, TypeScript, Vite and a Tauri shell
app/                Scotty: Next.js pages and API routes
components/         Scotty UI components
lib/                Scotty's BD adapter and shared helpers
desktop/            Scotty's existing macOS shell
docs/scotty.md      Scotty setup, features and operation
```

The two desktop shells have separate application identifiers. Beads PM reuses selected helpers, uses its own Layers2 icon and invokes BD through a typed Rust adapter.

## Scotty and the fork

For the existing application, follow the [Scotty guide](docs/scotty.md) and [desktop setup](desktop/README.md). Both desktop applications use a configured local Beads workspace. Browser PM remains a synthetic preview.

- Fork: [Junyu06/bead-me-up-scotty](https://github.com/Junyu06/bead-me-up-scotty).
- Upstream: [brendan-appstart/bead-me-up-scotty](https://github.com/brendan-appstart/bead-me-up-scotty).
- Customized development branch: `local/simple-project-backlog`.
- Upstream updates are reviewed and merged into the customized branch; fork changes are preserved.

The repository stores application source. Local `.beads` databases, credentials, machine configuration, dependencies and generated app bundles are excluded from source commits.

## Documentation and license

- [Beads PM guide](pm-client/README.md) · [中文使用说明](pm-client/README.zh-CN.md)
- [Design](pm-client/docs/DESIGN.md) · [Beads integration boundary](pm-client/docs/BD_CONTRACT.md)
- [Progress and verification](pm-client/docs/PROGRESS.md)

[MIT](LICENSE). The original Scotty project is by Brendan; its copyright notice is retained in `LICENSE`. Beads PM is developed in this fork.
