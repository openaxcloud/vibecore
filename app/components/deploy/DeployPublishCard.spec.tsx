/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeployPublishCard, deploymentDrafts } from './DeployPublishCard';

const fetchers = vi.hoisted(() => ({
  call: 0,
  detect: { state: 'idle', data: { detected: { mode: 'server', framework: 'express', reason: '' } }, load: vi.fn() },
  rate: {
    state: 'idle',
    data: {
      rateCard: {
        version: 1,
        currency: 'USD',
        compute: { unitCents: 0.01, requestCents: 0 },
        planKey: 'test',
        defaultMachineSize: 'small',
        machineSizes: [
          { key: 'small', label: 'Small', vcpu: 1, ramGb: 1, computeUnitsPerSecond: 1, available: true },
          { key: 'large', label: 'Large', vcpu: 2, ramGb: 2, computeUnitsPerSecond: 2, available: true },
          {
            key: 'blocked',
            label: 'Blocked',
            vcpu: 4,
            ramGb: 4,
            computeUnitsPerSecond: 4,
            available: false,
            reason: 'plan',
          },
        ],
      },
    },
    load: vi.fn(),
  },
}));
vi.mock('react-router', () => ({ useFetcher: () => (fetchers.call++ % 2 === 0 ? fetchers.detect : fetchers.rate) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }));
beforeEach(() => {
  deploymentDrafts.clear();
  fetchers.call = 0;
  fetchers.detect.data.detected.mode = 'server';
  vi.clearAllMocks();
});
afterEach(cleanup);

const props = { projectId: 'isolated-project', workspaceId: 'isolated-workspace', busy: false, building: false };
describe('managed publication form in the canonical panel', () => {
  it('restores a memory-only draft after shell remount and isolates another workspace', () => {
    const onSubmit = vi.fn();
    const first = render(<DeployPublishCard {...props} onSubmit={onSubmit} />);
    fireEvent.change(first.container.querySelector('textarea[name="envVars"]')!, {
      target: { value: 'DEMO=isolated' },
    });
    fireEvent.change(first.container.querySelector('select[name="machineSize"]')!, { target: { value: 'large' } });
    fireEvent.click(first.container.querySelector('input[type="radio"][value="static"]')!);
    first.unmount();

    const restored = render(<DeployPublishCard {...props} onSubmit={onSubmit} />);
    expect((restored.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('DEMO=isolated');
    expect((restored.container.querySelector('input[type="radio"][value="static"]') as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(restored.container.querySelector('input[type="radio"][value="server"]')!);
    expect((restored.container.querySelector('select[name="machineSize"]') as HTMLSelectElement).value).toBe('large');
    restored.unmount();

    const other = render(<DeployPublishCard {...props} workspaceId="other" onSubmit={onSubmit} />);
    expect((other.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });
  it('allows retry after a callback returns without changing busy', async () => {
    const onSubmit = vi.fn();
    const { container } = render(<DeployPublishCard {...props} onSubmit={onSubmit} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
  it('keeps the form locked until the actual request settles', async () => {
    let resolve!: () => void;

    const onSubmit = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );

    const { container } = render(<DeployPublishCard {...props} onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
    });
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve();
    });
  });

  it('preserves detected server mode, selected machine and workspace in a single submission', () => {
    const onSubmit = vi.fn();
    const { container } = render(<DeployPublishCard {...props} onSubmit={onSubmit} />);
    const size = container.querySelector('select[name="machineSize"]')!;
    fireEvent.change(size, { target: { value: 'large' } });
    expect((container.querySelector('option[value="blocked"]') as HTMLOptionElement).disabled).toBe(true);

    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    const body = onSubmit.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(body)).toMatchObject({
      provider: 'server',
      machineSize: 'large',
      workspaceId: 'isolated-workspace',
      environment: 'preview',
    });
    expect(fetchers.detect.load).toHaveBeenCalledWith(
      '/projects/isolated-project/deployments?detect=1&workspace=isolated-workspace',
    );
    expect(fetchers.rate.load).toHaveBeenCalledWith('/projects/isolated-project/deployments?rateCard=1');
  });
  it('requires successful detection or a deliberate advanced override', () => {
    fetchers.detect.data.detected.mode = 'unknown';

    const onSubmit = vi.fn();
    const { container } = render(<DeployPublishCard {...props} onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('input[type="radio"][value="static"]')!);
    fireEvent.submit(container.querySelector('form')!);
    expect((onSubmit.mock.calls[0][0] as FormData).get('provider')).toBe('static');
    expect((onSubmit.mock.calls[0][0] as FormData).has('machineSize')).toBe(false);
  });
  it('blocks another publication while a build or request is pending', () => {
    const onSubmit = vi.fn();
    const { container } = render(<DeployPublishCard {...props} building onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /publishing/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
