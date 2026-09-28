# Delivery and verification

Updated 2026-09-27. The native app now connects to a selected local BD workspace. The browser keeps the UI-01 examples. Earlier preview verification is retained below as history.

## Map ordering, containment and edge routing

The earlier native verification established loading and persistence, but did not establish readable layout on nested real records. A later Map review exposed reversed stage order, flattened descendants of executable parents, and default smooth-step edges crossing cards.

The Map now orders sibling branches by prerequisite relationships with stable natural-order ties, retains executable parents as nested containers, and sizes containers from their children. Orthogonal routing avoids cards and headers; arrows point from prerequisite to dependent. Filtered endpoints are not silently projected onto parents, including when their ancestor is collapsed, and completed dependents no longer appear as active aggregate edges. External and hidden prerequisites remain available in the dependency list; missing records show their ID without a broken detail action. Local layout preferences use a new version so stale coordinates do not preserve the defective layout.

Verification: the initial ordering and filtered-projection tests failed against the previous implementation. All 35 domain/model tests, lint, formatting and the release build pass. Chromium/WebKit checks sample rendered SVG paths against card/header rectangles and exercise folding, filtering and external or missing prerequisites. Independent review also checked dragging, persisted coordinates and long titles. An existing project was replayed read-only locally to inspect its hierarchy and path geometry. The final release app was installed, signature-verified and reopened with that project; order, nesting, routing and the filtered dependency list were checked in the native window. No BD records were modified for this correction.

## Native integration and copy revision

- Rust commands validate the selected embedded workspace, use argument arrays with bounded process execution, and read complete lists plus native Ready/Blocked. Routing and server configurations are rejected. Reads/writes within this app serialize.
- Create, minimal field edits, manual plan/date clearing, parent changes, responses, request changes, close and reopen use BD with readback. Full-content fingerprints detect edits that share BD's one-second timestamp. Existing labels and metadata are preserved. CLI calls are not transactions; the remaining external race and partial-write recovery are documented in BD_CONTRACT.md.
- A human label is shown as an unclassified request. Explicit labels identify review/decision/action. Legacy closures retain unknown acceptance. Molecule/ephemeral/template ancestor auto-close flows are rejected.
- Native mode opens workspace setup, not examples. Connection errors retain the last data and disable writes. The app refreshes idle lists and protects editing/response drafts. Browser live-mode tests use mocked IPC, not real user records.
- Removed the long toolbar preview notice in native mode, redundant project descriptions/empty-state explanations and Map's permanent gesture footer. The browser has one compact reset notice. The icon uses the same Layers2 geometry as the sidebar, on a neutral rounded background; its editable SVG and ISC notice are included.
- Timeline now follows the loaded date and supports range navigation; initial expanded groups and completion dates derive from records instead of demo IDs/dates. Map counts only filtered-out descendants in its hidden-ticket notice, including nested hierarchies; edge keyboard help matches the disabled deletion behavior.

Verification completed during implementation: 26 frontend/domain tests; Rust fingerprint/validation tests and the opt-in real-CLI round trip in a fresh temporary database; Chromium and WebKit interaction tests for the compact header, detail dismissal and native-mode IPC error/success paths. Independent adapter review reproduced and checked metadata merge, same-second edits, retries, route refusal and molecule parent safeguards. The arm64 release app built with ad-hoc signing and passed signature verification. In the installed native window, an edit in a fresh disposable BD workspace was saved, read back through the CLI, and retained after quitting and reopening. This is actual native evidence; it is separate from the mocked browser checks. The selected existing workspace was then opened read-only in the installed app, including Projects, Board, Map and Timeline; the workspace selection was restored after restart.

Remaining scope: arbitrary dependency editing, rich forecast generation, automatic project classification, embedded AI chat, nested management tools for BD infrastructure/molecules, multi-machine/routed/server access, Intel testing, Developer ID signing/notarization and distribution installation. These are not implied by the local native data connection.

## Earlier UI-01 preview evidence

## Detail dismissal follow-up

Clicking the gray area outside a detail panel now uses the same close action as Escape and the close button. Edit and response drafts retain their discard/continue confirmation. A pointer press inside the panel followed by release outside does not dismiss it, and a background click does not activate the navigation beneath it. The browser regression covers these paths and expanded reading mode.

## Latest verification: workspace header

- Project Overview, Board, Map and Timeline default to expanded headers. Vertical scroll intent collapses the title and filters with a short transition; upward intent or the persistent toggle restores them. Need Me shares the filter behavior. Switching views or projects resets to expanded.
- Project tabs and Board column names remain visible. Active filter counts remain in the compact toolbar. Hidden controls are inert; focused inputs remain visible and focus moves from a collapsing button to the persistent toggle. Reduced-motion preferences disable the transitions.
- At a 1280 × 720 viewport with extra filters visible, Board's scroll area increases from 377 to 570 pixels in Chromium, and from 393 to 570 pixels in WebKit. Browser assertions cover both scroll directions, horizontal scroll exclusion, preserved filter values, focus/Tab traversal, keyboard scrolling, view/project resets, obsolete saved-owner fallback, and Map pan/pinch behavior. Both browser engines passed the full interaction script; Map controls/footer also fit the native minimum of 1000 × 650 with expanded filters.
- 25/25 domain tests, PM lint, format and production build passed. The arm64 debug app was rebuilt with an actual bundled icon. A new-directory install/build check was also completed independently. The desktop app remains a development build; signing/notarization and real BD integration are not covered.
- Scotty's selected upstream fixes passed its production build and browser checks for theme persistence, drag feedback (including unresolved prerequisites), sorting/read-only guards, default views and Epic navigation. Production npm dependency audit reported no advisories at the time of this check. Root lint has one existing notification-navigation warning under the updated Next rules; the build also reports dynamic file-tracing warnings. These are separate from the PM checks.

## Delivered behavior

- Projects, project overview, seven-column Board, container Map, Need Me, shared detail and project Timeline run from one synthetic snapshot.
- Mixed/direct hierarchies, an empty milestone, standalone tickets, long Chinese text, cross-milestone dependencies and 231 historical closed tickets are present.
- Ticket scope/search/owner/priority/label filters are shared across work views; project-name/ID lookup is separate. The completion column defaults to 3 days and 20 visible records; presets are 5 hours, 1 day, 3 days, 7 days and all, plus custom dates. Windows use closing timestamps, with incremental expansion. History links explicitly select all dates. Full project progress is independent of visibility filters.
- Map uses real React Flow containers and edges. Containers collapse; multiple existing dependencies aggregate; positions and viewport remain local. Layout moves never alter membership. Keyboard deletion and connection creation are disabled.
- Review is distinct from closure. Accepting `demo-a` confirms its exact ID and title, makes `demo-b` Ready, and leaves `demo-e` blocked by `demo-c`. Parents remain open. Need Me also separates decision and action requests.
- New tickets start in Idea without a project assignment. Creation, detail edits and decision/action responses change memory only. Unsaved drafts are protected. Timeline displays manual plans, deadlines and forecasts separately; tickets follow their milestone in depth-first order.
- A separate Tauri Mac application embeds the frontend. The Rust entry point has no commands/plugins and does not launch `bd` or the Scotty server.

## Changes and reuse

Implementation is under `pm-client/`. The root TypeScript config excludes this separate application; root ESLint ignores its build output. Existing dirty files from prior Scotty work were left intact. No Scotty code commit or push was performed.

The frontend imports Scotty's dependency schema normalization and pure checklist helper. The existing Mac icon is a temporary placeholder. Private project memory and machine paths are kept outside the public repository.

## Automated checks actually run

| Check                                          | Result                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` in this directory                   | 24/24 passed, including new manual-blocking, container-readiness, independent-creation, request-response, project-search/history and rendered-summary regressions |
| `npm run lint`                                 | Passed without diagnostics                                                                                                                                        |
| `npm run build`                                | TypeScript and production Vite bundle passed                                                                                                                      |
| `npm run desktop:build -- --debug`             | Local arm64 `.app` built successfully                                                                                                                             |
| Root `NEXT_TELEMETRY_DISABLED=1 npm run build` | Complete Next production build passed; font download required network access                                                                                      |
| `git diff --check`                             | Passed                                                                                                                                                            |

The synthetic scale test used 1,000 records and 2,256 relations. Indexing plus project progress took 1.86 ms in the initial delivery run on this arm64 Mac with Node 22.23.2. This is a model-only measurement, **not** a rendering, refresh or real BD performance claim.

Vite reports an approximately 660 KB minified main chunk and ignored library `use client` directives. The build succeeds. Production splitting/performance work remains outside this preview. The existing root build reports workspace-root and file-trace warnings; these do not prevent its completed build. The root build result is from the initial delivery; it was not rerun for the isolated frontend revision.

## Priority workflow and terminology revision (2026-09-27)

- Manual blocking and dependency blocking now share a predicate. The initial project shows three blocked tickets. A manually blocked Review record cannot be accepted even when it has no dependency edges; both the domain operation and rendered action are checked.
- Project summaries expose decision/action counts. Need Me states its filtered count and the all-project count; responding updates both and preserves the original request plus response text/time in detail. Responses do not close or unblock tickets.
- Project-name/ID lookup is separate from ticket search. Project history and Map history explicitly open all closing dates in the intended scope.
- Creation uses “新建工单” and “创建”; the initial state is Idea with no parent. Slogans and repeated preview notices were removed; the toolbar retains the persistence notice. Entity wording uses 工单/里程碑/项目 while existing navigation and workflow stage names remain.
- Cancel-edit, close-detail and switch-record discard paths have separate destinations. Continuing an edit clears the old navigation target. Decision/action response drafts are also protected.
- Acceptance only adds executable tickets to fixture readiness; milestones remain open and never become ordinary Ready cards.

Actual browser checks: project search “阅读” followed by opening the project leaves the review ticket visible; its history link selects All and shows all eight closed records. Creating inside that project produces a detail with no parent breadcrumb. Need Me shows 2 scoped/4 global requests. Decision and action submissions preserve response records, retain Blocked status and reduce global pending requests from 4 to 3 to 2. A typed decision survives closing and choosing Continue. The stale-navigation reproduction (edit title, click parent, Continue, cancel edit, discard) stays on the original ticket with its original title. Accepting A produces B Ready and E still blocked; switching Board to milestones shows zero Ready containers. No console errors were recorded. Final project-list and creation-dialog layouts were visually inspected at the browser's 1280×720 viewport.

All 24 tests, lint, TypeScript/Vite production build and Tauri debug packaging passed. The new package is delivered separately as v3. This revision did not launch that native package or close the user's existing native session; native interaction evidence below remains from the initial delivery.

## Review refinements (2026-09-26)

The completion control and Done column now say “完成”. Its 5-hour/1-day/3-day/7-day/all selections were exercised in the browser: 3, 14, 26, 36 and 231 matching fixture tickets respectively. All starts at 20 shown and another batch increases it to 40. An added domain test covers exact 5-hour/3-day cutoffs, one millisecond outside, and future timestamps. Existing date/DST and global denominator checks pass.

Pale text colors were consolidated into neutral reading tokens while retaining layout, backgrounds and progress accents. Status labels use darker semantic colors. A DOM-based spot check of visible, enabled text at the inspected scroll positions found a minimum 5.22:1 on Projects (50 samples), 5.21:1 on Board (87 samples at the start and 115 at the completion side), and 5.22:1 on Map/Need Me. Ratios use computed foreground and nearest opaque background colors; this excludes SVG text, disabled controls, images, offscreen content and a full accessibility audit. Actual updated Projects/Board screenshots accompany the delivery.

This revision passed all 18 tests, lint, TypeScript/Vite build and native packaging. The root Next build remains the previously recorded passing result; its files did not change in this refinement. The newly packaged app is delivered separately as v2 so the user's active review session can stay open; that new native package was not launched in this revision. The user quits the current preview and opens v2 when ready. Native interaction evidence below belongs to the initial delivery.

The intended default is independent Idea capture. The September 27 audit found the earlier build inherited the current project filter; that mismatch is fixed and verified in the revision above. Later discussion with an external AI determines whether it belongs to an existing project, becomes a new project, or stays independent. There is no embedded AI or automatic classification. Child completion does not close a project or milestone; explicit parent acceptance/closure remains a later real-data workflow.

## Browser checks actually run (initial delivery)

Verified with the local Vite application in the in-app browser:

- Projects, Board, Map, Need Me and Timeline navigation; opening the common detail panel.
- Expanded milestone containment; direct project tickets; empty milestone; collapsed groups showing an aggregate of three dependencies.
- Default Done window (25 matching, 20 shown globally), All (231 matching, 20 shown), then another 20 (40 shown).
- Example acceptance: B becomes Ready while E stays Blocked; an unrelated node retains its position.
- Detail draft protection and saved example date changes; deadline stays separate from the manual plan.
- Need Me decision/action categories and today's two requests.
- New idea draft protection and creation as an unassigned Idea.
- Timeline rows appear directly below their milestone; date bars open detail.
- 1440×900 and 1280×800 visual checks for project list/Map and long Chinese text. Map's bottom hint has its own row so it does not cover cards. Board uses horizontal scrolling to retain readable columns.
- No browser console errors in the final checked session.

Actual screenshots were saved with the local delivery: Projects, Board, Map, Need Me, Timeline, review detail, narrow-window examples and the native app. They contain synthetic data only.

## Native Mac checks actually run (initial delivery)

Opened the delivered `.app` through macOS. Its WebView reported `tauri://localhost`, loaded the embedded project list, navigated to Map and opened review detail. Confirming acceptance of the one example produced B Ready and E Blocked. Quit/relaunch restored the sample records while retaining the selected view. The final rebuilt package was reopened and its updated Map was inspected and captured.

This is a local debug build. Developer ID signing, notarization, distribution/Gatekeeper installation, full keyboard/trackpad coverage, suspend/resume and Intel compatibility were **not run**. Browser results are not substitutes for those checks.

## Remaining boundary and next action

The current revision addresses the selected priority workflow defects and ticket terminology. Remaining audit items include the fixed Timeline viewport and fixture-specific view assumptions, request-changes provenance/assignee handling, cancelled-closure presentation/counting, cross-project dependency explanations and plan-date clearing. These were not implemented in this revision. UI-02 remains the next data-connection unit; no real data work was included.

Real BD snapshot completeness, special gate/readiness semantics, metadata mapping, worktree identity coordination, concurrency/conflict handling, CLI timeout recovery, isolated-database writes and real close/reopen flows are **not implemented or validated**. The local CLI/context/help checks are documented in `LOCAL_FACTS.md`; an attempted read-only list hit an embedded database lock-file permission error, so no full live snapshot was obtained. No business issue was created, edited or closed.

After visual review, UI-02 starts with resolving the read-only database access boundary and comparing a complete native CLI snapshot/readiness result with the client. Fixture readiness must not be reused as production truth.
