import { describe, expect, it } from 'vitest';
import { workspaceEvents } from './workspace-events';

describe('workspaceEvents', () => {
  it('emits typed file applied events and returns an unsubscribe function', () => {
    const received: string[] = [];

    const unsubscribe = workspaceEvents.on('file:applied', (event) => {
      received.push(`${event.source}:${event.filePath}`);
    });

    workspaceEvents.emit('file:applied', {
      filePath: 'src/App.tsx',
      source: 'agent',
      artifactId: 'artifact-1',
      actionId: 'action-1',
    });

    unsubscribe();

    workspaceEvents.emit('file:applied', {
      filePath: 'src/index.css',
      source: 'agent',
    });

    expect(received).toEqual(['agent:src/App.tsx']);
  });
});
