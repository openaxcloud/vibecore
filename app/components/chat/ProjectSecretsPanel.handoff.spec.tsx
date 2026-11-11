/** @vitest-environment jsdom */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { donneesDuFormulaire } from '~/lib/forms/donnees-du-formulaire';
import { panelActionFailureMessage } from '~/lib/panel-action-failure';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { ProjectSecretsPanel } from './ProjectSecretsPanel';
import { ProjectMetadataForm } from './ProjectMetadataForm';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('~/components/project-ide/PanelPrimitives', () => ({
  PanelEmptyState: () => null,
  PanelInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  PanelButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}));
vi.mock('~/lib/i18n/catalogs/secrets-panel', () => ({
  getSecretsPanelCopy: () => new Proxy({}, { get: (_, key) => key }),
  formatSecretsPanelCopy: (text: string) => text,
}));
vi.mock('~/lib/i18n/catalogs/base-chat-ast', () => ({ formatBaseChatAstDateTime: () => '' }));
vi.mock('~/lib/reveler-un-secret', () => ({ revelerUnSecret: async () => 'synthetic-revealed-existing' }));
vi.mock('~/components/workbench/recherche-demandee', () => ({ rechercheDemandee: { set: () => undefined } }));
vi.mock('~/utils/classNames', () => ({
  classNames: (...names: unknown[]) => names.filter((name) => typeof name === 'string').join(' '),
}));

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
});

type Props = {
  shell?: string;
  project?: string;
  workspace?: string;
  window?: string;
  pane?: string;
  show?: boolean;
  local?: boolean;
  strict?: boolean;
  metadataName?: string;
  existingSecret?: boolean;
  submit?: (event: React.FormEvent<HTMLFormElement>) => void | boolean | Promise<void | boolean>;
};
function tree(props: Props) {
  const {
    shell = 'warm-shell',
    project = 'p1',
    workspace = 'w1',
    window = 'main',
    pane = 'pane-main',
    show = true,
  } = props;
  const content = (
    <section key={shell}>
      {show && (
        <>
          <ProjectSecretsPanel
            projectId={project}
            paneId={pane}
            language="en"
            busy={false}
            data={{ secrets: props.existingSecret ? [{ key: 'SYNTHETIC_KEY' }] : [] }}
            onSubmit={
              props.submit ??
              ((event) => {
                event.preventDefault();
                return true;
              })
            }
          />
          <ProjectMetadataForm
            paneId={pane}
            settings={{ id: project, name: props.metadataName ?? 'Server name' }}
            onSubmit={(event) => event.preventDefault()}
            busy={false}
          />
        </>
      )}
    </section>
  );
  const view = props.local ? (
    content
  ) : (
    <IdePaletteProvider projectId={project} workspaceId={workspace} windowId={window}>
      {content}
    </IdePaletteProvider>
  );

  return props.strict ? <React.StrictMode>{view}</React.StrictMode> : view;
}

async function mount(initial: Props = {}) {
  const host = document.createElement('div');
  document.body.append(host);

  const root = createRoot(host);
  mounted.push({ root, host });

  let props = initial;
  const render = async (next: Props) => {
    props = { ...props, ...next };
    await act(async () => root.render(tree(props)));
  };
  await render(initial);

  const query = <T extends Element = HTMLElement>(selector: string) => host.querySelector<T>(selector);
  const get = <T extends Element = HTMLElement>(selector: string) => {
    const node = query<T>(selector);
    assert.ok(node, `Missing ${selector}`);

    return node;
  };
  const click = async (selector: string) => {
    await act(async () => get(selector).dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };
  const input = async (selector: string, value: string) => {
    const node = get<HTMLInputElement>(selector);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const submit = async () => {
    await act(async () =>
      get('[data-testid=secrets-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
  };

  return { host, render, query, get, click, input, submit };
}

const key = '[data-testid=secrets-form-key]';
const value = '[data-testid=secrets-form-value]';
const add = '[data-testid=secrets-new]';
const cancel = '.bolt-secrets-cancel';
async function draft(view: Awaited<ReturnType<typeof mount>>) {
  await view.click(add);
  await view.input(key, 'SYNTHETIC_KEY');
  await view.input(value, 'synthetic-unsaved-value');
}
function deferred() {
  let resolve!: (saved: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

it('preserves the actual just-opened form across immediate warm shell replacement', async () => {
  const view = await mount();
  await view.click(add);
  const previous = view.get('[data-testid=secrets-panel]');
  await view.render({ shell: 'real-chat' });
  assert.equal(previous.isConnected, false);
  assert.ok(view.query(key), 'New secret form must survive the replacement that caused the runtime failure');
});

it('preserves actual user fields across a cold loading gap and a second replacement', async () => {
  const view = await mount({ strict: true });
  await draft(view);
  await view.input('input[name=name]', 'Unsaved project name');
  await view.render({ shell: 'suspense-shell', show: false });
  await view.render({ shell: 'loaded-chat', show: true, metadataName: 'Refreshed server name' });
  assert.equal(view.get<HTMLInputElement>(key).value, 'SYNTHETIC_KEY');
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
  assert.equal(view.get<HTMLInputElement>('input[name=name]').value, 'Unsaved project name');
});

it('resets password visibility on replacement without losing the user-entered value', async () => {
  const view = await mount();
  await draft(view);
  await view.click('.bolt-secrets-form .bolt-secrets-eye');
  assert.equal(view.get<HTMLInputElement>(value).type, 'text');
  await view.render({ shell: 'next' });
  assert.equal(view.get<HTMLInputElement>(value).type, 'password');
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
});

for (const change of [{ project: 'p2' }, { workspace: 'w2' }, { window: 'second' }]) {
  it(`clears fields on ${Object.keys(change)[0]} changes and does not resurrect on return`, async () => {
    const view = await mount();
    await draft(view);
    await view.input('input[name=name]', 'Private metadata');
    await view.render(change);
    assert.equal(Boolean(view.query(key)), false);
    assert.equal(view.get<HTMLInputElement>('input[name=name]').value, 'Server name');
    await view.render({ project: 'p1', workspace: 'w1', window: 'main' });
    assert.equal(Boolean(view.query(key)), false);
  });
}

it('isolates panes without erasing the original pane draft', async () => {
  const view = await mount();
  await draft(view);
  await view.render({ pane: 'other' });
  assert.equal(Boolean(view.query(key)), false);
  await view.render({ pane: 'pane-main' });
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
});

it('retains standalone callers only for their local panel lifetime', async () => {
  const view = await mount({ local: true });
  await draft(view);
  await view.render({ shell: 'next' });
  assert.equal(Boolean(view.query(key)), false);
});

for (const action of ['cancel', 'toggle', 'save']) {
  it(`does not resurrect fields after ${action} then replacement`, async () => {
    const view = await mount();
    await draft(view);
    if (action === 'save') {
      await view.submit();
    } else {
      await view.click(action === 'cancel' ? cancel : add);
    }
    await view.render({ shell: 'next' });
    assert.equal(Boolean(view.query(key)), false);
    await view.click(add);
    assert.equal(view.get<HTMLInputElement>(key).value, '');
    assert.equal(view.get<HTMLInputElement>(value).value, '');
  });
}

it('retains fields on failed save through replacement, with no synthetic retry', async () => {
  let calls = 0;
  const view = await mount({
    submit: (event) => {
      event.preventDefault();
      calls++;
      return false;
    },
  });
  await draft(view);
  await view.submit();
  await view.render({ shell: 'next' });
  assert.equal(calls, 1);
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
});

it('keeps a pending submit across replacement and prevents a duplicate request', async () => {
  const pending = deferred();
  let calls = 0;
  const view = await mount({
    submit: (event) => {
      event.preventDefault();
      calls++;
      return pending.promise;
    },
  });
  await draft(view);
  await view.submit();
  await view.render({ shell: 'next' });
  assert.equal(view.get<HTMLButtonElement>('[data-testid=secrets-form-add]').disabled, true);
  await view.submit();
  assert.equal(calls, 1);
  await act(async () => pending.resolve(true));
  assert.equal(Boolean(view.query(key)), false);
  await view.render({ shell: 'third' });
  assert.equal(Boolean(view.query(key)), false);
});

it('does not clear newer edits after an older save resolves, even across replacement', async () => {
  const pending = deferred();
  const view = await mount({
    submit: (event) => {
      event.preventDefault();
      return pending.promise;
    },
  });
  await draft(view);
  await view.submit();
  await view.input(value, 'synthetic-newer-value');
  await view.render({ shell: 'next' });
  await act(async () => pending.resolve(true));
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-newer-value');
});

it('does not close a canceled/reopened form on stale success even with identical text', async () => {
  const pending = deferred();
  const view = await mount({
    submit: (event) => {
      event.preventDefault();
      return pending.promise;
    },
  });
  await draft(view);
  await view.submit();
  await view.click(cancel);
  await draft(view);
  await view.render({ shell: 'next' });
  await act(async () => pending.resolve(true));
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
});

it('keeps metadata server acknowledgement behavior across replacement', async () => {
  const view = await mount();
  await view.input('input[name=name]', 'Saved name');
  await view.render({ shell: 'next', metadataName: 'Saved name' });
  await view.render({ shell: 'third', metadataName: 'Later server name' });
  assert.equal(view.get<HTMLInputElement>('input[name=name]').value, 'Later server name');
});

/** Execute the complete production callbacks, not a reconstructed success mock. */
function actualSubmit(
  kind: 'service' | 'terminal',
  response: Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>,
) {
  const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
  const ast = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions: Record<string, string> = {};
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      if (
        name === 'submitToPanel' ||
        name === 'shouldResetIdePanelFormAfterSubmit' ||
        name === 'formatProjectPanelActionNotice' ||
        (name === 'submit' && node.parameters[0]?.name.getText(ast) === 'entree')
      ) {
        functions[name] = node.getText(ast);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of [
    'submit',
    'submitToPanel',
    'shouldResetIdePanelFormAfterSubmit',
    'formatProjectPanelActionNotice',
  ]) {
    assert.ok(functions[name], `Production callback ${name} must be present`);
  }
  let requests = 0;
  const request = async (_url: string, init: RequestInit) => {
    requests++;
    assert.equal(init.method, 'POST');
    assert.equal((init.body as FormData).get('intent'), 'upsert');
    assert.equal((init.body as FormData).get('key'), 'SYNTHETIC_KEY');
    return response;
  };
  const noop = () => undefined;
  const context = {
    projectId: 'p1',
    panel: 'secrets',
    fetchPanel: request,
    fetch: request,
    setBusy: noop,
    setError: noop,
    setActionNotice: noop,
    setMessage: noop,
    setCreatedShareLink: noop,
    loadPanel: async () => undefined,
    t: (key: string) => key,
    donneesDuFormulaire,
    panelActionFailureMessage,
    console: { warn: noop, error: noop },
  };
  const output = ts.transpileModule(
    Object.values(functions).join('\n') + `\nreturn ${kind === 'service' ? 'submit' : "submitToPanel('secrets')"};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const submit = new Function(...Object.keys(context), output)(...Object.values(context)) as NonNullable<
    Props['submit']
  >;
  return { submit, requests: () => requests };
}
for (const kind of ['service', 'terminal'] as const) {
  for (const outcome of ['success', 'http-failure', 'error-envelope', 'network-failure'] as const) {
    it(`actual ${kind} caller preserves or clears fields correctly on ${outcome} across replacement`, async () => {
      let finish!: () => void;
      const response = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve, reject) => {
        finish = () =>
          outcome === 'network-failure'
            ? reject(new Error('Synthetic connection failure'))
            : resolve({
                ok: outcome !== 'http-failure',
                status: outcome === 'http-failure' ? 503 : 200,
                json: async () => ({ ok: outcome !== 'error-envelope' }),
              });
      });
      const caller = actualSubmit(kind, response);
      const view = await mount({ submit: caller.submit });
      await draft(view);
      await view.submit();
      await view.render({ shell: 'loaded-chat' });
      assert.equal(caller.requests(), 1);
      await act(async () => finish());
      if (outcome === 'success') {
        assert.equal(Boolean(view.query(key)), false);
      } else {
        assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
      }
    });
  }
}

it('drops standalone drafts on project changes and cannot resurrect them on return', async () => {
  const pending = deferred();
  const view = await mount({
    local: true,
    submit: (event) => {
      event.preventDefault();
      return pending.promise;
    },
  });
  await draft(view);
  await view.submit();
  await view.render({ project: 'p2' });
  assert.equal(Boolean(view.query(key)), false);
  await view.render({ project: 'p1' });
  assert.equal(Boolean(view.query(key)), false);
  await draft(view);
  await act(async () => pending.resolve(true));
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
});

it('retains the draft after a rejected submission and shell replacement', async () => {
  const view = await mount({
    submit: (event) => {
      event.preventDefault();
      return Promise.reject(new Error('Synthetic failure'));
    },
  });
  await draft(view);
  await view.submit();
  await view.render({ shell: 'next' });
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-unsaved-value');
});

// Additional regression contracts from the independent review.
for (const kind of ['sync', 'async'] as const) {
  it(`legacy ${kind} void callback still closes the successful form`, async () => {
    const submit: NonNullable<Props['submit']> =
      kind === 'sync'
        ? (event) => {
            event.preventDefault();
          }
        : async (event) => {
            event.preventDefault();
          };
    const view = await mount({ submit });
    await draft(view);
    await view.submit();
    await view.render({ shell: 'other' });
    assert.equal(Boolean(view.query(key)), false);
  });
}

for (const kind of ['service', 'terminal'] as const) {
  for (const remount of [false, true]) {
    it(`actual ${kind} caller retains newer text on late success with remount=${remount}`, async () => {
      let finish!: () => void;
      const response = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
        finish = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
      });
      const caller = actualSubmit(kind, response);
      const view = await mount({ submit: caller.submit });
      await draft(view);
      await view.submit();
      await view.input(value, 'synthetic-newer');

      if (remount) {
        await view.render({ shell: 'other' });
      }

      await act(async () => finish());
      assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-newer');
      assert.equal(view.get<HTMLButtonElement>('[data-testid=secrets-form-add]').disabled, false);
    });
  }
}

it('does not move previously revealed secrets into shared state on replacement', async () => {
  const view = await mount({ existingSecret: true });
  await view.click('[data-testid=secret-row-SYNTHETIC_KEY] .bolt-secrets-eye');
  assert.ok(view.host.textContent?.includes('synthetic-revealed-existing'));
  await view.render({ shell: 'other' });
  assert.equal(view.host.textContent?.includes('synthetic-revealed-existing'), false);
});

it('preserves the edit-mode key and newly typed value, never the old revealed value', async () => {
  const view = await mount({ existingSecret: true });
  await view.click('[data-testid=secret-menu-SYNTHETIC_KEY]');
  await act(async () =>
    document.querySelector('[role=menuitem]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  assert.equal(view.get<HTMLInputElement>(key).value, 'SYNTHETIC_KEY');
  assert.equal(view.get<HTMLInputElement>(key).readOnly, true);
  assert.equal(view.get<HTMLInputElement>(value).value, '');
  await view.input(value, 'synthetic-replacement');
  await view.render({ shell: 'other' });
  assert.equal(view.get<HTMLInputElement>(key).value, 'SYNTHETIC_KEY');
  assert.equal(view.get<HTMLInputElement>(key).readOnly, true);
  assert.equal(view.get<HTMLInputElement>(value).value, 'synthetic-replacement');
  await view.click(cancel);
  await view.render({ shell: 'third' });
  assert.equal(Boolean(view.query(key)), false);
});
