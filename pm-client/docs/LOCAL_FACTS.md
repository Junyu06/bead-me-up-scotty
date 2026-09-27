# Local environment observations

Verified on 2026-09-25. This file excludes private workspace contents and user-specific repository paths.

| Item                 | Observation                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| OS                   | macOS 27.0, build 26A428, arm64                                                                                                                |
| Node / npm           | 22.23.2 / 10.9.8                                                                                                                               |
| Rust / Cargo         | 1.94.0 / 1.94.0                                                                                                                                |
| Apple tools          | Xcode developer directory available                                                                                                            |
| BD executable        | `/opt/homebrew/bin/bd`                                                                                                                         |
| BD version           | 1.2.2, Homebrew                                                                                                                                |
| Workspace resolution | `bd --readonly context --json` returned a redirected embedded Dolt workspace, not the source repository's directory                            |
| Real list read       | `list --all --limit 0 --include-gates --json` with `--readonly` failed while opening the database lock: `openat LOCK: operation not permitted` |
| Data state           | Current issue contents, counts, labels, types and full dependency output were not read by that command                                         |

No global tool upgrade, database migration, repair, task mutation or credential change was performed. A read-only CLI mode can still require physical lock/file access; it is not proof of zero filesystem writes. UI-02 must resolve and verify the actual workspace identity and access before claiming a real connection.

The existing Scotty checkout had 18 modified tracked files and three untracked overview files when inspected. They were preserved. New work is under `pm-client/`, plus root TypeScript exclusion and generated-artifact lint ignores to keep the two build entry points separate.

The original repository declares a newer developer Node/npm preference but already runs on Node 22. The preview pins dependencies compatible with the current runtime instead of changing global tools. JavaScript resolution is locked in `package-lock.json`; Rust resolution is locked in `src-tauri/Cargo.lock`.

The macOS preview is a separate application. The installed Scotty bundle and its configured BD workspace are not replaced by this delivery.
