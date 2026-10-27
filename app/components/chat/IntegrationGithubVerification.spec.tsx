/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationGithubVerification } from './IntegrationGithubVerification';
import { getIntegrationGithubCopy } from '~/lib/i18n/catalogs/integration-github';

// Only transport is controlled. These are component contracts, not a GitHub account verification.
const transport = vi.fn<typeof fetch>();

const proof = {
  ok: true,
  account: { login: 'fixture-user', htmlUrl: 'https://github.com/fixture-user' },
  verifiedAt: '2026-10-25T12:00:00.000Z',
};

function response(body: unknown = proof, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<Response>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  transport.mockReset();
  vi.stubGlobal('fetch', transport);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

for (const language of ['en', 'fr'] as const) {
  describe(language, () => {
    const copy = getIntegrationGithubCopy(language);

    it('starts unverified and never verifies automatically', () => {
      render(<IntegrationGithubVerification projectId="project-fixture" language={language} />);
      expect(screen.getByRole('status').textContent).toBe(copy.unverified);
      expect(screen.getByText(copy.scope)).toBeTruthy();
      expect(screen.queryByRole('link')).toBeNull();
      expect(transport).not.toHaveBeenCalled();
    });

    it('shows explicit loading, prevents duplicate clicks, and displays only a safe account proof', async () => {
      const pending = deferred();
      transport.mockReturnValue(pending.promise);
      render(<IntegrationGithubVerification projectId="project/a ?" language={language} />);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('status').textContent).toBe(copy.loading);
      expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
      fireEvent.click(screen.getByRole('button'));
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledWith('/api/projects/project%2Fa%20%3F/integration-github', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      });
      await act(async () => pending.resolve(response({ ...proof, token: 'must-never-render-fixture' })));

      const link = screen.getByRole('link', { name: proof.account.login });
      expect(link.getAttribute('href')).toBe(proof.account.htmlUrl);
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(screen.getByRole('status').textContent).toContain(copy.verified);
      expect(document.querySelector('time')?.getAttribute('datetime')).toBe(proof.verifiedAt);
      expect(document.body.textContent).not.toContain('must-never-render-fixture');
    });

    it('clears previous proof before retry and never exposes provider errors', async () => {
      transport.mockResolvedValueOnce(response());
      render(<IntegrationGithubVerification projectId="fixture" language={language} />);
      await act(async () => fireEvent.click(screen.getByRole('button')));
      expect(screen.getByRole('link')).toBeTruthy();

      const retry = deferred();
      transport.mockReturnValueOnce(retry.promise);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByRole('status').textContent).toBe(copy.loading);
      await act(async () => retry.resolve(response({ error: 'private-provider-fixture' }, 403)));
      expect(screen.getByRole('alert').textContent).toBe(copy.error);
      expect(document.body.textContent).not.toContain('private-provider-fixture');
      expect(screen.getByRole('button').textContent).toBe(copy.retry);
      transport.mockResolvedValueOnce(response());
      await act(async () => fireEvent.click(screen.getByRole('button')));
      expect(screen.getByRole('link')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
}

for (const htmlUrl of [
  'javascript:alert(1)',
  'https://github.com.evil.invalid/fixture-user',
  'https://user:pass@github.com/fixture-user',
  'https://github.com/fixture-user?token=private-fixture',
  'https://github.com/another-user',
  'http://github.com/fixture-user',
]) {
  it(`does not display an unsafe or mismatched profile URL: ${htmlUrl}`, async () => {
    transport.mockResolvedValue(response({ ...proof, account: { ...proof.account, htmlUrl } }));
    render(<IntegrationGithubVerification projectId="fixture" />);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(getIntegrationGithubCopy('en').error);
    expect(document.body.textContent).not.toContain('private-fixture');
  });
}

for (const body of [
  { ...proof, ok: false },
  { ...proof, verifiedAt: 'not-a-date' },
  { ...proof, verifiedAt: '2026-02-30T12:00:00.000Z' },
  { ...proof, error: 'private-provider-fixture' },
  { ...proof, account: { login: 'a--b', htmlUrl: 'https://github.com/a--b' } },
  { ...proof, account: { login: 'private_token', htmlUrl: 'https://github.com/private_token' } },
  {},
]) {
  it(`rejects malformed success payload ${JSON.stringify(body)}`, async () => {
    transport.mockResolvedValue(response(body));
    render(<IntegrationGithubVerification projectId="fixture" />);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
}

it('ignores late responses after project navigation and aborts the old request', async () => {
  const old = deferred();
  transport.mockReturnValueOnce(old.promise);

  const view = render(<IntegrationGithubVerification projectId="old" />);
  fireEvent.click(screen.getByRole('button'));

  const oldSignal = transport.mock.calls[0][1]!.signal!;
  view.rerender(<IntegrationGithubVerification projectId="new" />);
  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole('status').textContent).toBe(getIntegrationGithubCopy('en').unverified);
  transport.mockResolvedValueOnce(
    response({ ...proof, account: { login: 'new-user', htmlUrl: 'https://github.com/new-user' } }),
  );
  await act(async () => fireEvent.click(screen.getByRole('button')));
  await act(async () => old.resolve(response()));
  expect(screen.queryByRole('link', { name: 'fixture-user' })).toBeNull();
  expect(screen.getByRole('link', { name: 'new-user' })).toBeTruthy();
});

it('aborts on unmount and starts unverified on the next mount', async () => {
  const pending = deferred();
  transport.mockReturnValueOnce(pending.promise);

  const view = render(<IntegrationGithubVerification projectId="fixture" />);
  fireEvent.click(screen.getByRole('button'));

  const signal = transport.mock.calls[0][1]!.signal!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(response()));
  render(<IntegrationGithubVerification projectId="fixture" />);
  expect(screen.getByRole('status').textContent).toBe(getIntegrationGithubCopy('en').unverified);
  expect(screen.queryByRole('link')).toBeNull();
});

it('times out safely and ignores the old response after a manual retry', async () => {
  vi.useFakeTimers();

  const old = deferred();
  transport.mockReturnValueOnce(old.promise);
  render(<IntegrationGithubVerification projectId="fixture" />);
  fireEvent.click(screen.getByRole('button'));
  await act(async () => vi.advanceTimersByTime(20_000));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(transport.mock.calls[0][1]!.signal!.aborted).toBe(true);
  transport.mockResolvedValueOnce(
    response({ ...proof, account: { login: 'new-user', htmlUrl: 'https://github.com/new-user' } }),
  );
  await act(async () => fireEvent.click(screen.getByRole('button')));
  await act(async () => old.resolve(response()));
  expect(screen.getByRole('link', { name: 'new-user' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'fixture-user' })).toBeNull();
});

it('handles a rejected transport without exposing its exception and permits retry', async () => {
  transport.mockRejectedValueOnce(new Error('private-transport-fixture'));
  render(<IntegrationGithubVerification projectId="fixture" language="fr" />);
  await act(async () => fireEvent.click(screen.getByRole('button')));
  expect(screen.getByRole('alert').textContent).toBe(getIntegrationGithubCopy('fr').error);
  expect(document.body.textContent).not.toContain('private-transport-fixture');
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
});

it('discards a successful proof when the project changes or the component remounts', async () => {
  transport.mockImplementation(async () => response());

  const view = render(<IntegrationGithubVerification projectId="old" />);
  await act(async () => fireEvent.click(screen.getByRole('button')));
  expect(screen.getByRole('link')).toBeTruthy();
  view.rerender(<IntegrationGithubVerification projectId="new" />);
  expect(screen.queryByRole('link')).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole('button')));
  expect(screen.getByRole('link')).toBeTruthy();
  view.unmount();
  render(<IntegrationGithubVerification projectId="new" />);
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe(getIntegrationGithubCopy('en').unverified);
  expect(transport).toHaveBeenCalledTimes(2);
});

it('recovers from malformed JSON without rendering its body', async () => {
  transport.mockResolvedValueOnce(new Response('private-malformed-fixture', { status: 200 }));
  render(<IntegrationGithubVerification projectId="fixture" />);
  await act(async () => fireEvent.click(screen.getByRole('button')));
  expect(screen.getByRole('alert').textContent).toBe(getIntegrationGithubCopy('en').error);
  expect(document.body.textContent).not.toContain('private-malformed-fixture');
});
