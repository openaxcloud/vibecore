import type { Reporter, FullResult } from '@playwright/test/reporter';
export default class StatusOnly implements Reporter {
  onStdOut(chunk: string | Buffer) {
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
