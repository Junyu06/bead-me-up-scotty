# Scotty desktop (macOS)

A Tauri 2 window that owns a local Scotty server. Closing the window or quitting
stops that server. It selects a free loopback port and waits for a successful
project-list API response before opening the window. By default the window opens
the project picker. An optional `project_id` opens that workspace directly in its
default view (Overview unless Focus is enabled). Startup errors
show a native alert.

This first version uses an existing built Scotty checkout, Node and bd installed
on the same Mac. It is not a self-contained redistributable application. Rebuild
the checkout to update the web app; rebuild this bundle to update the shell.

Create `~/Library/Application Support/Scotty/desktop.json` privately:

```json
{"repo":"/absolute/scotty", "board":"/absolute/board", "config_home":"/absolute/config", "node":"/absolute/node", "path":"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"}
```

The board must already contain `.beads`. A fresh Scotty configuration registers
that directory automatically; an existing configuration retains its projects.
To open a workspace directly, add `"project_id": "your-workspace-id"` to the JSON;
copy the ID from `/p/<id>` in the browser after selecting the workspace. Omit it
to use the project picker. Actor identity comes from the normal Scotty settings,
`BEADS_ACTOR` environment variable, or OS username. This reuses data; it does not
initialize or migrate it.
Logs append to `server.log` beside the private configuration. Avoid running the
old browser launcher concurrently, since it uses the same configuration file.

Build with Rust and Xcode installed:

```sh
python3 desktop/bundle.py /absolute/output/Scotty.app
```

The local bundle is ad-hoc signed. No signing identity or private paths are stored
in source. Native IPC capabilities are not granted to the local web page.
