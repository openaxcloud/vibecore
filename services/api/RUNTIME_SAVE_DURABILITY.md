# Runtime file saves: durability and concurrency

The ordinary runtime `PUT files/write` and non-directory `POST files` now acknowledge `204` only after the project IDE-state manifest contains the exact requested entry (including encoding and `ecrit`). The response header `x-vc-file-persistence: manifest` identifies this guarantee. The existing manifest must be present before the runtime mutation, and must remain present during the version-checked merge and readback. No one-entry replacement manifest is synthesized.

On a manifest read/write/readback failure the response is `409`, code `PROJECT_FILE_PERSISTENCE_FAILED`, header `x-vc-file-persistence: unconfirmed`, and `retryable: false`. The `persistence` object distinguishes `runtime: not_applied` (preflight failed) from `runtime: applied` (agent acknowledged, durable result unconfirmed); `manifest` is `unconfirmed` in both cases. No backend exception, path, or content is included in that diagnostic. An unconfirmed commit may have actually reached the database; retries must tolerate this uncertainty.

`retry: write` describes the existing PUT recovery operation, not a safe automatic replay instruction in the presence of concurrent writers. After resolving the failure and verifying the current runtime content, an explicit PUT of the intended content reattempts persistence. POST creation remains exclusive: repeating it after a partial success must not overwrite an existing file or silently accept EEXIST. Missing manifests require restoration of a known complete manifest through the existing project recovery workflow; repeated saves alone cannot repair that prerequisite. No recovery is performed on a real user project by this change.

## Three distinct systems

- Runtime: mutable workspace-agent filesystem; agent acknowledgement does not prove durable storage.
- Durable manifest: version-checked IDE state in the API store. This change confirms that store entry by reading it back. Tests use the test store and failure injection, not a production database outage.
- Project storage/export: the server ZIP route reads the manifest and materializes project storage before archiving. It can still fail independently while storage is unavailable. A save does not claim that a ZIP was already created or that materialization cannot subsequently fail. Tests unzip the server-produced archive after recovery and verify exact content plus unaffected files. Workbench `downloadZip` can reflect only in-memory files and is not this evidence.

Streaming writes (`x-vc-write-origin: stream`) deliberately remain runtime-only, with header `x-vc-file-persistence: runtime-only`; artifact close performs their separate persistence. Directory operations do not create file-manifest entries. Non-project workspaces likewise have no project-manifest guarantee.

## Minimal compatible concurrency extension (proposal, not implemented)

Add an optional strong content revision to the existing file read response, hashing decoded file bytes, and accept the corresponding optional `If-Match` on PUT. `files/revision` currently does not hash content and must not be used as this token. Keep legacy PUT support explicit: without a precondition it remains an unconditional write.

Forward the condition to workspace-agent. The agent must serialize comparison AND write per canonical workspace/path, and route all its conditional and unconditional file mutations through that same coordination. Reject a stale condition with 412 without changing the file. Creation retains the existing exclusive `wx` operation. Tests must send two simultaneous writes from the same initial revision and show exactly one winner, including API replicas pointing to the same agent. An API GET followed by POST, or an API-process mutex, does not establish that property.

Even that agent coordination cannot claim exclusion against terminal processes, git operations or other filesystem writers that bypass it; those require a shared writer protocol. Nor does it make the runtime and database a transaction. A failure after the agent writes but before manifest commit remains a partial result. Safe automatic conditional recovery needs a durable operation receipt/idempotency identity binding original revision, resulting bytes and persistence status; otherwise a retry must resolve conflicts instead of replaying an old overwrite. Do not roll back the pod blindly because another writer may have advanced it.

Client coordination with #765: runtime-remote now skips identical content only when the current call explicitly has `streaming: true`. Every non-streaming `writeFile`, including a repeated save after an old bare 204 or after a streaming write, reaches the API and must receive a fresh durability result. The memo still tracks every successful runtime write, so streaming A → human B → streaming A does not mistakenly skip the final A. Higher-level callers that never invoke the adapter because of their own cache remain part of coordinated #765 work; this adapter fix cannot repair an already-open client executing old code.

The review follow-up also changes the retry predicates in runtime-remote, runtime/retry.ts and ActionRunner. It does not change file validation, formatting or readback behavior. No real project mutations, deployment or merge are part of this patch. Independent review is required before merge.

## Validation on the isolated branch

Base: `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`. Running the new ten-case regression suite in an isolated checkout of that base produced nine failures and one passing optimistic-retry control. The patched suite passes all ten.

Commands (from repository root unless stated):

```sh
# From services/api:
../../node_modules/.bin/vitest run --config vitest.config.ts src/runtime-save-durability.spec.ts src/tests/manifeste-crud-durable.spec.ts src/tests/critical-paths.spec.ts src/tests/relecture-retour.spec.ts src/tests/reouverture-version-utilisateur.spec.ts src/tests/app-public-copy.spec.ts
# From repository root:
node_modules/.bin/vitest run scripts/index-a-jour.spec.mjs
node_modules/.bin/tsc --noEmit -p services/api/tsconfig.json
node_modules/.bin/tsc --outDir /tmp/vibecore-api-durable-build --rootDir services/api/src --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022 --types node --skipLibCheck true --esModuleInterop true --strict true --resolveJsonModule true services/api/src/server.ts
node_modules/.bin/eslint services/api/src/runtime-save-durability.spec.ts
```

Results: 41 API tests and six documentation-index tests pass; API typecheck/build pass; new test lint passes. Direct lint of `app.ts` remains blocked by existing repository debt (366 errors / 13 warnings on the base; 362 / 13 after this change, none in the modified sections). No lint policy or tests were weakened. The pnpm launcher attempted automatic installation into an unavailable home directory, so validation used the installed binaries directly. Full repository tests, production database fault injection and production/live UI validation were not run.


## Review follow-up: partial writes must not replay

The initial 503 contract was unsafe: runtime-remote automatically retried it, and higher-level ActionRunner retried even non-transient failures. A real-adapter/API regression demonstrated the old call resolving successfully after overwriting a peer that wrote between attempts. The API now returns 409 (conflict requiring explicit recovery), retaining the failure code and partial-state metadata, with `retryable: false`.

The code `PROJECT_FILE_PERSISTENCE_FAILED` is an explicit no-replay result at all three existing layers: runtime-remote's transient classifier, `withRuntimeRetry` (including callers supplying a broad custom predicate), and `ActionRunner.#runActionWithRetry`. The client guards also recognize the former 503 response during mixed-version rollout. They preserve the original RuntimeError and its partial-state details; POST is not automatically repeated into an EEXIST error. This does not make unrelated network failures safe to retry, and it does not provide conditional overwrite protection.

Additional proofs: the real adapter is connected to the real API via injected fetch for both PUT and POST, a peer writes before delivery of the partial response, exactly one original request is sent, and the peer bytes survive in runtime and server ZIP. A later explicitly invoked write is still possible (no false-success cache entry). Four tests exercise ActionRunner → withRuntimeRetry → real remote adapter for PUT/POST and 409/legacy-503, asserting one request, original persistence error, failed action and retained peer content. The transport in those layered tests simulates the response; the separate API tests exercise the actual backend.

Client overlap for parent coordination: ActionRunner changes only its retry-stop predicate and imports, plus tests. No edits to JSONC validation or the file/diff application readback owned by #765.


Rollout constraint: deploy the client retry guards with or before the API change. Legacy ActionRunner retries a 409 too, so changing only the server status does not protect already-open clients. The new guards reject both 409 and legacy 503 persistence failures; existing open sessions need the updated client. The retry contract is scoped to the explicit persistence-failure code, not generic network timeouts with an unknown outcome.

Follow-up validation: 43 API tests, 116 frontend/index tests and all 74 runtime-remote tests pass. The four layered regression cases fail with the previous retry implementations and pass with the guards. API build passes. ESLint passes for both changed frontend source files, their tests and the API regression file. runtime-remote retains the same two unrelated lint errors as the base (naming-convention / prefer-const); no lint or test rule was disabled.

API and runtime-remote typechecks pass. The broad local root-tsconfig command remains red (exit 2, 692 diagnostics); it is not the configured CI typecheck command. The same-base countercheck below establishes that these diagnostics are identical on the original base and this patch.

The frontend production build also passes with the repository's configured memory budget: `NODE_OPTIONS=--max-old-space-size=8192 node_modules/.bin/react-router build`. The initial direct invocation without that budget exhausted the default Node heap; no source or build protections were changed to obtain the passing build.


## Review follow-up: streaming-only deduplication

Two new transition tests fail before the fix: streaming → identical human save, and legacy bare-204 acknowledgement → identical human save. Both now pass. Twenty identical streaming fragments still produce one request; twenty ordinary saves produce twenty requests. Existing streaming changed-content, A → B → A, distinct-path and shell-invalidation protections remain tested. A mixed streaming A → ordinary B → streaming A case also confirms the memo tracks the latest runtime write.

Two API integration cases connect the real adapter to the API, seed runtime-only content (actual streaming route or simulated legacy server 204), inject a durable-store failure during an identical ordinary save, assert the failure is surfaced, then explicitly retry and verify exact content in the server ZIP. The legacy response is simulated only for the first acknowledgement; the failing save and recovery use the real API. The suite now has 14 durability cases, and all 77 runtime-remote tests pass.


## Same-base global typecheck countercheck

Command: `NODE_OPTIONS=--max-old-space-size=8192 node_modules/.bin/tsc --noEmit` from the same workspace, with unchanged dependencies, compiler configuration and generated files. The corrected source was measured first; all eight changed/added TypeScript files were then replaced temporarily by their exact `18745bd04f77e4d9fc6353d61bd4d17a3822f94e` versions (the newly added API regression file absent on base), measured again, and restored byte-for-byte. No CI files or gates changed.

Both runs exit **2** with **692 diagnostics**. Their complete 270,376-byte outputs are **byte-identical**, SHA-256 `a028117dd149d0f7d7d3867a63c50a6ea4724b5e1333ffaa308da958bf84ce31`. This establishes preexisting diagnostics on that base in this environment; it does not make the global gate green or authorize bypassing CI.

Local evidence: `/tmp/durable-typecheck-comparison/{current.log,base.log,summary.json,compare.py}`. The summary records the base SHA, exact overlaid paths and successful byte-for-byte restoration. The sources under comparison include the streaming-only cache correction and both transition regression tests.

Final regression pass after restoration: 45 API tests, 77 runtime-remote tests and 116 frontend/index tests. API and runtime-remote typechecks pass. The new API regression file has clean lint; runtime-remote source retains its two baseline errors and index.spec.ts has five errors/two warnings versus six errors/two warnings before (no added rule/message/severity diagnostics, all remaining findings outside the edited test block).
The final frontend production build after the streaming-cache adjustment passes with the same configured 8 GB Node heap.


## Required CI typecheck is a different command

Production CI runs `pnpm run typecheck` → `node scripts/typecheck.mjs`, not the broad root `tsc --noEmit`. That script checks web (`tsconfig.web.json`, which excludes test surfaces), node scripts, IDE browser helpers, Electron main/preload, then recursive workspace package typechecks. The 692-diagnostic countercheck therefore cannot be reported as a pass or failure of the configured CI step.

For SHA `57ab84e9d4540262f57799278bce939848782025`, GitHub Production CI run `39768580975`, job `119790387936`, reports the Typecheck step successful. The exact package script also exits 0 locally with pnpm 9.14.4 after repairing three missing installed workspace links already declared by package.json; no manifest or lockfile changes were needed. The initial local script failure at the node-scripts step is retained as an installation failure, not presented as a passing run. CI uses Node 22; the local environment uses Node 24.19.0.

Shareable sanitized countercheck, including the complete file/code/count inventory: https://github.com/openaxcloud/vibecore/pull/766#issuecomment-6339367432 . It contains no raw diagnostic messages, source snippets or machine paths.

The full API suite exposed an obsolete source-guard assertion requiring persistence errors to be swallowed. That assertion is replaced by a stronger guard for both PUT and POST requiring the explicit 409 persistence conflict, unconfirmed manifest and retryable:false. The behavioral durability and layered no-replay tests are unchanged. No test is skipped, no timeout is raised, and no CI rule is modified.
