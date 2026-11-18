import {relayRenderEvents} from './entry-render-adapter.mjs';
import {relay,emit} from './entry-observation.mjs';
import type {Reporter,TestResult,TestCase} from '@playwright/test/reporter';
export default class EntryReporter implements Reporter{
 private forward=relay();
 private render=relayRenderEvents((value:unknown)=>console.log(JSON.stringify(value)));
 onStdOut(chunk:string|Buffer){this.forward(chunk);this.render(chunk);}
 onTestEnd(_test:TestCase,result:TestResult){if(result.status!=='passed')emit('terminal','browser-failed');}
}
