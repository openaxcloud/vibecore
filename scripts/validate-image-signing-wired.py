#!/usr/bin/env python3
"""Policy gate (B6): assert image signing is still wired into every build config.

The Kyverno admission policy refuses unsigned images in namespace `vibecore`.
That makes the signing steps load-bearing: if one is deleted, renamed or
softened to `allowFailure: true`, builds keep going green and the breakage only
appears later as pods refused mid-rollout. This gate turns that into an obvious
failure on the deploy path instead.

HERMETIC BY DESIGN — no third-party imports. This gate exists to protect the
supply chain; a control that itself pulls an unpinned dependency (PyYAML, whose
presence on the runner was incidental, never guaranteed or version-pinned) is a
weaker control and a reproducibility hole. Cloud Build configs are 2-space
indented and we author all four, so a structural split on step boundaries is
sufficient and depends on nothing outside the Python 3 standard library. Run
`python3 scripts/validate-image-signing-wired.py --self-test` to exercise the
parser against synthetic pass/fail fixtures.

Run by .github/workflows/deploy-main.yml (job: preflight-gates). Exits non-zero
with GitHub Actions ::error annotations on violation.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CONFIGS = [
    "infra/cloudbuild/runtime-tier.yaml",
    "infra/cloudbuild/single-web.yaml",
    "infra/cloudbuild/single-admin.yaml",
    "infra/cloudbuild/workspace-agent.yaml",
]
SIGN_SCRIPT = "scripts/cosign-sign-images.sh"

# A top-level step under `steps:` starts with exactly two spaces then "- ".
# Block-scalar script bodies (>= 6-space indent) and list items under args/env
# never match this, so it reliably finds step boundaries without a YAML parser.
_STEP_START = re.compile(r"^  - (?=\S)")
# A step-body key sits at exactly four spaces of indent (or on the "- " line
# itself). Six-plus-space lines are nested list items / block-scalar content.
_BODY_KEY = re.compile(r"^    (\w[\w.-]*):(.*)$")
_DASH_KEY = re.compile(r"^  - (\w[\w.-]*):(.*)$")


def _steps_block(text: str) -> list[str]:
    """Return the lines belonging to the top-level `steps:` sequence.

    The block runs from the line after `steps:` until the next line that starts
    a different top-level key (column-0, non-comment, non-blank) such as
    `substitutions:`, `images:`, `options:` or `timeout:`.
    """
    lines = text.splitlines()
    out: list[str] = []
    in_steps = False
    for line in lines:
        if not in_steps:
            if line.rstrip() == "steps:":
                in_steps = True
            continue
        # A non-indented, non-blank, non-comment line ends the steps block.
        if line and not line[0].isspace() and not line.lstrip().startswith("#"):
            break
        out.append(line)
    return out


def _split_steps(block: list[str]) -> list[list[str]]:
    """Split the steps block into one list-of-lines per top-level step."""
    steps: list[list[str]] = []
    current: list[str] | None = None
    for line in block:
        if _STEP_START.match(line):
            if current is not None:
                steps.append(current)
            current = [line]
        elif current is not None:
            current.append(line)
    if current is not None:
        steps.append(current)
    return steps


def _step_key(step: list[str], key: str) -> str | None:
    """Return the raw value string of a top-level key within a step, or None.

    Looks only at real step-body keys (the `- ` line and 4-space-indented
    lines), never at nested list items or block-scalar content. The value has
    trailing whitespace and any trailing `# comment` stripped.
    """
    for i, line in enumerate(step):
        m = _DASH_KEY.match(line) if i == 0 else _BODY_KEY.match(line)
        if m and m.group(1) == key:
            value = m.group(2)
            # Strip a trailing comment only when it is clearly a comment
            # (preceded by whitespace); none of the values we read contain '#'.
            value = re.sub(r"\s+#.*$", "", value)
            return value.strip()
    return None


def _is_true(value: str | None) -> bool:
    return value is not None and value.strip().lower() == "true"


def _waitfor_never_runs(value: str | None) -> bool:
    """True if a waitFor value is the 'runs before anything' sentinel ['-']."""
    if value is None:
        return False
    normalized = value.replace(" ", "").replace('"', "'")
    return normalized in ("['-']", "[-]")


def check_config(path: str) -> list[str]:
    problems: list[str] = []
    p = Path(path)
    if not p.is_file():
        return [f"::error file={path}::build config is missing"]

    steps = _split_steps(_steps_block(p.read_text()))
    if not steps:
        return [
            f"::error file={path}::no `steps:` sequence found — cannot verify "
            "image signing is wired"
        ]

    # Identify signing steps by what they DO (invoke the signing script), not by
    # their id — renaming a step must not be a way to slip past this gate.
    signing = [s for s in steps if any(SIGN_SCRIPT in line for line in s)]
    if not signing:
        problems.append(
            f"::error file={path}::no signing step found "
            f"(expected a step invoking {SIGN_SCRIPT})"
        )
        return problems

    for step in signing:
        sid = _step_key(step, "id") or "<unnamed>"
        if _is_true(_step_key(step, "allowFailure")):
            problems.append(
                f"::error file={path}::signing step '{sid}' is allowFailure: "
                "true — it would emit unsigned images that are then refused at "
                "admission"
            )
        # A signing step that never runs is the same as no signing step.
        if _waitfor_never_runs(_step_key(step, "waitFor")):
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


# ---------------------------------------------------------------------------
# Self-test: exercises the hermetic parser against synthetic fixtures so a
# regression in the parser fails loudly instead of silently passing bad configs.
# Runs with only the standard library: `python3 <this> --self-test`.
# ---------------------------------------------------------------------------
_GOOD = """\
steps:
  - id: fetch-cosign
    name: gcr.io/cloud-builders/docker
    waitFor: ['-']
    args:
      - -c
      - |
        set -euo pipefail
        docker pull example
  - id: sign-images
    name: gcr.io/cloud-builders/docker
    waitFor: ['push-images', 'fetch-cosign']
    args:
      - -c
      - |
        set -euo pipefail
        # allowFailure: true  <- a comment in a script body must NOT trip the gate
        bash scripts/cosign-sign-images.sh $REFS
substitutions:
  _REGION: europe-west9
"""

_ALLOWFAILURE = _GOOD.replace(
    "    waitFor: ['push-images', 'fetch-cosign']",
    "    waitFor: ['push-images', 'fetch-cosign']\n    allowFailure: true",
)

_WAITFOR_DASH = _GOOD.replace(
    "    waitFor: ['push-images', 'fetch-cosign']",
    "    waitFor: ['-']",
)

_NO_SIGNING = """\
steps:
  - id: build
    name: gcr.io/cloud-builders/docker
    args: ['build', '.']
"""


def _self_test() -> int:
    import tempfile

    failures: list[str] = []

    def run(name: str, content: str, expect_problem: bool) -> None:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".yaml", delete=False
        ) as fh:
            fh.write(content)
            tmp = fh.name
        problems = check_config(tmp)
        Path(tmp).unlink()
        got = bool(problems)
        status = "ok" if got == expect_problem else "FAIL"
        if got != expect_problem:
            failures.append(
                f"{name}: expected problem={expect_problem}, got {problems}"
            )
        print(f"  [{status}] {name}: problems={problems}")

    run("good config passes", _GOOD, expect_problem=False)
    run("allowFailure signing step flagged", _ALLOWFAILURE, expect_problem=True)
    run("waitFor ['-'] signing step flagged", _WAITFOR_DASH, expect_problem=True)
    run("missing signing step flagged", _NO_SIGNING, expect_problem=True)

    if failures:
        print(f"SELF-TEST FAILED: {len(failures)} case(s)")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("SELF-TEST OK: 4/4 parser cases")
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        sys.exit(_self_test())
    sys.exit(main())
