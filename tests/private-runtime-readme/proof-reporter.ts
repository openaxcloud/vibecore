import { writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

export default class ReadmeProof implements Reporter {
  private _passed = false;
  private readonly _stages = new Map([
    ['Open README in the project editor', 'pending'],
    ['Confirm initial README bytes', 'pending'],
    ['Confirm runtime ready before editing', 'pending'],
    ['Edit README and confirm editor bytes', 'pending'],
    ['Confirm project Save button ready', 'pending'],
    ['Click Save and observe exact non-stream README PUT', 'pending'],
    ['Confirm PUT status 204', 'pending'],
    ['Confirm manifest acknowledgement', 'pending'],
    ['Read the saved bytes from the runtime API', 'pending'],
    ['Read the saved bytes from the agent volume', 'pending'],
    ['Reopen README in a new tab with only the session cookie', 'pending'],
    ['Compare the exported ZIP entry bytes', 'pending'],
  ]);

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category === 'test.step' && this._stages.has(step.title)) {
      this._stages.set(step.title, step.error ? 'failed' : 'passed');
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this._passed = test.parent.project()?.name === 'chromium' && result.status === 'passed';
  }

  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const passed =
      result.status === 'passed' && this._passed && [...this._stages.values()].every((value) => value === 'passed');
    writeFileSync(
      'private-runtime-evidence/readme.json',
      JSON.stringify({ passed, stages: Object.fromEntries(this._stages) }),
    );

    return { status: passed ? 'passed' : 'failed' };
  }
}
