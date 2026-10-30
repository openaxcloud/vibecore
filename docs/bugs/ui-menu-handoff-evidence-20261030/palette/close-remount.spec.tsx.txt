import {render,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useCommandPaletteReturnFocus} from '/workspace/vibecore-ui-terminal-handoff/app/components/chat/IdePaletteState';
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.body.innerHTML='';});
it.each([false,true])('same-project close then shell replacement before RAF=%s',replace=>{
 const pending=new Map<number,FrameRequestCallback>();let count=0;
 vi.stubGlobal('requestAnimationFrame',vi.fn(cb=>{pending.set(++count,cb);return count;}));
 vi.stubGlobal('cancelAnimationFrame',vi.fn(id=>pending.delete(id)));
 const original=document.createElement('button');original.dataset.testid='ide-dock-all-tools';document.body.append(original);
 const input=document.createElement('input');document.body.append(input);input.focus();
 const previous={current:original as HTMLElement|null},outside={current:false};
 function Shell({open}:{open:boolean}){useCommandPaletteReturnFocus(open,previous,outside);return null;}
 const view=render(<Shell key="loading-shell" open/>);
 view.rerender(<Shell key="loading-shell" open={false}/>);
 expect(pending.size).toBe(1);
 let target=original;
 if(replace){original.remove();target=document.createElement('button');target.dataset.testid='ide-dock-all-tools';document.body.append(target);vi.spyOn(target,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);view.rerender(<Shell key="loaded-shell" open={false}/>);}
 for(const callback of pending.values())callback(0);
 expect(document.activeElement).toBe(target);
});
