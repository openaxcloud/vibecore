import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CurrentWorkspaceProvider, useCurrentWorkspace } from '~/lib/runtime/CurrentWorkspaceContext';

const tree = ts.createSourceFile(
  'BaseChat.tsx',
  readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function componentSource(name: string) {
  return tree.statements
    .find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name)!
    .getText(tree);
}

/*
 * Render the actual desktop/mobile dispatch and wrapper against the real
 * workspace context, without booting the rest of BaseChat or an external API.
 */
const compiled = ts.transpileModule(
  `${componentSource('ProjectSnapshotsServicePanel')}\n${componentSource('ProjectIdeServicePanel')}\nreturn ProjectIdeServicePanel;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
).outputText;

const ProjectIdeApiServicePanel = ({
  panel,
  projectId,
  requestedWorkspaceId,
}: {
  panel: string;
  projectId?: string;
  requestedWorkspaceId?: string;
}) => <output data-panel={panel} data-project={projectId} data-workspace={requestedWorkspaceId} />;
const RoutedPanel = new Function('React', 'useCurrentWorkspace', 'ProjectIdeApiServicePanel', compiled)(
  React,
  useCurrentWorkspace,
  ProjectIdeApiServicePanel,
) as React.ComponentType<{ panel: string; projectId: string }>;

function render(panel: string, currentWorkspaceId?: string) {
  return renderToStaticMarkup(
    <CurrentWorkspaceProvider currentWorkspaceId={currentWorkspaceId} primaryWorkspaceId="primary-workspace">
      <RoutedPanel panel={panel} projectId="current-project" />
    </CurrentWorkspaceProvider>,
  );
}

describe('actual Instantanés panel dispatch', () => {
  it('receives the selected current workspace, never the default or stale workspace', () => {
    expect(render('snapshots', 'workspace-one')).toContain(
      'data-panel="snapshots" data-project="current-project" data-workspace="workspace-one"',
    );
    expect(render('snapshots', 'workspace-two')).toContain('data-workspace="workspace-two"');
    expect(render('snapshots', 'workspace-two')).not.toContain('primary-workspace');
  });

  it('does not substitute a primary ID while the actual active workspace is absent', () => {
    expect(render('snapshots')).toContain('data-panel="snapshots" data-project="current-project"');
    expect(render('snapshots')).not.toContain('data-workspace');
    expect(render('snapshots')).not.toContain('primary-workspace');
  });

  it('does not change the context of the other generic service panels', () => {
    expect(render('overview', 'workspace-one')).toContain('data-panel="overview"');
    expect(render('overview', 'workspace-one')).not.toContain('data-workspace');
  });
});
