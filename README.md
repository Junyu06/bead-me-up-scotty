# Beads PM — Scotty fork

English | [简体中文](README.zh-CN.md)

This repository is a fork of [Bead Me Up, Scotty](https://github.com/brendan-appstart/bead-me-up-scotty). It contains the existing Scotty application and **Beads PM**, a Mac project-management client developed in `pm-client/` with shared Scotty helpers.

## Choose an application

| Application | Source | Data | Start |
|---|---|---|---|
| Beads PM preview | [`pm-client/`](pm-client/README.md) | Synthetic records; edits last for the current session | `npm --prefix pm-client run dev` |
| Scotty | `app/`, `components/`, `lib/` | A configured local Beads workspace, or Scotty's demo data | `npm run dev` |

Beads PM currently provides Projects, Board, Map, Need Me, a shared detail panel and a project Timeline. The preview supports creation, editing, individual acceptance, decision/action responses and completion-date filters. It does not yet connect to a real Beads workspace. Reloading restores the sample records; display preferences remain local.

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
npm --prefix pm-client run desktop:build -- --debug
```

The bundle is written to `pm-client/src-tauri/target/debug/bundle/macos/Beads PM Preview.app`. It embeds the frontend and does not need a development server. This is a development build; distribution signing and notarization are not complete.

## Development checks

```sh
npm --prefix pm-client test
npm --prefix pm-client run lint
npm --prefix pm-client run build
```

The tests use synthetic data and do not invoke `bd`. See [verification and remaining work](pm-client/docs/PROGRESS.md) for the distinction between automated, browser and native checks. Real-data integration remains a separate development stage.

## Repository layout

```text
pm-client/          Beads PM: React, TypeScript, Vite and a Tauri shell
app/                Scotty: Next.js pages and API routes
components/         Scotty UI components
lib/                Scotty's BD adapter and shared helpers
desktop/            Scotty's existing macOS shell
docs/scotty.md      Scotty setup, features and operation
```

The two desktop shells have separate application identifiers. Beads PM reuses selected helpers and the current Scotty icon; it does not start Scotty's server or import its mutable BD adapter.

## Scotty and the fork

For the existing application, follow the [Scotty guide](docs/scotty.md) and [desktop setup](desktop/README.md). Scotty can operate on real local Beads data when configured; the PM preview cannot.

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
