import {relay,emit} from './entry-observation.mjs';
import type {Reporter,TestResult,TestCase} from '@playwright/test/reporter';
export default class EntryReporter implements Reporter{
 private forward=relay();
 onStdOut(chunk:string|Buffer){this.forward(chunk);}
 onTestEnd(_test:TestCase,result:TestResult){if(result.status!=='passed')emit('terminal','browser-failed');}
}
