"""Bounded allowlisted baseline evidence; never include logs, errors or browser content."""
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

STAGES = {
    "create-local-cluster", "build-local-images", "start-local-dependencies",
    "migrate-local-postgres", "start-real-api-and-manager", "browser-baseline",
}
OUTCOMES = {"success", "failure", "cancelled", "skipped"}


def read_small(path):
    try:
        if path.is_symlink() or path.stat().st_size > 4096:
            return {}
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def outcome(value):
    return value if isinstance(value, str) and value in OUTCOMES else "unknown"


def instant(value):
    if not isinstance(value, str) or len(value) > 40:
        return "unknown"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc).isoformat() if parsed.tzinfo else "unknown"
    except ValueError:
        return "unknown"


def render(root, env):
    stage = read_small(root / "baseline-stage.json")
    assertions = read_small(root / "browser-assertions.json")
    result = read_small(root / "result.json")
    sha = env.get("GITHUB_SHA", "")
    sha = sha if re.fullmatch(r"[0-9a-f]{40}", sha) else "unknown"
    reached = stage.get("stage")
    reached = reached if isinstance(reached, str) and reached in STAGES else "not recorded"
    job = outcome(env.get("BASELINE_JOB_STATUS"))
    recipe = outcome(env.get("BASELINE_RECIPE_OUTCOME"))
    cleanup = outcome(env.get("BASELINE_CLEANUP_OUTCOME"))
    passed = (job == recipe == cleanup == "success" and result.get("ok") is True
              and result.get("scope") == "authenticated-browser-baseline-only"
              and assertions.get("registration") is True and assertions.get("preview") is True)
    verdict = "PASS" if passed else "FAIL" if "failure" in (job, recipe, cleanup) else "NOT CONFIRMED"
    summary = "\n".join([
        "## Browser baseline — functional only", "",
        f"- Verdict: {verdict}", f"- SHA: `{sha}`", f"- Last recorded stage: {reached}",
        f"- Job / recipe / cleanup: {job} / {recipe} / {cleanup}",
        "- Registration assertion: " + ("passed" if assertions.get("registration") is True else "not confirmed"),
        "- Authenticated iframe marker assertion: " + ("passed" if assertions.get("preview") is True else "not confirmed"),
        f"- Recipe start (UTC): {instant(stage.get('startedAt'))}",
        f"- Last stage update (UTC): {instant(stage.get('updatedAt'))}",
        "- New-volume reopen, direct pod bytes, AI generation: not tested.",
        "- Artifact upload: disabled for this mode. No cache upload configured.", "",
    ])
    assert len(summary.encode()) <= 2048
    return summary


if __name__ == "__main__":
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
        output.write(render(Path("private-runtime-evidence"), os.environ))
