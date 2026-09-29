# Beads desktop contract

Updated 2026-09-29 with sequential ticket IDs and creation recovery checks. The native Tauri app uses typed Rust commands to call BD 1.2.2. The browser remains the synthetic UI preview. A failed native connection never selects fixtures.

## Workspace and transport

The user selects a workspace and BD executable. Settings live in the per-user app configuration directory, separate from application source. Discovery checks PATH and common Homebrew executable locations. No workspace, actor or issue ID from a developer's machine is compiled into the app.

Each operation uses a process executable and argument array, no shell. IDs and writable fields are validated. Commands have a 30-second bound and a 32 MiB output bound. BD's database implementation owns the database files. The client reads `routes.jsonl` only as routing configuration; it never opens database tables directly.

A global application mutex serializes connection, reads and writes. The canonical Beads directory, database and embedded mode identify the selected database. Every data operation verifies that identity, rejects redirected/server workspaces and checks routing configuration from DB and effective sources. Prefix routing is unsupported. Inherited BD/Beads environment overrides are removed; creation explicitly targets `--repo .`. This does not coordinate unrelated processes or make configuration checks atomic with the next CLI call.

## Snapshot and projection

Reads use `list --all --limit 0 --include-gates --include-infra --include-templates`, `ready --limit 0` and `blocked`. A second list around the status queries must match the first; changes cause a bounded retry or an error. This is a consistency check across separate CLI calls, not a database transaction. Malformed data or inconsistent IDs are rejected. Missing parent/dependency records make the UI incomplete and disable writes. Refresh failure retains the previous view, clears Ready and disables writes until a complete refresh.

Ready and blocking IDs come from native BD results. Fixture dependency calculations are never used for real readiness. Non-standard statuses remain unclassified rather than being guessed Ready. An epic with no parent becomes a project; a nested epic or native milestone becomes a milestone. Other records remain visible as tickets. The initial native release does not provide infrastructure-specific editors.

## Minimal workflow mapping

Existing BD fields remain authoritative: title, description, acceptance criteria, notes, status, priority, assignee, labels, dependencies, parent, due_at and closed_at. Unknown metadata and labels are not replaced by frontend projections.

- `human` alone means a pending human request (**待处理**), not review.
- One explicit `pm:review`, `pm:decision` or `pm:action` label identifies a request kind. Conflicting explicit labels are shown as unclassified human requests. Notes provide request context. The app does not infer a reviewer or rewrite ownership from a label.
- `metadata.pm_plan` contains ISO date-only `start` and `end`. Updates use BD's verified `--metadata` top-level merge. Other metadata keys and unknown plan properties remain intact. Non-object metadata cannot be edited as a plan.
- Responses append notes and remove only the answered request labels. The original notes remain. Request changes also sets `in_progress`, retaining the assignee because the prior implementer cannot be reliably inferred.
- An operation token in notes or the close reason identifies a retry. The client checks the resulting fields as well as the token; partial success is not treated as complete.

This is the implemented protocol for the native release. Earlier UI-01 fixture-only `request`, `forecast`, `responses` and `closure` fields were not a persisted protocol. No migration rewrites existing records. Automatic forecast generation and a structured external delivery integration remain future work.

## Editing, creation and recovery

Opening a detail uses `show`, with a SHA-256 fingerprint of its returned record. A fresh `show` must match the editing baseline before mutation. This detects changes even within BD's one-second timestamp resolution. Only changed fields are sent, including explicit empty values for clears, and the result is read back. Refreshing a selected detail restores its `show` fingerprint instead of replacing it with a list timestamp.

BD does not expose compare-and-swap for these edits. Another process can write after the last check, and a single `update` may apply fields and labels in separate steps. The client cannot promise atomic writes or rollbacks. A mismatch, timeout or partial failure preserves the UI draft and asks for inspection; it does not automatically replay a write.

New tickets use the workspace prefix plus a positive decimal sequence (`sample-1`, `sample-2`, …). Existing records keep their IDs, including IDs generated outside this client. A UUID operation receipt in `metadata.pm_create` is separate from the final ID. The receipt also stores the intended target ID. Retries search the complete list for this receipt (and recognize the former UUID-based IDs); multiple matches, changed contents, a different status or an unfinished rename stop for inspection. Creation tokens persist for the open form; restarting the app does not restore unfinished drafts.

The client holds an OS file lock at the canonical Beads directory's `pm-create.lock` for the entire creation sequence. A crash releases the lock; another client process reports busy before reserving a number. The high-water mark lives in BD configuration at `pm.sequence.<prefix>` and is advanced before creation. Existing exact numeric IDs also bound the next number. Deleted or failed reservations are not recycled, so failures can leave gaps. Other CLI processes do not obey this application lock.

BD 1.2.2's explicit `create --id` can replace an existing record; its native counter mode was also observed to select an occupied explicit numeric ID. The client leaves the global ID mode unchanged and refuses new creation when `issue_id_mode=counter`: renaming to a numeric ID does not advance BD's native counter, so a subsequent external create could overwrite it. The configured prefix must also satisfy BD's rename syntax (its first hyphen-separated segment must contain only lowercase ASCII letters). These checks stop before reserving a number or creating a record. It creates only at the operation UUID, verifies the new record, and uses native `rename` to claim the reserved short ID. Rename changes the primary key in a database transaction, which rejects an occupied destination. BD also updates text references in a later pass; the client only renames its just-created record, never existing user records. The rename command emits text even with `--json`; a successful exit is followed by exact-ID readback and receipt/content/state checks before the separate `idea:wip` transition.

An occupied destination, timeout or partial failure stops the workflow; it does not overwrite the destination, choose another ID automatically or create a duplicate on retry. Both the existing record and any newly created temporary record remain available for inspection. If numbering or the Idea transition remains incomplete, the error identifies the relevant IDs. These steps are not one transaction, and unrelated edits can still race a final read/write boundary.

This allocator applies to the client's ticket-creation entry point. External AI/CLI project creation keeps its existing behavior; configuring a separate project ID series requires that creation workflow to adopt an allocator too.

## Closing and reopening

Closing rereads the exact record and native blockers, then confirms the record fingerprint again. It passes one explicit ID to native `close`, with a revision and operation receipt in the reason; no force or continuation flag is used. Review closures can be identified as accepted, while earlier closures retain unknown acceptance provenance.

BD auto-closes some molecule/ephemeral/template parents. The client rejects closing within those ancestor chains so an ordinary confirmation cannot silently close a parent. Regular parent projects are not automatically closed by the client.

Reopening uses the verified `update --status open` behavior, which clears close timestamps/reason, removes old request labels and appends a receipt. Both reopen and request-response retries verify their terminal state; seeing a receipt alone is insufficient. An earlier acceptance is not reused after reopen.

## Evidence

Rust integration tests create their own temporary BD database. Independent review additionally tested same-second updates, metadata merge semantics, route changes and molecule parent closure. Browser tests use mocked IPC to check failed-save draft retention, repeated editing with fingerprints and failure states. Native app checks and the real workspace read are recorded separately in PROGRESS.md. No test mutates a user's real issue.
