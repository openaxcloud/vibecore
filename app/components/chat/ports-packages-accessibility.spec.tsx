/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { fireEvent, render, cleanup } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { chatEn, chatFr } from '~/lib/i18n/catalogs/chat';

// Execute the actual private JSX and parsers, without mounting the IDE/runtime.
const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['ProjectPortsPanel', 'ProjectPackagesPanel', 'runtimePortsFromPayload', 'resolvedBaseChatLanguage'];
const nodes = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
expect(nodes).toHaveLength(names.length);

const compiled = ts.transpileModule(
  nodes.map((node) => node.getText(tree)).join('\n') + '\nreturn { ProjectPortsPanel, ProjectPackagesPanel };',
  {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
afterEach(cleanup);

function panels(language: 'fr' | 'en') {
  const copy: Record<string, string> = language === 'fr' ? chatFr : chatEn;

  const bindings = {
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useTranslation: () => ({ t: (key: string) => copy[key] ?? key, i18n: { language } }),
    platformStateLabel: () => 'unknown',
    PanelEmptyState: () => null,
    PanelButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
    PanelInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  };

  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as Record<
    string,
    React.ComponentType<{ data: unknown; busy: boolean; projectId?: string; onSubmit: React.FormEventHandler }>
  >;
}

describe.each(['fr', 'en'] as const)('Ports and Packages accessibility (%s)', (language) => {
  it.each([undefined, 'public', 'private'])('keeps visibility action canonical for %s', (visibility) => {
    const { ProjectPortsPanel } = panels(language);

    const { container } = render(
      <ProjectPortsPanel
        data={{
          ports: [{ port: 3000, ready: true }],
          portsState: { visibility: visibility ? { '3000': visibility } : {} },
        }}
        busy={false}
        projectId="synthetic"
        onSubmit={(event) => event.preventDefault()}
      />,
    );

    const input = container.querySelector<HTMLInputElement>('input[name="visibility"]')!;
    expect(input.value).toBe(visibility === 'private' ? 'public' : 'private');

    const copy = language === 'fr' ? chatFr : chatEn;
    expect(input.form?.querySelector('button')?.textContent).toBe(
      copy[visibility === 'private' ? 'chat.copy.makePublic_012e4893' : 'chat.copy.makePrivate_df1b5c0a'],
    );

    if (!visibility) {
      expect(container.textContent).toContain(copy['chat.copy.public_61c9b2b1']);
    }
  });

  it('exposes the selected manager and updates it without submitting', () => {
    const { ProjectPackagesPanel } = panels(language);

    let submissions = 0;

    const { container } = render(
      <ProjectPackagesPanel
        data={{ packageManager: 'npm' }}
        busy={false}
        onSubmit={(event) => {
          event.preventDefault();
          submissions++;
        }}
      />,
    );

    const group = container.querySelector('.bolt-project-package-manager-options')!;
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    fireEvent.click(buttons[1]);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
    expect(submissions).toBe(0);
  });
});
