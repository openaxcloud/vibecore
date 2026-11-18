/** Regression controls using exact product source imports. Previous denial reproduced in preserved separate investigation archive. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {browserRequestAllowed} from './browser-policy.mjs';
import {staticSurface} from './policy.mjs';
const fixture={web:'http://127.0.0.1:4317'};
function imports(path){const source=readFileSync(path,'utf8');const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return file.statements.filter(ts.isImportDeclaration).map(node=>node.moduleSpecifier.text);}
function sourceUrl(specifier){assert.ok(specifier.startsWith('~/'));const stem='app/'+specifier.slice(2);for(const extension of ['.tsx','.ts','.jsx','.js']){try{readFileSync(stem+extension);return '/'+stem+extension;}catch{}}throw Error('UNRESOLVED_SOURCE_IMPORT');}
test('exact product root static import required before hydration is permitted by corrected probe and gateway',()=>{const graph=imports('app/root.tsx');assert.ok(graph.includes('~/components/chat/AppliedFilesNoticeDock'));const url=sourceUrl('~/components/chat/AppliedFilesNoticeDock');assert.equal(url,'/app/components/chat/AppliedFilesNoticeDock.tsx');assert.equal(browserRequestAllowed(fixture.web+url,'GET',fixture),true);assert.equal(staticSurface(url),'web');});
test('exact IDE route static context imports are permitted by corrected probe',()=>{const graph=imports('app/routes/projects.$projectId.ide.tsx');for(const specifier of ['~/components/chat/AgentHeaderMenu','~/components/chat/ComposerToolsState','~/components/chat/IdePaletteState','~/components/chat/MobileOverlayFocus','~/components/chat/PendingComposerShell']){assert.ok(graph.includes(specifier));assert.equal(browserRequestAllowed(fixture.web+sourceUrl(specifier),'GET',fixture),true);}});
test('compiled-style source-free asset path is allowed, both source and compiled-style paths remain allowed without claiming hydration',()=>{assert.equal(browserRequestAllowed(fixture.web+'/assets/root-fixture.js','GET',fixture),true);assert.equal(browserRequestAllowed(fixture.web+'/app/root.tsx','GET',fixture),true);assert.equal(browserRequestAllowed(fixture.web+'/app/components/chat/AppliedFilesNoticeDock.tsx','GET',fixture),true);});
test('root supplies Scripts and entry waits for i18n only after root dependency graph loads; no script-src CSP',()=>{const root=readFileSync('app/root.tsx','utf8');const entry=readFileSync('app/entry.client.tsx','utf8');const server=readFileSync('app/entry.server.tsx','utf8');assert.match(root,/<Scripts\s*\/>/);assert.match(entry,/hydrateRoot\(document/);assert.match(server,/set\('Content-Security-Policy', "frame-ancestors 'self'"\)/);});

import {browserRequestAllowed as proposed,ownedBootstrap} from './browser-policy.mjs';
test('proposed API-scoped deny permits actual source imports but retains API/mutation/ownership restrictions',()=>{
 for(const specifier of imports('app/root.tsx').filter(s=>s.startsWith('~/components/chat/')))assert.ok(proposed(fixture.web+sourceUrl(specifier),'GET',fixture));
 for(const path of ['/api/chat','/api/projects/p/ai/conversations','/api/projects/p/deployments','/api/projects/p/ide-panel/deployments'])for(const method of ['GET','POST'])assert.equal(proposed(fixture.web+path,method,fixture),false);
 assert.equal(proposed(fixture.web+'/api/runtime/workspaces/w/files/write','PUT',fixture),false);assert.equal(proposed('https://outside.invalid/app/root.tsx','GET',fixture),false);
 assert.equal(proposed(fixture.web+'/api/runtime/workspaces','POST',fixture),true);assert.equal(ownedBootstrap({workspaceId:'wrong'},{workspaceId:'owned',projectId:'p'}),false);
});
