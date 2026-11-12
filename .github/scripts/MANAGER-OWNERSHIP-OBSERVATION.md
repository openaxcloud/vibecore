# Anonymous manager ownership observation

This read-only extension diagnoses selection. It does not change the rollout gate,
terminal-pod predicate, timeouts, rollback policy, identity or permissions. It never
excludes or deletes a pod. No production health or prior pod identity is attested.

## Fixed scope and bounds

The existing protected main-push observer runs the new helper through the unchanged
`cluster.sh prod-gateway kubectl` wrapper. The namespace remains `vibecore`, the
Deployment name is `vibecore-vibecore-platform-workspace-manager`, and both list
queries retain the exact workspace-manager/release labels. No target overrides
are accepted. Production approval and existing delivery identity remain mandatory.

The sequence is Deployment, ReplicaSets, pods, ReplicaSets, Deployment. Each GET
has a 15-second request timeout, a 20-second process timeout and a 1 MiB output
limit. Each list has at most 256 objects. A continued/incomplete list is refused.
There are no retries or fallback credentials. A denied GET, process error, bad
UTF-8/JSON, invalid resource identity or changed controller bracket stops the
observation; the shell removes partial output and the observation is uploaded
only on success. A separate fixed refusal receipt may be uploaded on failure.
Raw responses and stderr are never persisted or emitted by the helper. The
artifact contains at most 16 pod rows and 16 ReplicaSet rows, aggregate counts and
explicit omitted counts; names, UIDs, resourceVersions, revisions, labels,
annotations, images, node names and provider messages are not emitted.

## kubectl list compatibility and completeness limits

Official kubectl v1.34 `printGeneric` flattens API list responses, recomposes them
as `kind: List`, `apiVersion: v1`, and may emit an empty list resourceVersion.
The upstream JSON-output tests explicitly expect that shape. Both this generic
envelope and the original typed PodList/ReplicaSetList envelopes are accepted;
only the generic envelope may have `metadata.resourceVersion: ""`. Metadata must
still be an object, items must be an array, and every item must retain its exact
expected API kind/version, namespace, name, UID and nonempty resourceVersion.
Missing/duplicate identities and oversized lists remain refusals.

A visible nonempty or malformed `continue`, or a nonzero/malformed
`remainingItemCount`, is rejected. Kubectl's generic recomposition drops list
pagination metadata, so absence of these fields is **not an independent proof of
completeness**. The fixed command's successful exit remains mandatory. Upstream
selector traversal follows continuation pages; `printGeneric` can write a list
and still return an aggregated error. Any nonzero exit is therefore refused,
even with perfectly valid complete-looking JSON stdout. No retries or partial
stdout are accepted. This corrects client rendering compatibility, not trust in
unknown list sources.

The prior observer run on 24db failed without an attributable category. This
compatibility defect is reproduced from upstream code and fixtures, but is not
claimed as the proven cause of that run. Neither the resolved kubectl client
version nor server version was captured. No version query or extra cluster
invocation is added by this correction.

## Fixed refusal receipt

The helper may write `manager-ownership-failure.json` only inside the exact fresh
private evidence directory. It contains schemaVersion=1, outcome=`refused`, one
fixed stage (`setup`, `deployment-before`, `replicasets-before`, `pods`,
`replicasets-after`, `deployment-after`, `projection`), the corresponding index
0–6, and one category: `command`, `access-denied`, `parse`, `shape`, `scope`, or
`change`. Error object messages/fields never supply arbitrary receipt values.
Raw stdout/stderr, exception strings, resource data and credentials are excluded.
No observation data is uploaded on failure. A separate upload targets only this
receipt when the observation step failed and explicitly marked its creation.
Failure before helper invocation or a stale directory never enables that upload.

`access-denied` means a nonzero command exit with one recognized complete standard
single-line kubectl Forbidden/Unauthorized or gcloud PERMISSION_DENIED signature.
It is not exhaustive denial detection: the unchanged wrapper may suppress stderr,
and unrecognized/multiline errors remain `command`. No missing diagnosis is a
permission grant. Every category stops immediately without a retry, fallback,
new identity or IAM/RBAC change. Cleanup runs independently. Failure to write the
receipt leaves only the existing fixed error, never a fallback destination.

## What the projection means

The Deployment and each listed ReplicaSet must remain byte-semantically equal
(after canonical object-key ordering) across the bracket, including UID,
resourceVersion, generation, template and status. ReplicaSet list ordering is not
significant. List resourceVersions are deliberately not compared across reads or
resource kinds. This is a stable controller bracket, not an atomic multi-resource
snapshot; pod status may change immediately after its single list response.

A current-controller candidate requires a unique controller owner reference with
matching Deployment UID and name, a known equal revision annotation, and an equal
pod template after removing only the controller-generated `pod-template-hash`
label. Exactly one candidate, an observed Deployment generation and no deleting
Deployment/current ReplicaSet are required before classifying pod relations.
Pod-to-ReplicaSet references also match kind, API version, name and UID in the same
namespace. Missing, malformed, unresolved or ambiguous evidence remains unknown.

`current-controller` means only that the observed pod belongs to the controller
matching the **currently observed** Deployment. It does not associate that
Deployment with a particular GitHub rollout or verified release digest.
`other-owned-controller` means another observed ReplicaSet owned by that same
Deployment, not a proven historical pod or a stopped process. Zero desired/current
replicas on a ReplicaSet is not proof that an old process has stopped.

The terminality projection remains the unchanged strict conjunction. In
particular, `Failed` without conditions/container states is still nonterminal
under the deployment guard, regardless of owner relationship. All pods remain in
the diagnostic totals. No future gate change follows automatically from this data.

`nodeName` reports only `absent`, `empty`, `valid` (bounded syntactic form), or
`invalid`; owner-reference presence and validity are separate booleans. Kubernetes
uses nodeName as the assignment target and normally binds a pod to a node only
once. A nonempty nodeName is not proof that a container ran; an absent value in
this observation is not an attestation that a pod never ran. We do not certify
cluster version, admission behavior or historical binding from these fields.

## Review and operational limits

Changes remain local until independently reviewed and published by the owner of
the deployment task. A successful observer run explains only its present sample.
If reads are denied, stop rather than broadening RBAC/IAM or changing identities.
If controllers change during the sample, no observation artifact is published;
only the fixed refusal receipt may be published. A later
observation requires a separately authorized invocation through the same trusted
workflow; the helper does not poll or monitor in the background.

Tests use synthetic command responses and local command stubs. They cover the
actual workflow shell, unchanged target-verifying wrapper, denied reads,
malformed/bounded data, current and other owned revisions, concurrent controller
changes, unknown owners, nodeName projection, redaction and deployment isolation.
They do not establish real cluster permissions, rollout success or service health.

References:

- https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/
- https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#pod-template-hash-label
- https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#nodename
- https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-lifetime

- https://github.com/kubernetes/kubectl/blob/v0.34.0/pkg/cmd/get/get.go
- https://github.com/kubernetes/kubectl/blob/v0.34.0/pkg/cmd/get/get_test.go
- https://github.com/kubernetes/cli-runtime/blob/v0.34.0/pkg/resource/selector.go
