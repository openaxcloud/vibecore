/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

/*
 * The checklist is collapsed by default (agent-panel UX refonte): it renders a
 * one-line summary button that expands the detailed checklist on tap. The tests
 * below drive that real behaviour — assert the collapsed summary, then expand to
 * assert the detailed rows/progress. `getByRole('button')` is the single toggle.
 */
function renderExpanded(plan: PlanChecklist) {
  render(<PlanChecklistView plan={plan} />);
  fireEvent.click(screen.getByRole('button'));
}

describe('<PlanChecklistView />', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows a collapsed one-line summary by default', () => {
    render(<PlanChecklistView plan={FIXTURE} />);

    // Title is in the summary button; the detailed checklist is not rendered yet.
    expect(screen.getByText('Add a logger')).toBeTruthy();
    expect(screen.getByText(/1\/4/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryAllByRole('listitem').length).toBe(0);
  });

  it('renders the title and progress label when expanded', () => {
    renderExpanded(FIXTURE);
    expect(screen.getAllByText('Add a logger').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 \/ 4 complete · 1 failed/)).toBeTruthy();
  });

  it('renders one item per plan entry with the right status label', () => {
    renderExpanded(FIXTURE);
    expect(screen.getAllByRole('listitem').length).toBe(4);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('renders the result subtext when present', () => {
    renderExpanded(FIXTURE);
    expect(screen.getByText('No conflicts')).toBeTruthy();
    expect(screen.getByText('Doc build broken')).toBeTruthy();
  });

  it('sets the progress bar aria-valuenow correctly', () => {
    renderExpanded(FIXTURE);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('25');
  });

  it('handles an empty plan without crashing', () => {
    renderExpanded({ items: [] });
    expect(screen.getByText(/0 \/ 0 complete/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});
