import { writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

export default class ReadmeProof implements Reporter {
  private passed = false;
  private readonly stages = new Map([
    ['Save README in the IDE and observe durable acknowledgement', 'pending'],
    ['Read the saved bytes from the runtime API', 'pending'],
    ['Read the saved bytes from the agent volume', 'pending'],
    ['Reopen README in a new tab with only the session cookie', 'pending'],
    ['Compare the exported ZIP entry bytes', 'pending'],
  ]);

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category === 'test.step' && this.stages.has(step.title)) {
      this.stages.set(step.title, step.error ? 'failed' : 'passed');
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.passed = test.parent.project()?.name === 'chromium' && result.status === 'passed';
  }

  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const passed =
      result.status === 'passed' && this.passed && [...this.stages.values()].every((value) => value === 'passed');
    writeFileSync(
      'private-runtime-evidence/readme.json',
      JSON.stringify({ passed, stages: Object.fromEntries(this.stages) }),
    );
    return { status: passed ? 'passed' : 'failed' };
  }
}
