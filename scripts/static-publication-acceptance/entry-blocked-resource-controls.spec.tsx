/** @vitest-environment jsdom */
import React from 'react';
import {boundaryLevel,errorCategory,componentOwner} from './entry-render-adapter.mjs';
import {readFileSync} from 'node:fs';
import {render,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {I18nextProvider} from 'react-i18next';
import {createI18nInstance} from '../../app/lib/i18n/runtime';
import {AppErrorBoundary,ZoneErrorBoundary} from '../../app/components/ui/PanelBoundary';
vi.mock('~/lib/stores/logs',()=>({logStore:{logError:vi.fn()}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const source=(path:string)=>readFileSync(path,'utf8');
it('actual app boundary can reproduce every false readback selector while showing a caught root error',()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const Boom=()=>{throw new TypeError('CONTROL_ONLY');};
 const x=render(<I18nextProvider i18n={createI18nInstance('en')}><AppErrorBoundary title="app" autoRetry={false}><Boom/></AppErrorBoundary></I18nextProvider>);
 expect(x.container.querySelector('[role="alert"]')).not.toBeNull();
 const report=vi.mocked(console.error).mock.calls.find(args=>boundaryLevel(args[0])==='app');expect(report).toBeDefined();expect(errorCategory(report![1])).toBe('type-error');expect(componentOwner(report![2])).toBe('other-owner');
 for(const selector of ['main.h-dvh > section[role="alert"]','.bolt-project-pane-leaf','.bolt-project-files-tool','.bolt-project-file-tree','.bolt-file-tree-name'])expect(x.container.querySelector(selector)).toBeNull();
});
it('actual route-local caught boundary is detected by current main selector',()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});const Boom=()=>{throw Error('CONTROL_ONLY');};
 const x=render(<I18nextProvider i18n={createI18nInstance('en')}><main className="h-dvh"><ZoneErrorBoundary title="editor" zone="editor" autoRetry={false}><Boom/></ZoneErrorBoundary></main></I18nextProvider>);
 expect(x.container.querySelector('main.h-dvh > section[role="alert"]')).not.toBeNull();
});
it('exact ChatBox routing availability effect survives rejected GET without delaying or changing shell state',async()=>{
 const s=source('app/components/chat/ChatBox.tsx');const request=s.indexOf('fetch(`/api/agent-routing?');expect(request).toBeGreaterThan(0);
 const start=s.lastIndexOf('React.useEffect(() => {',request);const end=s.indexOf('}, [props.projectIdeMode, props.projectId]);',request);
 const effect=s.slice(start+'React.useEffect(() => {'.length,end).replaceAll(' as AgentModeAvailability','');
 const fetcher=vi.fn().mockRejectedValue(Error('BLOCKED_CONTROL'));const setter=vi.fn();
 const cleanupEffect=Function('props','fetch','setAgentModeAvailability',effect)({projectIdeMode:true,projectId:'owned'},fetcher,setter);
 expect(typeof cleanupEffect).toBe('function');expect(fetcher).toHaveBeenCalledWith('/api/agent-routing?projectId=owned',{headers:{accept:'application/json'}});
 await new Promise(resolve=>setTimeout(resolve,0));expect(setter).not.toHaveBeenCalled();cleanupEffect();
});
it('exact desktop route has outer shell and local Monaco imports; pending shell also renders BaseChat',()=>{
 const route=source('app/routes/projects.$projectId.ide.tsx');expect(route).toContain('className="bolt-project-ide-shell h-dvh w-screen overflow-hidden"');expect(route).toContain('<PendingComposerShell');
 const editor=source('packages/editor/src/index.ts');const load=editor.slice(editor.indexOf('export function preloadDesktopCodeEditor()'),editor.indexOf('function Desktop',editor.indexOf('export function preloadDesktopCodeEditor()')));expect(load).toContain("import('monaco-editor/esm/vs/editor/editor.api')");expect(load).not.toMatch(/https?:\/\//);
 const root=source('app/root.tsx');expect(root).toContain('https://fonts.googleapis.com/css2?');expect(root).not.toContain('document.fonts.ready');
 const base=source('app/components/chat/BaseChat.tsx');expect(base).toContain("useState(true);\n    const [rightPanelMode");expect(base).toContain('className="bolt-project-pane-leaf"');expect(base).toContain('className="bolt-project-files-tool"');
});
