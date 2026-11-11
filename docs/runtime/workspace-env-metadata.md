# Workspace environment and panel metadata

The IDE historically stores several platform panel records in the project env-vars table. Their exact reserved keys are listed in `services/api/src/workspace-env-metadata.ts`. These records remain readable and writable through the same panel APIs. They are excluded only when the API builds the application environment for workspace start, restart, on-demand provisioning and scheduled jobs.

Changing package execution history, IDE settings or workflow metadata must not change a workspace pod's immutable environment. Previously these JSON records entered the pod manifest along with real application variables, so reopening the IDE after a panel mutation could unnecessarily recreate the workspace pod. No stored record is deleted or migrated by this boundary.

The exclusion is an exact key list, not a `VIBECORE_` prefix filter. Application variables, scope precedence, actual secrets and runtime configuration retain their existing behavior. Actual application environment/secret changes may still require pod recreation. Existing pods containing these metadata keys may undergo one replacement when their next desired manifest removes them. This does not bypass normal readiness or provisioning failure handling.

The runtime run 43063490277 reported immutable env changes (not ordering-only), including 17:13:33.208 and 17:13:37.823 UTC. The second transition observed a terminating pod with exit 143 and deletionTimestamp present. The diagnostic does not reveal which env keys changed, so it cannot attribute every observed recreation to panel metadata; the audit also adds genuine env variables and secrets.

The audit's Packages action passed a real command-success gate and showed the dependency row after reload. No package timeout policy changes are justified by that successful run. Its later file 404 responses and IDE-state 412 have separate semantics: this fix does not filter those errors, remove optimistic concurrency checks or claim they are all resolved.

Validation: `node --test scripts/ci/workspace-env-metadata.checks.mjs`. Tests execute the actual API environment projection with controlled inputs, including every scoped metadata key, genuine application variables and precedence, and verify that panel-only mutations leave the desired runtime environment unchanged. Full repository checks and another disposable runtime remain required.
