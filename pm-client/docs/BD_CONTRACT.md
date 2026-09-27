# Beads boundary — initial contract

**UI-01 is example-only.** No production adapter, real readiness projection, metadata write protocol, shell invocation, or workspace switch is enabled. A failed connection cannot silently switch to these fixtures because there is no connection mode in this delivery.

## Verified local CLI help and context

| Capability                    | Evidence / next integration boundary                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI discovery                 | Actual executable and version recorded in LOCAL_FACTS                                                                                                                           |
| Workspace identity            | `bd -C <workspace> --readonly context --json` reads configuration without opening the database; output includes backend, database, redirected/worktree flags and resolved roots |
| Complete list                 | Help confirms `list --all --limit 0 --include-gates --json`; default list limit is 50. Real output remains unverified because lock access failed                                |
| Native ready                  | Help confirms `ready --limit 0 --json`; default is 100. Actual output and semantics remain unverified                                                                           |
| Dates                         | `update --due`, `--defer`, `--estimate` are advertised by installed help. `defer` affects ready visibility and must not be reused as plan start                                 |
| Metadata                      | `update --metadata`, `--set-metadata`, `--unset-metadata` are advertised. Preservation, value shapes and targeted patch behavior must be tested in an isolated database         |
| Content                       | Installed help advertises `--title`, `--body-file`, `--acceptance`, `--design`, `--append-notes`, assignee, priority and incremental label updates                              |
| Parent                        | Installed help advertises `update --parent`; real behavior and dependency preservation are not yet tested                                                                       |
| Close / reopen / dependencies | Require current help inspection, isolated round-trip tests and native behavior verification in later units                                                                      |

Scotty's existing schema normalizes flat dependencies and the expanded detail shape. UI-01 exercises that helper on synthetic input; this does not verify the present live output. Unknown live fields and metadata must be preserved by the eventual adapter.

## Existing workflow documentation

The workspace documentation describes `idea` as a custom WIP status, `deferred` as an explicit pause, epic parent-child membership, and native blocking dependencies. It describes handing off work with a human label and human assignee. Those conventions are documentation evidence, not a fresh database inventory. A human label alone does not identify review versus decision versus action.

UI-01's `request.kind`, `role`, `plan`, `forecast`, and `closure` are typed fixture fields only. They are **not an approved `pm_client` metadata protocol**, and are never persisted. UI-03/04 must agree on minimal markers using existing BD conventions and write a workflow contract before real writes are enabled.

## Requirements for the adapter

Use typed business commands implemented in Rust with a configured executable and argument arrays. Validate IDs and allowed workspace roots; enforce timeout/output bounds; serialize by actual database identity. Do not expose arbitrary shell execution or access the database files directly.

Native `ready`/`blocked` are authoritative. Parent-child, conditional-blocks, waits-for, gates and exceptional release cannot be inferred from the simple demo rule. If context is incomplete, readiness is unknown. Review does not close a prerequisite.

Real edits require a fresh read, minimal field updates and readback. Distinguish omitted values from explicit clears. Preserve unknown labels and metadata, including non-object metadata. A timed-out mutation is unresolved until its outcome is checked; do not blindly repeat creates or comments. A local queue alone does not eliminate races with external agents.

Acceptance must use the verified native close operation for one explicit ID, with current delivery version and blockers re-read. Reopen invalidates reuse of earlier acceptance for a new delivery. UI-only overrides, automatic force, automatic parent closure and batch acceptance are outside the contract.

This document records verified capabilities and remaining checks; it does not claim UI-02 or production readiness.
