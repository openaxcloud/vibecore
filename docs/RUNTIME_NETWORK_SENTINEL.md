# Disposable runtime network sentinel

This diagnostic runs after the IDE audit in `e2e-runtime.yml`. It is transport evidence, not application coverage and not a replacement runtime verdict. All runtime scenarios and audit assertions still run unchanged. Failed requests are counted, never retried or filtered out.

## Scope and safety

The script requires GitHub-hosted Actions, the explicit ephemeral-runtime flag, a kubeconfig under RUNNER_TEMP, and the already-built workspace-agent CI image. It binds a synthetic HTTP server to loopback. A clean Chromium instance and Node issue independent bounded requests, including delayed responses with connection closure to exercise new connections. There are no provider credentials, external URLs, browser suppression flags, network configuration changes, new permissions, or production resources.

At most three cycle-boundary records retain only the numeric cycle index and create-start, ready and delete-complete timestamps, allowing comparison with unrelated background network activity.

Three phases are recorded: ten seconds baseline, up to three dedicated gVisor pod create/delete cycles, and ten seconds recovery. Names are runtime-network-sentinel-0 through -2 in the disposable workspaces namespace. Unique ownership labels constrain cleanup; pre-existing pods are not adopted or overwritten. Pods have no service-account token or volume, run non-root with read-only root filesystem and dropped capabilities, and use the existing image without pulling. The main deadline is 145 seconds; phase work sleeps are abortable and sampling settlement rejects after four seconds. Browser closure and final sampling settlement each have a two-second bound, and final pod cleanup is bounded to 18 seconds (171 seconds total budget), and the workflow step has a three-minute ceiling. The workflow's existing final namespace cleanup remains the backstop.

`ip -o monitor address link` observes host network events read-only. Lines are classified in memory and immediately discarded. The report contains only event type, timestamp and count, with 128 event records maximum per phase. It never persists interfaces, addresses, manifests, arbitrary URLs, headers, bodies or raw browser/network logs. Chromium failures are counted; only the fixed ERR_NETWORK_CHANGED category receives its own event counter. Node failure counts provide an independent control.

## Evidence and interpretation

The only new artifact is `runtime-network-sentinel.json`, explicitly included by the existing collector within its unchanged total artifact budget. JSON is redacted with the existing generated-credential redactor and capped at 32 KiB. A setup/observer/cleanup failure is reported separately and is not a passing experiment. No raw exception text is written.

A concentration of Chromium network-change failures during pod mutation, with stable Node requests and matching address/link events, would support runner network-notifier interference. Absence of failures does not disprove an intermittent issue. This experiment does not explain HTTP 502 responses from unavailable workspace agents and must not be used to suppress them. Only the disposable CI run can provide the real-browser/real-gVisor result; local unit tests validate guards, projection, bounds and cleanup scheduling.

Run unit checks with `node --test scripts/ci/runtime-network-sentinel.checks.mjs`. The guarded operational entrypoint is `node scripts/ci/runtime-network-sentinel.mjs`; do not override its guards outside the authorized runner.
