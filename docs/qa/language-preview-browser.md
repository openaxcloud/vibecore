# Chromium workspace preview check

Run from a pnpm-installed checkout on a Linux amd64 Docker host with gVisor (runtime `runsc`), Chromium and direct access to its internal bridge. The pinned public Debian Node image in the script must already be available locally. The Go argument points to an extracted Linux amd64 Go distribution (tested with 1.24.12). Python and Node come from the test image.

```sh
CHROMIUM_PATH=/usr/bin/chromium scripts/qa/language-preview-browser.sh /path/to/go
```

Each project starts a new read-only container with a private temporary workspace and a fresh compilation cache. Chromium opens the workspace-agent command WebSocket and launches a standard-library HTTP server. The test writes an HTML document through the agent file API, reads its visible text in Chromium, edits it and reloads the same URL. It closes the whole browser context, opens a new context and command connection, and verifies the edited text again without restarting the server.

Each JSON result records the time from the launch command to the first correct rendered text. This includes Go compilation and the readiness polling interval. Container startup is excluded. A failed assertion exits nonzero.

On base `5e9970f44636f321b5e4199253cae6bf17e3c716`, Chromium reloaded the original Python document after a successful write. With the fix, editable HTML sent through the agent carries `Cache-Control: no-store`. A separate regression test exercises HTML and asset responses using a real upstream HTTP listener.

The fixture covers Chromium and the real workspace-agent interfaces. The full IDE, ingress, template selection, workspace provisioning, and the signed Nix environment require the integrated platform recipe. The locally available Alpine base identifies itself as Alpine 3.24.4 with Node 24.22.3 and lacks Python and Go. Building the shipped agent Dockerfile locally failed at the Alpine package index (HTTP 403).

Two observed runs of the candidate passed the edit and reconnection assertions for all three languages.

| Cold preview | Run 1 | Run 2 |
| --- | ---: | ---: |
| Node | 354 ms | 951 ms |
| Python | 654 ms | 412 ms |
| Go | 34,746 ms | 31,316 ms |
