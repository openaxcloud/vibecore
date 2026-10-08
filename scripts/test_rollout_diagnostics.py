"""Hermetic regression tests; no cluster, credentials or npm install needed."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("diagnostics", Path(__file__).with_name("capture-rollout-diagnostics.py"))
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class RolloutDiagnosticsTest(unittest.TestCase):
    def test_only_platform_status_is_retained(self):
        pod = {
            "kind": "Pod", "metadata": {"name": "vibecore-vibecore-platform-api-123", "annotations": {"secret": "PRIVATE"}},
            "spec": {"containers": [{"env": [{"value": "PRIVATE"}]}]},
            "status": {"phase": "Running", "conditions": [{"type": "Ready", "status": "False", "message": "PRIVATE"}],
                       "containerStatuses": [{"name": "api", "ready": False, "restartCount": 3,
                                              "state": {"waiting": {"reason": "CrashLoopBackOff", "message": "PRIVATE"}},
                                              "lastState": {"terminated": {"reason": "OOMKilled", "exitCode": 137, "message": "PRIVATE"}}}]},
        }
        rows = diagnostics.summarize([pod, {"metadata": {"name": "other-platform-api"}}], "vibecore")
        self.assertEqual(len(rows), 1)
        self.assertNotIn("PRIVATE", json.dumps(rows))
        self.assertEqual(rows[0]["containers"][0]["lastState"]["terminated"]["reason"], "OOMKilled")

    def test_hook_and_init_container_failures_are_retained(self):
        rows = diagnostics.summarize([
            {"kind": "Job", "metadata": {"name": "vibecore-vibecore-platform-prisma-migrate"},
             "status": {"failed": 1, "conditions": [{"type": "Failed", "status": "True", "reason": "DeadlineExceeded"}]}},
            {"kind": "Pod", "metadata": {"name": "vibecore-vibecore-platform-api-123"},
             "status": {"initContainerStatuses": [{"name": "init", "state": {"terminated": {"exitCode": 1}}}]}},
        ], "vibecore")
        self.assertEqual(rows[0]["conditions"][0]["reason"], "DeadlineExceeded")
        self.assertEqual(rows[1]["containers"][0]["state"]["terminated"]["exitCode"], 1)

    def test_capture_errors_are_explicit_without_stderr(self):
        for error in (subprocess.CalledProcessError(1, "kubectl", stderr="PRIVATE"), subprocess.TimeoutExpired("kubectl", 10), OSError("PRIVATE")):
            with self.subTest(error=error), patch.object(diagnostics.subprocess, "run", side_effect=error):
                result = diagnostics.snapshot("vibecore", "vibecore")
                self.assertIn("captureError", result)
                self.assertNotIn("PRIVATE", json.dumps(result))

    def test_real_child_exit_status_and_pre_rollback_evidence(self):
        for code in (0, 1, 23):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "status.jsonl"
                # Failed pod disappears after the command returns, as in an atomic
                # rollback. The intermediate status must still be in the artifact.
                snapshots = [{"resources": []}, {"resources": [{"name": "failed-api", "phase": "Pending"}]}]
                with patch.object(diagnostics, "snapshot", side_effect=lambda *_: snapshots.pop(0) if snapshots else {"resources": []}):
                    actual = diagnostics.capture([sys.executable, "-c", f"import time; time.sleep(.08); raise SystemExit({code})"], "vibecore", "vibecore", output, .02)
                self.assertEqual(actual, code)
                rows = [json.loads(line) for line in output.read_text().splitlines()]
                self.assertEqual(rows[-1]["commandExitCode"], code)
                self.assertTrue(any(row.get("resources") == [{"name": "failed-api", "phase": "Pending"}] for row in rows))
                self.assertEqual(rows[-2]["resources"], [])

    def test_unwritable_evidence_prevents_starting_upgrade(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(diagnostics.subprocess, "Popen") as start:
            with self.assertRaises(OSError):
                diagnostics.capture(["helm"], "vibecore", "vibecore", Path(directory))
            start.assert_not_called()

    def test_workflow_captures_upgrade_and_uploads_on_failure(self):
        workflow = Path(".github/workflows/deploy-main.yml").read_text()
        upgrade = workflow.split("- name: Helm upgrade (all services pinned by digest)")[1].split("- name: Verify rollout")[0]
        self.assertIn("python3 scripts/capture-rollout-diagnostics.py", upgrade)
        self.assertIn('--atomic', upgrade)
        self.assertIn('--timeout 10m', upgrade)
        upload = workflow.split("- name: Upload rollout status evidence")[1].split("- name:")[0]
        self.assertIn("if: always()", upload)
        self.assertIn("${{ runner.temp }}/rollout-status.jsonl", upload)
        self.assertIn("python3 -m unittest discover -s scripts -p test_rollout_diagnostics.py", workflow)


if __name__ == "__main__":
    unittest.main()
