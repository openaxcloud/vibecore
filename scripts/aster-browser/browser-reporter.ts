import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { failBrowserCheckpoint, writeBrowserCheckpoint } from './browser-diagnostics.mjs';

/** Only fixed enums leave this reporter. No test title, error message, URL or attachment is copied. */
export default class BrowserCheckpointReporter implements Reporter {
  onBegin() { writeBrowserCheckpoint('browser-runner'); }
  onTestBegin() { writeBrowserCheckpoint('browser-fixture'); }
  onTestEnd(_test: TestCase, result: TestResult) {
    if (result.status !== 'passed') failBrowserCheckpoint(result.status === 'timedOut' ? 'test-timeout' : 'failed');
  }
  onError() { failBrowserCheckpoint(); }
  onEnd(result: FullResult) {
    if (result.status === 'passed') writeBrowserCheckpoint('browser-complete', 'completed');
    else failBrowserCheckpoint(result.status === 'timedout' ? 'test-timeout' : 'failed');
  }
}
