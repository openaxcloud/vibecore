import { writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class RuntimeBrowserProof implements Reporter {
  private passed = false;

  onTestEnd(test: TestCase, result: TestResult) {
    this.passed =
      test.title === 'template-created project boots and renders the generated app in preview' &&
      test.parent.project()?.name === 'chromium' &&
      result.status === 'passed';
  }

  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const passed = this.passed && result.status === 'passed';
    writeFileSync('private-runtime-evidence/browser.json', JSON.stringify({ chromiumTemplatePreviewPassed: passed }));
    return { status: passed ? 'passed' : 'failed' };
  }
}
