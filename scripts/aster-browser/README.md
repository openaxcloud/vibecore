# Aster: local browser harness (not executed end to end)

Base: `3f5ce0261a3b1fc97694f904555d6a6916922640`. This separate preparation does not modify product code, workflows, or the archived backend recipe. It is not evidence that the Aster defect is reproduced or fixed.

## Actual browser sequence

`journey.pw.ts` uses the real registration, login and ZIP import forms. A unique, dependency-free npm project serves its marker on port 5173. The baseline must render that marker inside the actual Webview iframe and match direct pod hashes for package.json, server.cjs and aster-marker.txt.

The warm context retains its real localStorage seed marker. The clean context logs in through the UI but has never opened the project. Neither context receives fabricated cookies, revisions, seed markers, responses or repair files. Both leave the IDE before each replacement. Warm and clean arms each receive an independently replaced, positively observed empty volume; the clean arm cannot pass by reading files restored by the warm arm.

The test captures actual `[workspace] reattach decision` console fields, actual persisted markers, host pod/PVC identities and hashes, and iframe rendering results. Missing bytes and missing rendered content fail assertions. Infrastructure/protocol failure aborts the test and is not classified as an Aster result.

Browser HTTP and WebSocket requests are limited to one canonical loopback origin; AI paths are blocked. Service workers are disabled. `E2E_PROVIDER_MODE=absent` and absence of the four provider keys checked by the existing E2E policy are mandatory. No credentials or unrestricted console/network logs are attached.

## Blocking interface: trusted host producer is not implemented

`contracts.ts` is only a filesystem IPC consumer. A descriptor or receipt is an assertion from a trusted orchestrator, not independent proof of Kubernetes execution. Do not hand-write receipts to make this test pass. No shell hook, Kubernetes command, control HTTP route or simulated host implementation is provided here.

Before a live run, a reviewed host adapter must:

1. Create a private 0700 IPC directory and descriptor for this exact source, a new run and a disposable `vc-private-*` cluster. Independently verify kubeconfig/context, cluster identity, Docker ownership labels and absence of external credentials before any infrastructure mutation. Names alone are not sufficient.
2. Bind the project/workspace obtained from the real browser response to the fresh registration and imported synthetic project. Reject every other identity before any workspace mutation.
3. For `inspect`, read the actual pod files without writes and return hashes, pod UID, PVC UID and resourceVersion. Represent missing files explicitly, never replace them with fixture hashes. The resourceVersion must describe the PVC used for the next precondition.
4. For `replace-empty`, verify the expected identities, quiesce the workload and confirm the old pod has stopped. Use a standard Kubernetes delete with exact UID and resourceVersion preconditions, as reviewed in the separate backend recipe. An identity conflict must fail closed. Fence competing writers; merely parking browser pages is not sufficient fencing.
5. Provision the replacement volume, verify its different UID and empty contents read-only before releasing it for the next IDE opening. Do not seed, restore, copy archive bytes or create a fake marker. Record the conditional deletion and actual emptiness observation. Serialize all operations.
6. Atomically rename private 0600 receipt files into place, matching request ID, run, cluster, project, workspace and action. Clean up only resources owned by this run after independently checking those identities.

The browser cannot verify that an arbitrary receipt producer complied with these rules. This harness must not be connected to an unreviewed producer.

A real web/API/runtime/authenticated-preview stack behind the single loopback origin is also required. The current runtime client defaults to `/api/runtime`; this test observes its actual successful POST `/api/runtime/workspaces` and follows the real import redirect rather than assuming an `/ide` route. Separate API origins are deliberately not allowed. No gateway or stack startup is implemented in this patch.

## Scope of future evidence

ProjectWorkspaceProvider performs archive retrieval and application itself on its reseed branch. Therefore a backend-only archive/open test cannot provide this browser verdict. This harness exercises that product path only when run against the real stack. Actual logs, pod bytes and iframe content must be correlated; a context difference alone does not establish the cause. Full-page navigation preserves browser storage but resets page-module memory, so it does not cover SPA-only in-memory retention.

The historic `ci/private-runtime-browser-20261113` login/Webview structure was read as a reference only. Its branch and workflow were not activated. The backend patch `8655e88bfc537cb7c9989d1458800db7d1541a57b08cce1062b66d6f42dd732b` remains separate and unchanged.

## Local checks

Using Node 22.23.5 and the repository's frozen pnpm lockfile/store:

```sh
pnpm exec eslint scripts/aster-browser/*.ts
pnpm exec tsc -p scripts/aster-browser/tsconfig.json
pnpm exec vitest run scripts/aster-browser/contracts.spec.ts app/lib/runtime/workspace-seed-marker.spec.ts app/lib/runtime/workspace-reattach.spec.ts
pnpm exec playwright test --config scripts/aster-browser/playwright.config.ts --list
```

The final command is discovery only. The 4 new contract tests use synthetic values; the other 32 tests cover existing seed/reattach logic. None proves an actual volume replacement or browser journey.

The known local kind blocker is unavailable ip6tables filter support during Docker network setup. Clients are present; the cluster was not retried and no network/kernel setting changed. Shortest next step: review and implement the host adapter and single-origin stack integration on a compatible authorized disposable bench, then execute this same browser scenario once. No remote run, push, PR or production action is part of this preparation.
