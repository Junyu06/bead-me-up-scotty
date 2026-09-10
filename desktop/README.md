# Scotty desktop (macOS)

A Tauri 2 window that owns a local Scotty server. Closing the window or quitting
stops that server. It selects a free loopback port and waits for a successful
board API response before opening the window. Startup errors show a native alert.

This first version uses an existing built Scotty checkout, Node and bd installed
on the same Mac. It is not a self-contained redistributable application. Rebuild
the checkout to update the web app; rebuild this bundle to update the shell.

Create `~/Library/Application Support/Scotty/desktop.json` privately:

```json
{"repo":"/absolute/scotty", "board":"/absolute/board", "config_home":"/absolute/config", "node":"/absolute/node", "path":"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"}
```

The board must already contain `.beads`, and the Scotty config must register it
with workspace ID `board`. This reuses data; it does not initialize or migrate it.
Logs append to `server.log` beside the private configuration. Avoid running the
old browser launcher concurrently, since it uses the same configuration file.

Build with Rust and Xcode installed:

```sh
python3 desktop/bundle.py /absolute/output/Scotty.app
```

The local bundle is ad-hoc signed. No signing identity or private paths are stored
in source. Native IPC capabilities are not granted to the local web page.
