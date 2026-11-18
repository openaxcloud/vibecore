import {expect,it,vi} from 'vitest';
import Reporter from './entry-reporter';
it('actual Playwright reporter forwards only closed render and original readback schemas',()=>{
 const log=vi.spyOn(console,'log').mockImplementation(()=>{});try{
 const reporter=new Reporter();const good={kind:'entry-caught',level:'app',category:'type-error',owner:'topbar'};
 reporter.onStdOut('PRIVATE\n'+JSON.stringify({...good,stack:'PRIVATE'})+'\n'+JSON.stringify(good)+'\n');
 reporter.onStdOut(JSON.stringify({kind:'entry-observation',stage:'document',result:'verified'})+'\n');
 expect(log.mock.calls.map(([x])=>JSON.parse(x))).toEqual([good,{kind:'entry-observation',stage:'document',result:'verified'}]);
 }finally{log.mockRestore();}
});
