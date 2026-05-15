/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PlanChecklistView } from './PlanChecklist';
import type { PlanChecklist } from '~/lib/chat/plan-checklist';

const FIXTURE: PlanChecklist = {
  title: 'Add a logger',
  items: [
    { id: 'a', description: 'Read existing files', status: 'completed', result: 'No conflicts' },
    { id: 'b', description: 'Write the new module', status: 'in_progress' },
    { id: 'c', description: 'Run tests', status: 'pending' },
    { id: 'd', description: 'Update docs', status: 'failed', result: 'Doc build broken' },
  ],
};

describe('<PlanChecklistView />', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the title and progress label', () => {
    render(<PlanChecklistView plan={FIXTURE} />);
    expect(screen.getByText('Add a logger')).toBeTruthy();
    expect(screen.getByText(/1 \/ 4 complete · 1 failed/)).toBeTruthy();
  });

  it('renders one item per plan entry with the right status label', () => {
    render(<PlanChecklistView plan={FIXTURE} />);
    expect(screen.getAllByRole('listitem').length).toBe(4);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('renders the result subtext when present', () => {
    render(<PlanChecklistView plan={FIXTURE} />);
    expect(screen.getByText('No conflicts')).toBeTruthy();
    expect(screen.getByText('Doc build broken')).toBeTruthy();
  });

  it('sets the progress bar aria-valuenow correctly', () => {
    render(<PlanChecklistView plan={FIXTURE} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('25');
  });

  it('handles an empty plan without crashing', () => {
    render(<PlanChecklistView plan={{ items: [] }} />);
    expect(screen.getByText(/0 \/ 0 complete/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});
