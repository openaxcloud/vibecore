# Secrets form lost during shell replacement

## Status

Local correction and focused React verification. Not yet merged, deployed, or certified live.

## Evidence

Runtime audit 43070313092 at commit `0f9b2ae8470412ddf243b249a06c49ab9cf2fee5` records:

- Trusted New secret click at elapsed 107056 ms.
- Form present at 107134 ms.
- Secrets panel replaced and form absent at 107355 ms.
- The following key-field fill reaches its existing 30-second timeout.

No scroll event occurs in this sequence. The earlier floating-menu scroll correction is retained unchanged.

`ProjectSecretsPanel` kept its open state and user-entered fields in component-local React state. Replacing the loading
shell destroys them. `ProjectMetadataForm` already uses the route-owned draft provider and does not need another store.

## Correction

- Keep only the inline form's open/edit identity, user-entered key/value, and pending-submit token in the existing
  route-owned provider. No module singleton, browser storage, panel response cache, telemetry, or new network request.
- Scope by the route's project, loader-selected workspace, editor window, and pane. The workspace comes from the same
  stable `currentWorkspaceId` used by adjacent route providers, not a later runtime resource ID.
- Preserve form state through warm replacement and cold loading gaps. Revealed stored secrets and password visibility
  remain component-local; a replacement masks the input again.
- Cancel, New-secret toggle-close, and successful unchanged Save remove the form entry and its values. A request token
  and immutable draft identity prevent an old response from closing a reopened form or erasing newer edits. Pending
  requests remain pending across replacement, preventing duplicate submissions.
- Return an explicit success/failure result from the two existing Secrets submit callers. HTTP failures, error
  envelopes, and rejected requests retain the draft. Existing void-returning callers remain compatible.
- Standalone callers retain a local lifetime only. Changing their scope replaces that store, including when navigating
  back to the previous project. Route departure destroys shared state; no full-page reload persistence is introduced.

Metadata behavior is unchanged: dirty fields survive replacement, and matching server acknowledgement releases them
so that later server values are visible.

## Verification

The new `ProjectSecretsPanel.handoff.spec.tsx` mounts the actual Secrets panel, metadata form, route provider, draft
state, and pure form helpers. It also executes both complete production submit callbacks extracted from `BaseChat.tsx`.
Presentation/i18n leaves and callback network responses are isolated. This is component/contract testing, not an actual
BaseChat browser mount or a live backend test.

- 34/34 cases pass using React 18.3.1 and JSDOM 26.1.0 with Node's test runner adapter.
- The same 34/34 cases pass using React 19.2.6 and JSDOM 26.1.0.
- Exact-head negative control: 22 failures and 12 passes, including both the immediate just-opened form loss and the
  user-edited cold-gap loss. The standalone-provider workspace test verifies the added provider contract; the real
  route already also has workspace-keyed parent providers.
- Strict focused TypeScript validation passes with React 18 types and ambient declarations for isolated dependency
  boundaries. Partial ESLint core-rule validation passes. Neither is the repository-wide gate.

The Vitest executable, full repository dependency graph, production build, original browser audit, responsive preview,
and deployment validation are not available in this local subset. Run the repository Vitest/lint/typecheck/build and
unchanged runtime acceptance audit on the composed commit before promotion. Existing audit waits, actions, assertions,
and retry counts are untouched.
