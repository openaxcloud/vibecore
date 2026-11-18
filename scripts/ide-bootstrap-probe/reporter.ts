import {relaySafe} from './safe-output.mjs';
import {emitDiagnostic} from './diagnostics.mjs';
import type {Reporter,TestCase,TestResult} from '@playwright/test/reporter';
export default class StatusOnly implements Reporter {
 private relay=relaySafe();
 onStdOut(chunk:string|Buffer){this.relay(chunk);}
 onTestEnd(_test:TestCase,result:TestResult){if(result.status!=='passed')emitDiagnostic('browser-run','failed',result.status==='timedOut'?'timeout':'assertion');}
}
