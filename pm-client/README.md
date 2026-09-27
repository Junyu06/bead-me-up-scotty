# Beads PM preview

English | [简体中文](README.zh-CN.md)

A local Mac project-management client inside the [Scotty fork](../README.md). This is the **UI-01 interactive preview**, using synthetic data and a fixed clock. It does not connect to, write to, or start a process for a real Beads workspace.

## Run

Use Node.js 22.12 or later and npm. From the repository root:

```sh
npm ci
npm --prefix pm-client ci
npm --prefix pm-client run dev
```

Open [http://127.0.0.1:1420](http://127.0.0.1:1420). The preview uses React, TypeScript and Vite. The root dependency installation is needed for the shared Scotty schema and checklist helper; Scotty's Next.js server is not started.

For the Mac app, install Rust/Cargo and Xcode command-line tools, then run from the repository root:

```sh
npm --prefix pm-client run desktop:build -- --debug
```

Open `pm-client/src-tauri/target/debug/bundle/macos/Beads PM Preview.app`. The app embeds the frontend and does not require a running development server. This is a local development build, not a signed and notarized distribution release. It has a separate application identifier and does not replace the installed Scotty application. The application icon is temporarily reused from Scotty.

## Check

From the repository root:

```sh
npm --prefix pm-client test
npm --prefix pm-client run build
npm --prefix pm-client run lint
```

The tests bundle the shared TypeScript boundary with esbuild before running Node's test runner. They never call `bd`. Automated, browser and Mac verification are recorded separately in [PROGRESS.md](docs/PROGRESS.md).

## Try the preview

- Projects: open a project, expand a milestone, or inspect a project containing direct tickets.
- Board: filter by scope, owner, priority or label; choose a completion window (5 hours, 1 day, 3 days by default, 7 days, all, or custom dates) and reveal another 20 records.
- Map: expand/collapse containers, inspect cross-milestone edges, pan/zoom or move a node using its outer frame. Ticket buttons open the shared detail panel.
- Need Me: inspect review, decision and action requests. Submit a decision or action response, then inspect the saved response and original request in detail. Responding does not close or unblock the ticket.
- Project Timeline: open a plan bar or deadline, then edit dates in the shared detail panel.
- Review: open `demo-a`, inspect its evidence and confirm acceptance of that one example. `demo-b` becomes Ready; `demo-e` remains blocked by `demo-c`.
- Creation: new tickets start in Idea with no project assignment, including when created inside a project. Unsaved creation, edit and response drafts have leave protection.

Creation, editing and acceptance change the in-memory example only. Reloading restores the fixture; filter and Map presentation preferences remain local. Each acceptance concerns one ticket; it does not close parent projects or start an agent. The app has no built-in AI chat or automatic classification.

## Current limits

Real Beads reads/writes, native readiness, durable saves and real close/reopen operations are not connected. The preview's simulated readiness is not a production BD implementation. See [PROGRESS.md](docs/PROGRESS.md) for remaining UI issues and verification limits.

See [DESIGN.md](docs/DESIGN.md), [BD_CONTRACT.md](docs/BD_CONTRACT.md), [LOCAL_FACTS.md](docs/LOCAL_FACTS.md), and [PLAN.md](docs/PLAN.md). Source and reused assets remain under the repository's [MIT license](../LICENSE).

## Collapsible workspace header

Project Overview, Board, Map and Timeline open with their title and filters expanded. Scroll down to collapse them; scroll up or select **展开** to restore them. The project tabs remain visible, and active filters are indicated beside the expand button. Need Me shares the compact filter behavior. Board column names stay visible while scrolling.

Horizontal scrolling and Map pinch zoom do not toggle the header. Search and select controls stay visible while focused. Keyboard controls and reduced-motion settings are supported.

With `npm run dev` running, verify the interaction in another terminal from `pm-client/`:

```sh
PM_TEST_URL=http://127.0.0.1:1420 npm run test:ui
```

The browser test uses Playwright from the root dependencies. Install its Chromium browser once with `npx playwright install chromium` from the repository root. Set `PM_BROWSER=webkit` to exercise WebKit when that Playwright browser is installed.
