/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Shared diagnostics, never application code.
import {
  attachSecretsLifecycleEvidence,
  createSecretsLifecycleEvidence,
  installSecretsLifecycleProbe,
  SECRETS_LIFECYCLE_LIMIT,
} from '../../scripts/ci/secrets-lifecycle-evidence.mjs';
import { ProjectSecretsPanel } from '~/components/chat/ProjectSecretsPanel';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const target = window as unknown as {
  __recordSecretsLifecycle?: (value: unknown) => void;
  __secretsLifecycleProbe?: { stop(): void };
};
afterEach(() => {
  target.__secretsLifecycleProbe?.stop();
  delete target.__secretsLifecycleProbe;
  delete target.__recordSecretsLifecycle;
  cleanup();
  document.body.replaceChildren();
});

const record = {
  event: 'click',
  target: 'new-secret',
  panel: true,
  menu: false,
  form: false,
  panelReplaced: false,
  trusted: false,
};

it('projects only fixed labels and own boolean properties, without invoking getters', () => {
  const evidence = createSecretsLifecycleEvidence(() => 100);
  const getter = vi.fn(() => 'click');
  evidence.capture({ ...record, value: 'sensitive-value', key: 'PRIVATE_KEY', url: '/private' });
  evidence.capture({ ...record, event: 'secret-value' });
  evidence.capture({ ...record, target: 'PRIVATE_KEY' });
  evidence.capture({ ...record, form: 'true' });
  evidence.capture(Object.create(record));
  evidence.capture(Object.defineProperty({ ...record }, 'event', { get: getter }));
  expect(getter).not.toHaveBeenCalled();
  expect(evidence.snapshot().events).toEqual([{ ...record, elapsedMs: 0 }]);
  expect(JSON.stringify(evidence.snapshot())).not.toMatch(/sensitive|PRIVATE|url/);
});

it('bounds Node retention, copies snapshots and stops accepting after cleanup', () => {
  let now = 10;

  const evidence = createSecretsLifecycleEvidence(() => now);
  now = 35;

  for (let index = 0; index < SECRETS_LIFECYCLE_LIMIT + 5; index++) {
    evidence.capture(record);
  }
  expect(evidence.snapshot().events).toHaveLength(SECRETS_LIFECYCLE_LIMIT);
  expect(evidence.snapshot().omitted).toBe(5);

  const copy = evidence.snapshot();
  copy.events[0].event = 'lifecycle';
  expect(evidence.snapshot().events[0]).toMatchObject({ event: 'click', elapsedMs: 25 });
  evidence.stop();
  evidence.capture(record);
  expect(evidence.snapshot().omitted).toBe(5);
});

it('streams menu/form lifecycle and clicks without changing real Secrets behavior', async () => {
  const evidence = createSecretsLifecycleEvidence();
  target.__recordSecretsLifecycle = evidence.capture;
  installSecretsLifecycleProbe();

  const view = render(
    <ProjectSecretsPanel
      projectId="probe"
      language="en"
      busy={false}
      onSubmit={vi.fn()}
      data={{ secrets: [{ key: 'PRIVATE_KEY' }] }}
    />,
  );
  await Promise.resolve();
  fireEvent.click(view.getByTestId('secret-menu-PRIVATE_KEY'));
  await Promise.resolve();
  fireEvent.click(view.getByRole('menuitem', { name: 'Edit' }));
  await Promise.resolve();
  expect(view.getByTestId('secrets-form-key').getAttribute('value')).toBe('PRIVATE_KEY');
  expect(document.activeElement).toBe(view.getByTestId('secrets-form-value'));

  const events = evidence.snapshot().events;
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: 'click', target: 'menu-trigger' }),
      expect.objectContaining({ event: 'lifecycle', menu: true, form: false }),
      expect.objectContaining({ event: 'click', target: 'menuitem' }),
      expect.objectContaining({ event: 'lifecycle', menu: false, form: true }),
    ]),
  );
  expect(JSON.stringify(events)).not.toContain('PRIVATE_KEY');
});

it('records replacement, unrelated scrolling and resize; stops listeners and mutations', async () => {
  const evidence = createSecretsLifecycleEvidence();
  target.__recordSecretsLifecycle = evidence.capture;
  document.body.innerHTML =
    '<div data-testid="secrets-panel"><button data-testid="secrets-new">Private text</button></div><aside></aside>';
  installSecretsLifecycleProbe();
  document
    .querySelector('[data-testid="secrets-panel"]')!
    .replaceWith(document.querySelector('[data-testid="secrets-panel"]')!.cloneNode(true));
  await Promise.resolve();
  fireEvent.scroll(document.querySelector('aside')!);
  fireEvent.scroll(document.querySelector('[data-testid="secrets-panel"]')!);
  fireEvent.resize(window);

  const before = evidence.snapshot();
  expect(before.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: 'lifecycle', panelReplaced: true }),
      expect.objectContaining({ event: 'scroll', target: 'outside' }),
      expect.objectContaining({ event: 'scroll', target: 'inside' }),
      expect.objectContaining({ event: 'resize' }),
    ]),
  );
  target.__secretsLifecycleProbe!.stop();
  fireEvent.click(document.querySelector('button')!);
  document.body.replaceChildren();
  await Promise.resolve();
  expect(evidence.snapshot()).toEqual(before);
});

it('bounds browser transport and stops even during an event storm', async () => {
  const send = vi.fn();
  target.__recordSecretsLifecycle = send;
  document.body.innerHTML = '<div data-testid="secrets-panel"></div>';
  installSecretsLifecycleProbe();
  installSecretsLifecycleProbe(); // no duplicate observers

  for (let index = 0; index < 200; index++) {
    fireEvent.resize(window);
  }
  expect(send).toHaveBeenCalledTimes(SECRETS_LIFECYCLE_LIMIT + 1);
  expect(send.mock.lastCall?.[0].event).toBe('limit');
  document.body.replaceChildren();
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(SECRETS_LIFECYCLE_LIMIT + 1);
});

it('retains streamed Node evidence when the page is unavailable and rejects subframes', async () => {
  const mainFrame = {};

  let receive!: (source: { frame: object }, data: unknown) => void;

  const page = {
    mainFrame: () => mainFrame,
    exposeBinding: vi.fn(async (_name, callback) => {
      receive = callback;
    }),
    addInitScript: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => {
      throw new Error('page closed');
    }),
  };

  const trace = await attachSecretsLifecycleEvidence(page);
  receive({ frame: {} }, record);
  receive({ frame: mainFrame }, record);
  trace.stop();
  receive({ frame: mainFrame }, record);
  await Promise.resolve();
  expect(trace.snapshot().installed).toBe(true);
  expect(trace.snapshot().events).toHaveLength(1);
  expect(page.evaluate).toHaveBeenCalledTimes(1);
});

it('does not fail the scenario if diagnostic installation or delivery fails', async () => {
  const trace = await attachSecretsLifecycleEvidence({
    exposeBinding: async () => {
      throw new Error('unavailable');
    },
  });
  expect(trace.snapshot()).toEqual({ installed: false, events: [], omitted: 0 });
  document.body.innerHTML = '<div data-testid="secrets-panel"></div>';

  target.__recordSecretsLifecycle = () => {
    throw new Error('transport failure');
  };
  expect(installSecretsLifecycleProbe).not.toThrow();
  expect(() => fireEvent.resize(window)).not.toThrow();
});
