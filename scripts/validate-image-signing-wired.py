#!/usr/bin/env python3
"""Policy gate (B6): assert image signing is still wired into every build config.

The Kyverno admission policy refuses unsigned images in namespace `vibecore`.
That makes the signing steps load-bearing: if one is deleted, renamed or
softened to `allowFailure: true`, builds keep going green and the breakage only
appears later as pods refused mid-rollout. This gate turns that into an obvious
failure on the deploy path instead.

Run by .github/workflows/deploy-main.yml (job: preflight-gates). Exits non-zero
with GitHub Actions ::error annotations on violation.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

CONFIGS = [
    "infra/cloudbuild/runtime-tier.yaml",
    "infra/cloudbuild/single-web.yaml",
    "infra/cloudbuild/workspace-agent.yaml",
]
SIGN_SCRIPT = "scripts/cosign-sign-images.sh"


def check_config(path: str) -> list[str]:
    problems: list[str] = []
    p = Path(path)
    if not p.is_file():
        return [f"::error file={path}::build config is missing"]

    doc = yaml.safe_load(p.read_text()) or {}
    steps = doc.get("steps") or []

    # Identify signing steps by what they DO (invoke the signing script), not by
    # their id — renaming a step must not be a way to slip past this gate.
    signing = [
        s for s in steps
        if SIGN_SCRIPT in yaml.safe_dump(s.get("args", ""))
    ]
    if not signing:
        problems.append(
            f"::error file={path}::no signing step found "
            f"(expected a step invoking {SIGN_SCRIPT})"
        )
        return problems

    for step in signing:
        sid = step.get("id", "<unnamed>")
        if step.get("allowFailure"):
            problems.append(
                f"::error file={path}::signing step '{sid}' is allowFailure: "
                "true — it would emit unsigned images that are then refused at "
                "admission"
            )
        # A signing step that never runs is the same as no signing step.
        if step.get("waitFor") == ["-"]:
            problems.append(
                f"::error file={path}::signing step '{sid}' has waitFor ['-'] "
                "and would run before the image exists"
            )
    return problems


def main() -> int:
    problems: list[str] = []
    if not Path(SIGN_SCRIPT).is_file():
        problems.append(f"::error::{SIGN_SCRIPT} is missing")
    for cfg in CONFIGS:
        problems.extend(check_config(cfg))

    for line in problems:
        print(line)
    if problems:
        print(f"FAILED: {len(problems)} image-signing policy violation(s)")
        return 1
    print(f"OK: image signing wired in all {len(CONFIGS)} build configs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
