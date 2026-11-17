import json
import tempfile
import unittest
from pathlib import Path
from job_summary import render


class SummaryTests(unittest.TestCase):
    def test_untrusted_content_never_enters_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            malicious = "secret<script>arbitrary browser content</script>"
            for filename in ("baseline-stage.json", "browser-assertions.json", "result.json"):
                (root / filename).write_text(json.dumps({"stage": malicious, "error": malicious, "ok": True, "registration": malicious}))
            result = render(root, {"GITHUB_SHA": malicious, "BASELINE_JOB_STATUS": malicious})
            self.assertNotIn(malicious, result)
            self.assertNotIn("Verdict: PASS", result)
            self.assertLessEqual(len(result.encode()), 2048)

    def test_pass_requires_job_recipe_cleanup_and_both_assertions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "result.json").write_text(json.dumps({"ok": True, "scope": "authenticated-browser-baseline-only"}))
            (root / "browser-assertions.json").write_text(json.dumps({"registration": True, "preview": True}))
            env = {"GITHUB_SHA": "a" * 40, "BASELINE_JOB_STATUS": "success", "BASELINE_RECIPE_OUTCOME": "success", "BASELINE_CLEANUP_OUTCOME": "success"}
            self.assertIn("Verdict: PASS", render(root, env))
            env["BASELINE_CLEANUP_OUTCOME"] = "failure"
            self.assertIn("Verdict: FAIL", render(root, env))
            (root / "browser-assertions.json").write_text("x" * 4097)
            self.assertIn("Registration assertion: not confirmed", render(root, env))


if __name__ == "__main__":
    unittest.main()
