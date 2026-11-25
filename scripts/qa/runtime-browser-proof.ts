import { writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

export default class RuntimeBrowserProof implements Reporter {
  private passed = false;
  private readonly steps = new Map([
    ['Register synthetic user', 'pending'],
    ['Create project from template', 'pending'],
    ['Wait for running workspace', 'pending'],
    ['Open Webview', 'pending'],
    ['Run project from IDE', 'pending'],
    ['Load workspace preview document', 'pending'],
    ['Read generated app in Webview', 'pending'],
  ]);

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category === 'test.step' && this.steps.has(step.title)) {
      this.steps.set(step.title, step.error ? 'failed' : 'passed');
      console.log(`${step.title}: ${this.steps.get(step.title)}`);
    }
  }

  onStdOut(chunk: string | Buffer) {
    const message = chunk.toString().trim();
    if (/^PREVIEW_FRAMES \[(?:"(?:blank|local-preview|other-origin|relative)"(?:,|(?=\])))*\]$/.test(message)) {
      console.log(message);
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.passed =
      test.title === 'template-created project boots and renders the generated app in preview' &&
      test.parent.project()?.name === 'chromium' &&
      result.status === 'passed';
  }

  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const passed =
      this.passed && result.status === 'passed' && [...this.steps.values()].every((status) => status === 'passed');
    writeFileSync(
      'private-runtime-evidence/browser.json',
      JSON.stringify({ chromiumTemplatePreviewPassed: passed, steps: Object.fromEntries(this.steps) }),
    );
    return { status: passed ? 'passed' : 'failed' };
  }
}
