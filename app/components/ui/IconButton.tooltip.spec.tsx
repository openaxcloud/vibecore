/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { IconButton } from './IconButton';
afterEach(cleanup);
it('hides only redundant tooltip channels while preserving the accessible control name', () => {
  const view = render(<IconButton icon="i-ph:dots-three" title="Composer tools" tooltip="Open tools" />);
  const button = screen.getByRole('button', { name: 'Composer tools' });
  expect(button.getAttribute('title')).toBe('Composer tools');
  expect(button.getAttribute('data-vc-tooltip')).toBe('Open tools');
  button.focus();
  view.rerender(<IconButton icon="i-ph:dots-three" title="Composer tools" tooltip="Open tools" hideTooltip />);
  expect(screen.getByRole('button', { name: 'Composer tools' })).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(button.hasAttribute('title')).toBe(false);
  expect(button.hasAttribute('data-vc-tooltip')).toBe(false);
  view.rerender(<IconButton icon="i-ph:dots-three" title="Composer tools" tooltip="Open tools" />);
  expect(button.getAttribute('title')).toBe('Composer tools');
  expect(button.getAttribute('data-vc-tooltip')).toBe('Open tools');
});
