// Observe existing requests only. No state bodies, raw identifiers or version values are emitted.
function version(value) {
  if (typeof value !== 'string' || !/^"\d{1,16}"$/.test(value)) {
    return null;
  }

  const number = Number(value.slice(1, -1));

  return Number.isSafeInteger(number) ? number : null;
}

export function createIdeCasEvidence() {
  const records = [];
  const observations = [];

  let sequence = 0;

  let total = 0;

  return {
    trackPage(page, scenario = 'other', cohort = {}) {
      const writer = {};

      const requests = new WeakMap();

      let generation = 0;

      const frame = page.mainFrame();

      const navigate = (navigated) => {
        if (navigated === frame) {
          generation++;
        }
      };
      const requestStarted = (request) => {
        requests.set(request, { generation, sequence: ++sequence });
      };
      const responseReceived = (response) => {
        try {
          const request = response.request();
          const url = new URL(request.url());
          const match = url.pathname.match(/^\/api\/(projects|workspaces)\/[^/]+\/ide-state$/);

          if (!match || request.frame() !== frame || !requests.has(request)) {
            return;
          }

          const key = url.origin + url.pathname;
          const status = response.status();
          const method = request.method();
          const expected = version(request.headers()['if-match']);
          const received = version(response.headers().etag);
          const started = requests.get(request);
          const observed = ++sequence;
          requests.delete(request);

          if (status === 412 && method === 'PUT') {
            for (const tracked of observations) {
              if (
                tracked.key === key &&
                tracked.cohort === cohort &&
                tracked.writer === writer &&
                started.sequence > tracked.observed
              ) {
                tracked.record.laterFailure = true;
              }
            }

            total = Math.min(Number.MAX_SAFE_INTEGER, total + 1);

            const record = {
              scenario: ['packages', 'files', 'responsive'].includes(scenario) ? scenario : 'other',
              scope: match[1] === 'projects' ? 'project' : 'workspace',
              precondition: expected === null ? 'unknown' : 'numeric',
              conflictVersion: received === null ? 'unknown' : 'numeric',
              acknowledged: false,
              laterRead: 'unobserved',
              readAfterNavigation: false,
              readOnAnotherPage: false,
              laterFailure: false,
            };

            if (records.length === 64) {
              records.shift();
              observations.shift();
            }

            records.push(record);

            observations.push({
              key,
              cohort,
              writer,
              observed,
              record,
              conflict: received,
              acknowledged: null,
              generation: started.generation,
            });

            return;
          }

          for (const tracked of observations) {
            if (tracked.key !== key || tracked.cohort !== cohort || started.sequence <= tracked.observed) {
              continue;
            }

            if (Number.isInteger(status) && status >= 400 && status <= 599) {
              if (tracked.writer === writer) {
                tracked.record.laterFailure = true;
              }

              continue;
            }

            if (status !== 200) {
              continue;
            }

            if (
              method === 'PUT' &&
              tracked.writer === writer &&
              tracked.conflict !== null &&
              expected === tracked.conflict &&
              received > expected
            ) {
              tracked.acknowledged = received;
              tracked.acknowledgedAt = observed;
              tracked.record.acknowledged = true;
            }

            if (
              method === 'GET' &&
              (tracked.acknowledgedAt === undefined || started.sequence > tracked.acknowledgedAt)
            ) {
              tracked.record.readAfterNavigation = tracked.writer === writer && started.generation > tracked.generation;
              tracked.record.readOnAnotherPage = tracked.writer !== writer;
              tracked.record.laterRead =
                received === null || tracked.acknowledged === null
                  ? 'unconfirmed'
                  : received >= tracked.acknowledged
                    ? 'at-or-after-acknowledged'
                    : 'older-than-acknowledged';
            }
          }
        } catch {
          // Missing headers or detached requests cannot establish an acknowledgement.
        }
      };
      const stop = () => {
        page.off('request', requestStarted);
        page.off('response', responseReceived);
        page.off('framenavigated', navigate);
        page.off('close', stop);

        // Keep bounded cohort version evidence for later pages in the same authorized audit session.
      };
      page.on('request', requestStarted);
      page.on('response', responseReceived);
      page.on('framenavigated', navigate);
      page.on('close', stop);

      return stop;
    },
    snapshot() {
      return { total, omitted: total - records.length, records: records.map((record) => ({ ...record })) };
    },
  };
}
