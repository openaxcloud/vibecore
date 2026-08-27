import { describe, expect, it } from 'vitest';

import {
  defaultWorkflowsState,
  readWorkflowsState,
  withRunButtonInstallStep,
} from './api.projects.$projectId.ide-panel.$panel';

/**
 * The Run button is the only workflow every project is born with, and its single
 * step used to be a bare `npm run dev`. A freshly provisioned workspace carries
 * the project SOURCE but no `node_modules`, so that step died on every new
 * project with `sh: vite: not found` (exit 127) — the Workflows panel never
 * worked out of the box. Reproduced live on the audit environment (project
 * `React SaaS`, run "ÉCHEC … 22 s", output tail `sh: vite: not found`).
 */
const DEV = 'npm run dev';
const INSTALL = '[ -d node_modules ] || npm install --no-audit --no-fund';

function runButton(state: ReturnType<typeof defaultWorkflowsState>) {
  return state.workflows.find((workflow) => workflow.isRunButton)!;
}

function envVarsWith(state: unknown) {
  return { envVars: [{ key: 'VIBECORE_WORKFLOWS_STATE', value: JSON.stringify(state) }] };
}

describe('Run-button workflow installs dependencies before starting the dev server', () => {
  it('seeds new projects with the install step ahead of the dev server', () => {
    const commands = runButton(defaultWorkflowsState('en')).tasks.map((task) => task.command);

    expect(commands).toEqual([INSTALL, DEV]);
  });

  it('keeps the install step ordered first', () => {
    const tasks = runButton(defaultWorkflowsState('fr')).tasks;

    expect(tasks.map((task) => task.orderIndex)).toEqual([0, 1]);
    expect(tasks[0].command).toBe(INSTALL);
  });

  it('repairs projects created before the install step existed', () => {
    const legacy = {
      isSystem: true,
      isRunButton: true,
      tasks: [{ id: 1002, orderIndex: 0, taskType: 'shell', command: DEV, targetWorkflowId: null }],
    };

    expect(withRunButtonInstallStep(legacy).tasks.map((task: { command: string }) => task.command)).toEqual([
      INSTALL,
      DEV,
    ]);
  });

  it('repairs a legacy state read back from the project env blob', () => {
    const legacy = {
      workflows: [
        {
          id: 1001,
          name: 'Run development server',
          isSystem: true,
          isRunButton: true,
          isGenerated: true,
          executionMode: 'sequential',
          tasks: [{ id: 1002, orderIndex: 0, taskType: 'shell', command: DEV }],
        },
      ],
      runs: [],
    };

    const commands = readWorkflowsState(envVarsWith(legacy), 'fr').workflows[0].tasks.map(
      (task: { command: string }) => task.command,
    );

    expect(commands).toEqual([INSTALL, DEV]);
  });

  it('never rewrites a workflow the user has edited', () => {
    const edited = {
      isSystem: true,
      isRunButton: true,
      tasks: [
        { id: 1, orderIndex: 0, taskType: 'shell', command: 'pnpm install' },
        { id: 2, orderIndex: 1, taskType: 'shell', command: DEV },
      ],
    };

    expect(withRunButtonInstallStep(edited)).toBe(edited);

    const replaced = {
      isSystem: true,
      isRunButton: true,
      tasks: [{ id: 1, orderIndex: 0, taskType: 'shell', command: 'yarn dev' }],
    };

    expect(withRunButtonInstallStep(replaced)).toBe(replaced);
  });

  it('leaves ordinary user workflows alone', () => {
    const userWorkflow = {
      isSystem: false,
      isRunButton: false,
      tasks: [{ id: 1, orderIndex: 0, taskType: 'shell', command: DEV }],
    };

    expect(withRunButtonInstallStep(userWorkflow)).toBe(userWorkflow);
  });
});
