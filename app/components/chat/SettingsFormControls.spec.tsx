/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { useIdeSettingsFormDraft } from './IdeSettingsDraftState';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const forms = new Map<string, string>();

function visit(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'form') {
    const text = node.getText(tree);

    for (const intent of ['profile', 'preferences']) {
      if (text.includes(`name="intent" value="${intent}"`)) {
        forms.set(intent, text);
      }
    }
  }

  ts.forEachChild(node, visit);
}

const settings = tree.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectSettingsPanel',
);
visit(settings!);

const code = ts.transpileModule(
  `export function Forms({tab,paneId}) {
  const accountUser={name:'Server name',email:'user@local.test'};
  const preferences={theme:'system',keyboardMode:false,creditAlertThreshold:80};
  const formDraft=useIdeSettingsFormDraft('p1',paneId,{'profile.name':accountUser.name,'profile.email':accountUser.email,'preferences.theme':preferences.theme,'preferences.keyboardMode':'false','preferences.creditAlertThreshold':'80'});
  const initials='US',busy=false,t=key=>key,submitWithNotice=()=>event=>event.preventDefault();
  const PanelInput=props=><input {...props}/>; const PanelButton=props=><button {...props}/>; const LanguageSetting=()=>null;
  return tab==='account' ? (${forms.get('profile')}) : (${forms.get('preferences')});
}`,
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } },
).outputText;

const exports: { Forms?: React.ComponentType<{ tab: string; paneId: string }> } = {};
new Function('exports', 'React', 'useIdeSettingsFormDraft', code)(exports, React, useIdeSettingsFormDraft);

const Forms = exports.Forms!;

const fixture = (tab: string, shell = 'desktop') => (
  <IdePaletteProvider projectId="p1" windowId="main">
    <Forms key={shell} tab={tab} paneId="pane-main" />
  </IdePaletteProvider>
);
afterEach(cleanup);
it('actual Account and Preferences controls keep unsaved values after tab and shell replacement', () => {
  const view = render(fixture('account'));
  const input = (name: string) => view.container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  fireEvent.change(input('name'), { target: { value: 'My unsaved name' } });
  view.rerender(fixture('preferences'));
  fireEvent.change(input('creditAlertThreshold'), { target: { value: '77' } });
  view.rerender(fixture('account'));
  expect(input('name').value).toBe('My unsaved name');
  view.rerender(fixture('preferences', 'mobile'));
  expect(input('creditAlertThreshold').value).toBe('77');
  fireEvent.submit(input('creditAlertThreshold').closest('form')!);
  view.rerender(fixture('preferences', 'desktop'));
  expect(input('creditAlertThreshold').value).toBe('77');
});
