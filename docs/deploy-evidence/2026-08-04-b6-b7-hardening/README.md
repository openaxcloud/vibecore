# B7 hardening — Cosign/Kyverno reproducibility + pinning (2026-08-04)

Fixes for the two material defects an expert counter-audit flagged before the
Cosign/Kyverno chain (PR #81) could be considered reproducible and pinned. The
policy **stays in AUDIT / `failurePolicy: Ignore`** — Enforce is a separate,
later step gated on expert re-signing. Nothing here flips enforcement.

Fix commit: **`818228a4c9c01d765b53fe8b94f3c8a1ab4591a8`** (the `repo commit`
stamped at the top of `03-three-case-run.txt`).

## Defect 1 — Cosign fetched by a mutable tag → pinned by immutable digest

The three Cloud Build configs pulled `ghcr.io/sigstore/cosign/cosign:v2.4.3`
(mutable). Now each pins two independent, pre-execution provenance bindings:

| Binding | Value | Verified |
|---|---|---|
| OCI image digest (index) | `sha256:c77247c92f4dfea851c70555738226498393e34e2f9ca83cb959e51c230e4ad7` | `docker pull` content-verifies; digest = sha256 of the manifest bytes |
| `/ko-app/cosign` amd64 binary | `sha256:37db5533587f87c2f9225c5896b39e1ee238205e3a71ba9ff9f0c84a2fd14474` | `sha256sum -c -`, offline, registry-independent |

Derivation + re-verification steps: [`../../supply-chain/COSIGN_PINNING.md`](../../supply-chain/COSIGN_PINNING.md).
Diff: `infra/cloudbuild/{runtime-tier,single-web,workspace-agent}.yaml`.

## Defect 2 — validator imported `yaml` (PyYAML) → hermetic, stdlib-only

`scripts/validate-image-signing-wired.py` used PyYAML, which was incidentally
present on the runner but never pinned or installed — a reproducibility hole in
a supply-chain gate. Rewritten to parse the Cloud Build `steps:` structure with
the Python 3 standard library only. `deploy-main.yml` now runs `--self-test`
(4 synthetic pass/fail fixtures) before trusting the parser. No external
dependency remains.

```
$ python3 scripts/validate-image-signing-wired.py --self-test
  [ok] good config passes
  [ok] allowFailure signing step flagged
  [ok] waitFor ['-'] signing step flagged
  [ok] missing signing step flagged
SELF-TEST OK: 4/4 parser cases
$ python3 scripts/validate-image-signing-wired.py
OK: image signing wired in all 3 build configs
```

## Deliverable 3+4 — 3-case run, verification by digest

[`03-three-case-run.txt`](03-three-case-run.txt) — full transcript, stamped with
the fix commit SHA. Reproduce with [`repro/three-case-proof.sh`](repro/three-case-proof.sh)
(cosign v2.4.3 — the pinned pipeline version — + Kyverno CLI v1.13.4 + docker).

The harness signs three real images **by digest** into a throwaway registry and
runs the **actual Kyverno policy engine** (`kyverno apply`, same settings as
`infra/supply-chain/kyverno-policy-verify-images.yaml`) plus a `cosign verify`
cross-check:

| Case | Signature | Kyverno (Enforce) | cosign verify (by digest) |
|---|---|---|---|
| signed | trusted key (A) | **ADMITTED** (`pass: 2, fail: 0`) | VALID |
| unsigned | none | **REFUSED** (`no signatures found`) | INVALID |
| other-key | different key (B) | **REFUSED** (`no matching signatures`) | INVALID |

All references are `…@sha256:…` digests — verification is bound to the deployed
digest, never a tag. The transcript also shows the same unsigned image under
`failureAction: Audit` (PROD's current phase) producing a **warn only** (Pod
admitted + PolicyReport), confirming Audit is non-blocking.

The local proof uses throwaway keys because the prod private key lives in Cloud
KMS and never leaves it; the policy **settings** exercised (Cosign attestor,
`required: true`, `verifyDigest: false`, `rekor.ignoreTlog: true`) are identical
to the prod policy — only the key material and the registry glob differ.

## Deliverable 5 — minimal KMS rights, explicit failurePolicy, break-glass

See [`../../supply-chain/COSIGN_PINNING.md`](../../supply-chain/COSIGN_PINNING.md)
§4–§6:
- **Signing SA**: exactly `roles/cloudkms.signerVerifier` + `roles/cloudkms.viewer`
  scoped to the single key. **Kyverno**: zero KMS rights (offline verify), only
  `roles/artifactregistry.reader` on one repo.
- **failurePolicy**: explicit `Ignore` in the policy + `namespaceSelector: {vibecore}`.
- **Break-glass**: audited, prefer per-image retro-signing over weakening policy.

## Not changed (deliberately)

Enforcement stays **Audit**. The Audit→Enforce flip, `mutateDigest` false→true,
and `failurePolicy` Ignore→Fail remain gated on the branch merging to `main` and
expert re-signing — see [`../2026-08-03-b6-b7-supply-chain/README.md`](../2026-08-03-b6-b7-supply-chain/README.md).
