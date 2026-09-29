# Shared BD creation

The native Beads PM app, Scotty web and `beads-pm-create` call this Rust implementation. It uses the BD 1.2.2 CLI with a local embedded workspace.

| Created record | ID sequence |
|---|---|
| Epic without a parent (project) | `proj-1`, `proj-2`, … |
| Milestone, or epic with a parent | `milestone-1`, `milestone-2`, … |
| Task, bug, feature, chore, decision, spike, story | `id-1`, `id-2`, … |

Each workspace has three counters. Child tickets share the ticket counter across projects. Idea is a status, not a fourth sequence. IDs remain stable through status/type/parent changes. Closed/deleted numbers are not reused; failures may leave gaps. Historical IDs and title step numbers are unchanged. Label-based project groups in Scotty are not BD project records.

## Install

Build with Rust 1.89+ from the repository root:

```sh
npm run build:creator
```

This writes `crates/beads-core/target/release/beads-create`. Scotty discovers this build, a `beads-create` executable on PATH, or the current macOS Beads PM installation. Set `BEADS_CREATE_BIN` to an absolute executable path to select another installation. Docker includes the helper. The helper and embedded app expose a versioned `protocol` command; incompatible installations fail before creation.

## AI and CLI

From the source checkout:

```sh
node bin/beads-create.mjs create --workspace /path/to/workspace \
  --actor assistant --type epic --title 'Release project' --status open
node bin/beads-create.mjs create --workspace /path/to/workspace \
  --actor assistant --type milestone --parent proj-1 --title 'First milestone'
node bin/beads-create.mjs create --workspace /path/to/workspace \
  --actor assistant --type task --parent milestone-1 --title 'Verify the release' \
  --description-file /path/to/description.md --priority 2
```

The equivalent installed Node command is `beads-pm-create`; the standalone Rust command is `beads-create`. The native app binary also accepts these arguments without opening a window. Use `--help` for supported flags. Unknown flags are rejected. CLI defaults are `task`, priority 2 and `open`; choose `--status idea` for an Idea. A `parked` status must already be configured. New children inherit parent labels and have independent IDs.

The helper prints an operation UUID on stderr before writing. To retry the same request, pass that UUID using `--operation`; do not generate another token after an uncertain result. Success returns the BD record as JSON. Errors identify the operation and any partially created record. Inspect partial results through `bd show` before deciding how to recover. The web API accepts an `operation` UUID; API callers should keep it stable across retries, as the creation form does. Raw `bd create` continues to use BD's naming behavior.

For programmatic use, `create --workspace PATH --input-json` reads the `Create` object from stdin, with `title`, `description`, `operation`, `issue_type`, `priority`, `parent`, `assignee`, `labels` and `status`. This uses native form defaults (`idea`) when status is omitted; pass it explicitly for a CLI workflow.

## Verification and limits

```sh
cargo test --manifest-path crates/beads-core/Cargo.toml
cargo test --manifest-path crates/beads-core/Cargo.toml -- --include-ignored --nocapture
```

Ignored tests create fresh temporary Git/BD workspaces; BD must be on PATH. Integration tests cover independent sequences, hierarchy, inherited labels, retries, a separate-process lock, deletion, destination collisions and external edits. The lock coordinates this helper and native clients, not arbitrary BD processes. Native counter mode, routed workspaces and server databases are refused. See [the BD contract](../../pm-client/docs/BD_CONTRACT.md) for write-race and recovery boundaries.
