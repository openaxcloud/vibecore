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

Client follow-up must be coordinated with #765: `packages/runtime-remote/src/index.ts` around lines 582–584 skips repeated content and 602–603 caches after success. New failed saves no longer receive the false 204, so their cache is not updated. Historical cached false successes, and streaming-to-human transitions with identical content, still need explicit cache invalidation or persistence-aware caching. The targeted retry guards do not claim to repair those cached client states or add an atomic repair tool.

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

API and runtime-remote typechecks pass. The full repository typecheck exits 2 with 692 diagnostics outside the modified files; it is not a passing gate, and a full baseline comparison was not run for this follow-up.

The frontend production build also passes with the repository's configured memory budget: `NODE_OPTIONS=--max-old-space-size=8192 node_modules/.bin/react-router build`. The initial direct invocation without that budget exhausted the default Node heap; no source or build protections were changed to obtain the passing build.
