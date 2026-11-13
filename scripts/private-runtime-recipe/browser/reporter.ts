import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** Never upload traces, request headers, auth form values or arbitrary server/browser errors. */
export default class PrivateBrowserReporter implements Reporter {
  private _tests: { title: string; status: string }[] = [];
  onTestEnd(test: TestCase, result: TestResult) {
    this._tests.push({ title: test.title, status: result.status });
  }
  onEnd(result: FullResult) {
    mkdirSync('private-runtime-evidence', { recursive: true });

    const evidence = {
      scope: 'real browser UI with controlled imported code; no AI generation',
      status: result.status,
      tests: this._tests,
    };
    writeFileSync('private-runtime-evidence/browser-result.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ browserResult: evidence }));
  }
}
