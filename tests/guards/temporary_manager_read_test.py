import contextlib
import datetime
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('reader', ROOT / '.github/diagnostics/manager-pod-structure.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
SENTINEL = 'PRIVATE_SENTINEL_DO_NOT_PRINT'


def pod():
    return {'metadata': {'name': 'workspace-manager-old', 'annotations': {'secret': SENTINEL}},
            'spec': {'containers': [{'env': [{'value': SENTINEL}]}]},
            'status': {'phase': 'Failed', 'message': SENTINEL, 'reason': SENTINEL,
                       'conditions': [{'type': 'Ready', 'status': 'False', 'message': SENTINEL}],
                       'containerStatuses': [{'ready': False, 'state': {'terminated': {'exitCode': 1, 'message': SENTINEL}}}]}}


class StructuralReadTests(unittest.TestCase):
    def test_non_disclosure_and_shape(self):
        p = pod()
        p['status']['initContainerStatuses'] = [{'state': {'waiting': {'message': SENTINEL}}}]
        p['status']['ephemeralContainerStatuses'] = [{'state': {'running': {'message': SENTINEL}}}]
        result = reader.sanitize({'items': [p]})
        self.assertNotIn(SENTINEL, json.dumps(result))
        row = result['pods'][0]
        self.assertEqual(row['ready'], ['False'])
        self.assertTrue(row['containerStatuses']['states'][0]['integerExitCode'])
        self.assertTrue(row['initContainerStatuses']['states'][0]['waiting'])
        self.assertTrue(row['ephemeralContainerStatuses']['states'][0]['running'])

    def test_absent_and_contradictory_states_preserved(self):
        p = pod()
        p['status']['conditions'] = []
        p['status']['containerStatuses'][0]['state']['running'] = {}
        row = reader.sanitize({'items': [p]})['pods'][0]
        self.assertEqual(row['ready'], [])
        self.assertTrue(row['containerStatuses']['states'][0]['running'])
        self.assertTrue(row['containerStatuses']['states'][0]['terminated'])
        del p['status']['containerStatuses']
        self.assertEqual(reader.sanitize({'items': [p]})['pods'][0]['containerStatuses']['shape'], 'absent')

    def test_bounds_and_untrusted_values(self):
        p = pod()
        p['metadata']['name'] = SENTINEL
        p['status']['phase'] = SENTINEL
        p['status']['conditions'] = [{'type': 'Ready', 'status': SENTINEL}] * 100
        p['status']['containerStatuses'] *= 100
        result = reader.sanitize({'items': [p] * 100})
        self.assertTrue(result['truncated'])
        self.assertEqual(len(result['pods']), 32)
        self.assertEqual(len(result['pods'][0]['containerStatuses']['states']), 16)
        self.assertTrue(result['pods'][0]['containerStatuses']['truncated'])
        self.assertNotIn(SENTINEL, json.dumps(result))
        self.assertLess(len(json.dumps(result)), 100000)

    def test_one_fixed_read_no_retry(self):
        response = subprocess.CompletedProcess(reader.COMMAND, 0, json.dumps({'items': [pod()]}).encode(), b'')
        with patch.object(reader.subprocess, 'run', return_value=response) as command, contextlib.redirect_stdout(io.StringIO()) as output:
            reader.collect()
        command.assert_called_once_with([
            'kubectl', '-n', 'vibecore', 'get', 'pods', '-l',
            'app.kubernetes.io/name=workspace-manager,app.kubernetes.io/instance=vibecore',
            '--request-timeout=20s', '-o', 'json'], capture_output=True, timeout=25, check=False)
        self.assertEqual(json.loads(output.getvalue())['total'], 1)

    def test_failures_never_print_raw_output_or_retry(self):
        for response in [subprocess.CompletedProcess([], 1, SENTINEL.encode(), SENTINEL.encode()),
                         subprocess.CompletedProcess([], 0, SENTINEL.encode(), b''),
                         subprocess.CompletedProcess([], 0, b'{}', b''),
                         subprocess.CompletedProcess([], 0, b'X' * (8 * 1024 * 1024 + 1), b'')]:
            with self.subTest(response_code=response.returncode), patch.object(reader, 'preflight'), patch.object(reader.subprocess, 'run', return_value=response) as command, patch.object(reader.sys, 'argv', ['reader']), contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()) as stderr:
                self.assertEqual(reader.main(), 1)
                self.assertEqual(stdout.getvalue(), '')
                self.assertEqual(stderr.getvalue(), 'MANAGER_DIAGNOSTIC_FAILED\n')
                command.assert_called_once()

    def test_preflight_blocks_before_any_read(self):
        for env in [{}, {'GITHUB_REF': 'refs/heads/other'}, {'GITHUB_RUN_ATTEMPT': '2'}]:
            with patch.dict(os.environ, env, clear=True), patch.object(reader.subprocess, 'run') as command, contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(reader.main(), 1)
                command.assert_not_called()

    def test_expiry_blocks_before_any_read(self):
        env = {'GITHUB_REPOSITORY': 'openaxcloud/vibecore', 'GITHUB_REF': 'refs/heads/main',
               'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_RUN_ATTEMPT': '1', 'GCP_PROJECT_ID': 'vibecore-production'}
        with patch.dict(os.environ, env, clear=True), patch.object(reader, 'EXPIRY', datetime.datetime(2000, 1, 1, tzinfo=datetime.timezone.utc)), patch.object(reader.subprocess, 'run') as command, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(reader.main(), 1)
            command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
