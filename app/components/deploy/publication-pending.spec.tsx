/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicationReplit } from './PublicationReplit';

afterEach(cleanup);

const deployments = [{ id: 'isolated-deployment', status: 'READY' as const }];
describe('publication mutations', () => {
  it('submits once for repeated clicks, then permits retry after the host finishes', () => {
    const onRepublier = vi.fn();
    const props = { deployments, onRepublier, language: 'en', ilYA: () => '' };
    const { rerender } = render(<PublicationReplit {...props} />);
    const button = screen.getByRole('button', { name: 'Republish' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onRepublier).toHaveBeenCalledTimes(1);
    rerender(<PublicationReplit {...props} busy />);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    rerender(<PublicationReplit {...props} busy={false} />);
    fireEvent.click(button);
    expect(onRepublier).toHaveBeenCalledTimes(2);
  });
  it('does not submit when another deployment action is pending', () => {
    const onRepublier = vi.fn();
    render(
      <PublicationReplit deployments={deployments} onRepublier={onRepublier} busy language="en" ilYA={() => ''} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Republish' }));
    expect(onRepublier).not.toHaveBeenCalled();
  });
  it('keeps the first-publish wizard accessible after navigating back', () => {
    const onRepublier = vi.fn();
    render(<PublicationReplit deployments={[]} onRepublier={onRepublier} language="en" ilYA={() => ''} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onRepublier).toHaveBeenCalledTimes(2);
  });
});
