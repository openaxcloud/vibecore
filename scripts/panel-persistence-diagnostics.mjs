/** Read-only evidence: never retain payloads, URLs, names, labels or errors. */
export function createPanelPersistenceDiagnostics() {
  const entries = [];
  const pending = [];
  const expected = new Map();
  const counts = new Map();

  return {
    expect(panel, marker) {
      const pattern = panel === 'snapshots' ? /^Panel audit UI checkpoint \d+$/ : /^IDE Panel Audit UI \d+$/;

      if (['snapshots', 'settings'].includes(panel) && pattern.test(marker)) {
        expected.set(panel, marker);
      }
    },
    capture(panel, response) {
      if (!['snapshots', 'settings'].includes(panel) || (counts.get(panel) ?? 0) >= 12) {
        return;
      }

      const method = response.request().method();

      if (!['GET', 'POST'].includes(method)) {
        return;
      }

      counts.set(panel, (counts.get(panel) ?? 0) + 1);

      const marker = expected.get(panel);

      const entry = {
        panel,
        sequence: entries.length,
        method,
        status: response.status(),
        expectedMarkerRegistered: Boolean(marker),
      };
      entries.push(entry);

      if (method === 'POST' && marker) {
        const body = response.request().postData();
        entry.requestContainsExpectedMarker = typeof body === 'string' && body.includes(marker);
      }

      if (method !== 'GET' || !marker) {
        return;
      }

      pending.push(
        (async () => {
          let timer;

          try {
            const body = await Promise.race([
              response.text(),
              new Promise((resolve) => {
                timer = setTimeout(() => resolve(null), 1000);
              }),
            ]);

            if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > 262144) {
              entry.bodyRead = 'unavailable-or-oversized';
              return;
            }

            entry.bodyRead = 'read';
            entry.responseContainsExpectedMarker = body.includes(marker);
          } catch {
            entry.bodyRead = 'unavailable-or-oversized';
          } finally {
            clearTimeout(timer);
          }
        })(),
      );
    },
    async flush() {
      await Promise.all(pending);
    },
    snapshot() {
      return entries.map((entry) => ({ ...entry }));
    },
  };
}
