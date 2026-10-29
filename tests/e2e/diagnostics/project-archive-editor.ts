import type { Page, TestInfo } from '@playwright/test';

type EditorMountSample = { phase: string; nodes: Array<{ id: number; kind: string }> };
type DiagnosticWindow = Window & {
  __archiveEditorObservation?: {
    stop: () => void;
    read: () => { events: EditorMountSample[]; dropped: number };
  };
};

async function boundedDiagnostic(action: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.resolve()
        .then(action)
        .catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Ephemeral node identities reveal replacement without changing DOM attributes. */
export async function startProjectArchiveEditorObservation(page: Page) {
  await boundedDiagnostic(() =>
    page.evaluate(() => {
      const target = window as DiagnosticWindow;
      target.__archiveEditorObservation?.stop();

      const ids = new WeakMap<Element, number>();
      const events: EditorMountSample[] = [];

      let nextId = 0;
      let dropped = 0;
      let previous = '';

      const sample = (phase: string) => {
        const nodes = [
          ...document.querySelectorAll('.cm-content, .monaco-editor, [data-testid="responsive-code-editor"]'),
        ].map((node) => {
          if (!ids.has(node)) {
            ids.set(node, ++nextId);
          }

          return {
            id: ids.get(node)!,
            kind: node.matches('.cm-content') ? 'codeMirror' : node.matches('.monaco-editor') ? 'monaco' : 'host',
          };
        });

        const current = JSON.stringify(nodes);

        if (current === previous && phase === 'mutation') {
          return;
        }

        previous = current;

        if (events.length < 32) {
          events.push({ phase, nodes });
        } else {
          dropped++;
        }
      };

      const observer = new MutationObserver(() => sample('mutation'));
      sample('before-archive-release');
      observer.observe(document.body, { childList: true, subtree: true });

      const timer = window.setTimeout(() => {
        sample('observation-limit');
        observer.disconnect();
      }, 10_000);

      target.__archiveEditorObservation = {
        stop: () => {
          sample('after-assertion');
          observer.disconnect();
          window.clearTimeout(timer);
        },
        read: () => ({ events, dropped }),
      };
    }),
  );
}

export async function stopProjectArchiveEditorObservation(page: Page) {
  await boundedDiagnostic(() =>
    page.evaluate(() => {
      const target = window as DiagnosticWindow;
      target.__archiveEditorObservation?.stop();
      delete target.__archiveEditorObservation;
    }),
  );
}

/** Bounded, read-only evidence at the assertion; never replaces its verdict. */
export async function attachProjectArchiveEditorSnapshot(
  page: Page,
  info: TestInfo,
  projectA: string,
  projectB: string,
  assertionPassed: boolean,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      (async () => {
        const snapshot = await page.evaluate(
          ({ projectA, projectB }) => {
            const observation = (window as DiagnosticWindow).__archiveEditorObservation;
            observation?.stop();

            const mounts = observation?.read() ?? null;
            delete (window as DiagnosticWindow).__archiveEditorObservation;

            const router = (
              window as typeof window & {
                __reactRouterDataRouter?: {
                  state: {
                    location?: { pathname?: string; search?: string };
                    navigation?: { state?: string };
                  };
                };
              }
            ).__reactRouterDataRouter?.state;
            const project = (pathname?: string) =>
              pathname === `/projects/${projectA}/ide` ? 'A' : pathname === `/projects/${projectB}/ide` ? 'B' : 'other';
            const visible = (node: Element) =>
              node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';

            const nodes = (selector: string) => [...document.querySelectorAll(selector)];
            const editors = nodes('.cm-content');
            const focus = document.activeElement;

            const focusedWithin = (selector: string) =>
              focus !== null && nodes(selector).some((node) => node.contains(focus));
            const counts = (selector: string) => {
              const matching = nodes(selector);
              return { mounted: matching.length, visible: matching.filter(visible).length };
            };

            /*
             * Only categories, counts and known fixture booleans; never URLs,
             * project IDs, editor text, input values, filenames or DOM markup.
             */
            return {
              mounts,
              browserProject: project(location.pathname),
              routerProject: project(router?.location?.pathname),
              browserRequestsEditor: new URLSearchParams(location.search).get('panel') === 'editor',
              routerRequestsEditor: new URLSearchParams(router?.location?.search).get('panel') === 'editor',
              routerIdle: router?.navigation?.state === 'idle',
              codeMirror: counts('.cm-content'),
              monaco: counts('.monaco-editor'),
              editorHost: counts('[data-testid="responsive-code-editor"]'),
              mobileFiles: counts('[data-testid="mobile-files-panel"]'),
              containsFixtureA: editors.some((node) => node.textContent?.includes('TEMPORARY-README')),
              containsFixtureB: editors.some((node) =>
                /PROJECT-B-DOCUMENT|# Selection project B/.test(node.textContent ?? ''),
              ),
              focus: {
                body: focus === document.body,
                codeMirror: focusedWithin('.cm-content'),
                monaco: focusedWithin('.monaco-editor'),
                editorHost: focusedWithin('[data-testid="responsive-code-editor"]'),
                mobileFiles: focusedWithin('[data-testid="mobile-files-panel"]'),
              },
            };
          },
          { projectA, projectB },
        );
        await info.attach('project-A-editor-after-archive-assertion', {
          contentType: 'application/json',
          body: JSON.stringify({ assertionPassed, snapshot }, null, 2),
        });
      })().catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
