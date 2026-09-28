# Implementation scope

This document summarizes the accepted product plan dated 2026-09-25. The latest request explicitly allows implementation in the existing Scotty repository; that supersedes the earlier separate-repository suggestion. The application remains a distinct Tauri + React + TypeScript + Vite entry point under `pm-client/`.

The initial delivery was UI-01, a synthetic visual preview. After reviewing the UI, the user explicitly selected an existing local BD workspace for real use. The native client now implements complete CLI snapshots, basic create/edit, request responses and explicit close/reopen. The browser remains a disposable preview.

The product uses the existing Beads workspace as business truth. Projects and milestones are management objects, tickets are execution objects. Projects can directly contain tickets or mix direct tickets and milestones. Individual human acceptance remains distinct from implementation completion; unresolved prerequisites continue to block dependent work.

## Delivery sequence from the supplied plan

| Unit  | Outcome                                                      |
| ----- | ------------------------------------------------------------ |
| UI-01 | Clickable visual preview and environment evidence            |
| UI-02 | Complete real read-only snapshots and native readiness       |
| UI-03 | Create/edit one real issue and explicit relationship changes |
| UI-04 | Review delivery and individual human close/reopen            |
| UI-05 | Complete daily project progress and Board behavior           |
| UI-06 | Real nested Map, stable layout and dependency context        |
| UI-07 | Real dates, plans and Timeline                               |
| UI-08 | Daily-use Mac packaging and reliability                      |

These are plan identifiers, not BD IDs. They are not a duplicate task tracker. The native release implements the core UI-02 through UI-04 paths and adapts UI-05 through UI-08 for local use. This does not establish every original unit as fully accepted: advanced dependency editing, forecasts, server/routed workspaces, distribution signing and broad reliability testing remain outside the delivered implementation. See PROGRESS.md for actual checks.

UI-01 covers a project with no milestones; a mixed project with direct tickets, populated milestones and an empty milestone; cross-milestone dependencies; a Review prerequisite; standalone tickets; long Chinese text; and exactly 231 historical closed tickets. All examples have synthetic IDs and content. The fixture clock is fixed at 2026-09-25 16:00 UTC.

Visual acceptance belongs to the user. Build and test success establishes implementation behavior, not acceptance of the design.
