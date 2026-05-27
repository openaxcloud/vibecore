/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectAgentRunStatus } from './ProjectAgentRunStatus';

describe('<ProjectAgentRunStatus />', () => {
  afterEach(() => {
    cleanup();
  });

  it('anchors the stop action in a labelled AI agent status bar', () => {
    render(<ProjectAgentRunStatus stopLabel="Stop Claude" onStop={vi.fn()} />);

    expect(screen.getByTestId('project-agent-run-status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Agent running');
    expect(screen.getByRole('button', { name: 'Stop Claude' })).toBeTruthy();
  });

  it('calls the stop handler from the status bar action', () => {
    const onStop = vi.fn();

    render(<ProjectAgentRunStatus stopLabel="Stop Claude" onStop={onStop} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop Claude' }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
