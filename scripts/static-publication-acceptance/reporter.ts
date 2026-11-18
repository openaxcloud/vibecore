import {relayFrameworkTransport} from './framework-transport.mjs';
import {relayScriptErrors} from './script-error.mjs';
import {diagnostic,emitDiagnostic,relayDiagnostics} from './diagnostics.mjs';
import type { Reporter, FullResult, TestCase, TestResult } from '@playwright/test/reporter';
export default class StatusOnly implements Reporter {
  private relayFramework=relayFrameworkTransport();
  private relayScript=relayScriptErrors();
  private stage='browser-preflight';
  private relay=relayDiagnostics(value=>{const event=diagnostic(value);if(event){this.stage=event.stage;console.log(JSON.stringify(event));}});
  onTestBegin(){emitDiagnostic(this.stage,'begin');}
  onTestEnd(_test:TestCase,result:TestResult){if(result.status!=='passed')emitDiagnostic(this.stage,'failed',result.status==='timedOut'?'timeout':'assertion');}
  onStdOut(chunk: string | Buffer) {
    this.relay(chunk);this.relayScript(chunk);this.relayFramework(chunk);
    // Never relay arbitrary browser stdout, source, IDs or error text.
    try {
      const value = JSON.parse(chunk.toString().trim());
      if (value.stage === 'anonymous-static-versions' && value.status === 'verified' && value.versions === 2) {
        console.log(JSON.stringify({stage:'anonymous-static-versions',status:'verified',versions:2}));
      }
    } catch { /* Not an allowlisted terminal assertion. */ }
  }
  onEnd(result:FullResult) { console.log(JSON.stringify({stage:'static-publication-acceptance',status:result.status==='passed'?'verified':'not-verified'})); }
}
