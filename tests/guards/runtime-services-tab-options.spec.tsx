/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { createI18nInstance } from '~/lib/i18n/runtime';

const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const e2e = readFileSync('tests/e2e/dashboard.spec.ts', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function actualButton(testId: string) {
  let jsx = '';

  const visit = (node: ts.Node) => {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(tree) === 'button' &&
      node.openingElement.attributes.properties.some(
        (prop) => ts.isJsxAttribute(prop) && prop.getText(tree) === `data-testid="${testId}"`,
      )
    ) {
      jsx = node.getText(tree);
    }

    ts.forEachChild(node, visit);
  };
  visit(tree);
  expect(jsx).not.toBe('');

  return ts.transpileModule(`return (${jsx});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

afterEach(cleanup);

it('keeps the Services tab-options clicks wired to the current trigger and close-right action', () => {
  const closeToolMenu = vi.fn();
  const setActionsOpen = vi.fn();
  const onCloseToRight = vi.fn();
  const t = createI18nInstance('en').t;
  const optionsMenuLabel = t('baseChatAst.options.menuForTab', { label: 'Git' });

  const trigger = new Function(
    'React',
    'actionsButtonRef',
    'optionsMenuLabel',
    'actionsOpen',
    'closeToolMenu',
    'setActionsOpen',
    actualButton('tab-options'),
  )(React, null, optionsMenuLabel, false, closeToolMenu, setActionsOpen);
  const closeRight = new Function(
    'React',
    't',
    'runOptionsAction',
    'onCloseToRight',
    'activeTabId',
    'tabs',
    actualButton('tab-options-close-to-right'),
  )(React, t, (action: () => void) => action(), onCloseToRight, 'git-tab', []);
  render(
    <>
      {trigger}
      {closeRight}
    </>,
  );

  // Exercise the selectors read from the real E2E, against real component JSX.
  const triggerName = e2e.match(
    /page\.getByLabel\('([^']+)'\)\.first\(\)\.click\(\);\n    await page\.getByRole\('[^']+', \{ name: 'Close to right'/,
  )?.[1];

  const closeRole = e2e.match(/page\.getByRole\('([^']+)', \{ name: 'Close to right' \}\)\.first\(\)\.click/)?.[1];
  expect(triggerName).toBeTruthy();
  expect(closeRole).toBeTruthy();
  fireEvent.click(screen.getByLabelText(triggerName!));
  expect(closeToolMenu).toHaveBeenCalledOnce();
  expect(setActionsOpen).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole(closeRole!, { name: 'Close to right' }));
  expect(onCloseToRight).toHaveBeenCalledWith('git-tab');
});
