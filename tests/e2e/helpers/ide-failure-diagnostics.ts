import { test as base, type Page } from '@playwright/test';
import { collectIdeFailureState, withIdeRequestDiagnostics } from './ide-failure-metadata';

export { expect } from '@playwright/test';

type Diagnostics = { mark(label: string): void };

async function state(page: Page) {
  return page.evaluate(collectIdeFailureState);
}

/** Bounded metadata only: no URLs, headers, response bodies, DOM text or screenshots. */
export const test = base.extend<{ ideDiagnostics: Diagnostics }>({
  ideDiagnostics: [
    async ({ page }, use, testInfo) => {
      const enabled =
        testInfo.title === 'la liste des tables n’est pas vide, et chaque ligne est nommée' ||
        testInfo.title === 'le rail liste les tables, les en-têtes portent leur type, la page est annoncée' ||
        testInfo.title === 'existing mobile menu keeps the file reachable after locale and navigation at 390px';

      const started = Date.now();
      const samples: Array<Record<string, unknown>> = [];

      let pendingSample: Promise<void> | undefined;

      const mark = (label: string) => {
        if (!enabled || samples.length >= 16) {
          return;
        }

        const sample: Record<string, unknown> = { label, elapsedMs: Date.now() - started };
        samples.push(sample);

        /*
         * Never spend the scenario's action budget waiting for diagnostics.
         * At most one DOM observation can be outstanding.
         */
        if (pendingSample) {
          sample.stateSkipped = true;
          return;
        }

        pendingSample = state(page)
          .then((snapshot) => {
            sample.state = snapshot;
            sample.observedAtMs = Date.now() - started;
          })
          .catch(() => {
            sample.unavailable = true;
          })
          .finally(() => {
            pendingSample = undefined;
          });
      };
      const bounded = async (operation: Promise<unknown>) => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        try {
          await Promise.race([
            operation,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 1000);
            }),
          ]);
        } catch {
          // Diagnostics must never replace the original failure.
        } finally {
          clearTimeout(timer);
        }
      };

      if (!enabled) {
        await use({ mark });
        return;
      }

      // The observers stay attached through the final DOM sample and attachment.
      await withIdeRequestDiagnostics(page, started, async (network) => {
        try {
          await use({ mark });
        } finally {
          if (testInfo.status !== testInfo.expectedStatus) {
            mark('failure');

            if (pendingSample) {
              await bounded(pendingSample);
            }

            /*
             * Keep bounded, secret-free evidence readable when an artifact
             * cannot be downloaded. No URLs, bodies, headers or DOM text.
             */
            const metadata = JSON.stringify({ samples, ...network.snapshot() });
            console.error(`IDE_FAILURE_METADATA ${metadata}`);

            await bounded(
              testInfo.attach('ide-failure-metadata', {
                body: metadata,
                contentType: 'application/json',
              }),
            );
          }
        }
      });
    },
    { auto: false },
  ],
});
