# Temporary manager pod structural diagnostic

Purpose: establish actual status shape of the twelve retained Failed manager
pods in deployment41853078231. Product PR891 remains separate; missing Ready
is not the established incident cause.

## Scope

Manual workflow_dispatch on main only, exact checkout SHA, existing production
environment and WIF provider/service account. Fixed vibecore-prod-app membership
in europe-west9, namespace vibecore and workspace-manager/instance=vibecore labels.
No arbitrary inputs. Five-minute job, single LIST with20second request/25second
process deadline, no retries. No pod/resource mutation, exec, IAM/RBAC/network
change, new secret, persistent credentials or AI call.

Raw JSON and provider errors are captured in memory and never printed/stored.
Output bounded to32pods and16statuses/category, filtered identities and fixed
categories only. No env, messages, arbitrary reasons, images, arguments,
annotations or user data. Non-disclosure, malformed JSON, command errors,
missing/contradictory states and output bounds have isolated tests.

First run attempt only. Expiry before authentication2026-11-05T23:59Z is only a
secondary safeguard; it does not replace actual removal.

## Protected installation and removal

All five changed paths are .github/**, tests/** or docs/**, explicitly excluded
from automatic Deploy Production pushes. Do not dispatch deployment. Preserve
normal PR checks, main/environment protections; no APPROVE or bypass.

After installation, dispatch temporary-manager-pod-read.yml ONCE from main with
no inputs. Record exact SHA/run/terminal result and sanitized log only. Do not
retry failure blindly. Pods absent now cannot reconstruct historical states.

Then remove the temporary workflow, Python collector and both diagnostic test
files through a separate protected PR. Retain this document and sanitized proof.
Verify workflow absence on main, no active diagnostic run, and no Deploy Production
run caused by installation/removal. Do not merge product891 during collection.

## Validation and capability

Three Vitest contracts including seven Python tests pass locally without cluster
access. ESLint/format checks pass. Existing action SHAs, production environment,
fixed target, permissions and deployment exclusions checked. No collection yet.

Available connector has no workflow_dispatch operation, and this environment has
no browser or existing CLI authentication. Do not install the temporary route
until a supported dispatch operator is coordinated. The parent/operator can use
GitHub Run workflow on main after protected installation. Do not substitute push
triggers, reruns of unrelated workflows or new credentials. This is a missing
capability, not an authorization denial.
