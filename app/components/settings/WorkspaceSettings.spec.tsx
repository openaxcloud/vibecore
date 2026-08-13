/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceSettings } from './WorkspaceSettings';
import { REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY } from '~/lib/hooks/useAutoApplyEnabled';

describe('WorkspaceSettings — Require review of AI changes toggle', () => {
  beforeEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
    cleanup();
  });

  it('defaults to off (auto-apply) and turns review on when toggled', () => {
    render(<WorkspaceSettings />);

    const toggle = screen.getByLabelText('Require review of AI changes') as HTMLInputElement;

    // Default: off → auto-apply.
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe('true');
    expect((screen.getByLabelText('Require review of AI changes') as HTMLInputElement).checked).toBe(true);
  });

  it('reflects a persisted "on" value on load', () => {
    window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'true');

    render(<WorkspaceSettings />);

    expect((screen.getByLabelText('Require review of AI changes') as HTMLInputElement).checked).toBe(true);
  });
});
