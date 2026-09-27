# Preview design

## Visual direction

The reference is the supplied Safari + ChatGPT screenshot: a continuous light shell, quiet controls, readable body text, restrained separators, and navigation selected with a neutral background. The reference was inspected locally. Private screenshots and conversation content are not copied into this repository.

The client uses system fonts, a 224px sidebar, a compact toolbar, list-based project summaries and shared typography. State icons and short labels accompany color. Shared dark neutral text tokens carry reading content; sage remains on quiet surfaces and progress indicators. Status text uses a small, darker semantic palette. Board and Map use the available width. Detail has a 735px reading drawer and an expanded reading mode. No remote fonts, telemetry or remote assets are loaded.

The contrast revision targets at least 4.5:1 for normal text, using the [W3C contrast definition](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). This is a text-color target, not a claim of full accessibility conformance.

Presentation tokens are in `src/styles.css`; `prefers-reduced-motion` is respected. Secondary information is generally 12px. Map zoom scales its contents, with explicit zoom controls available.

## Shared model

`domain.ts` creates the snapshot index once in the root view. Ticket scope, search and filters are shared across work views. Project-name/ID lookup is a separate search; opening a project from that list clears the ticket search. History links open all closing dates in their project/milestone scope and clear other filters. Progress uses complete project scope and explicit executable roles, independent of display filters. Historical closure is labeled as unknown acceptance, not invented human approval. Empty containers say “not yet split.”

The fixture only models simple `blocks` dependencies. `stageOf()` and `acceptExample()` are sample behavior, not a production BD readiness implementation. Unknown status or incomplete readiness produces an explicit unclassified state. Review and blocking evidence coexist.

Explicit manual blocking and unresolved dependencies share one blocking predicate for project summaries, rows, Board cards and acceptance. Project summaries include review, decision and action requests. Need Me labels both its filtered count and the workspace count. Containers never enter executable readiness during sample acceptance.

`MapView.tsx` uses React Flow `parentId` and relative positions for actual milestone containers. Parent membership is not rendered as dependency edges. `map-model.ts` projects existing blocking edges onto collapsed containers; aggregated edges never feed readiness. Default positions are created once and saved as local presentation preferences. Changes to a ticket do not move unrelated nodes or fit the viewport. Re-layout is explicit. Closing the example prerequisite updates its outgoing dependencies without closing its parent.

The detail drawer is shared by all entry points. Example acceptance includes the exact ID and title, and acts on one ticket. Editing retains the draft, validates plan ranges and warns on leaving with unsaved changes. Markdown is rendered without raw HTML, active external links or remote images.

Canceling edits restores the saved record in the same drawer; closing the drawer and navigating to another record are separate discard destinations. Canceling a navigation prompt clears that destination. Decision/action responses retain the original request, response text and timestamp, remove the pending request, and leave ticket status, dependencies and assignee unchanged. Response drafts are protected on close and reload. These records remain sample memory only.

Creation uses ticket terminology: “新建工单”, “工单标题”, “工单描述” and “创建”. New tickets start in Idea with no project assignment, regardless of the current filters. Marketing slogans and repeated sample notices are removed; a single toolbar notice states the sample workspace and session-only persistence.

Timeline distinguishes manual plan bars, deadline diamonds and dashed forecast intervals. Missing dates remain unspecified. Date-only values are split into calendar components, not passed through UTC conversion. The preview edits dates through detail; plan dragging and downstream schedule recommendations belong to UI-07.

## Reuse

- `../lib/schema.ts`: Scotty's dependency normalization for flat list/export and expanded detail output.
- `../lib/beads-view.ts`: pure checklist counting helper.
- React Flow and Markdown libraries already used by Scotty.
- `../desktop/icons/icon.png`: temporary application icon, covered by the existing MIT license.

The existing UI, Next.js server, API routes, native process manager and mutable workspace adapter are not imported by this frontend. The preview's Rust entry point registers no IPC commands or plugins. Its capabilities list is empty and its packaged content security policy restricts remote loads.

## Technical references

- [Tauri architecture](https://v2.tauri.app/concept/architecture/)
- [Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- [React Flow subflows](https://reactflow.dev/learn/layouting/sub-flows)
- [Vite guide](https://vite.dev/guide/)

Documentation was checked on 2026-09-25. Local locked dependencies and build results are the compatibility evidence for this delivery.
