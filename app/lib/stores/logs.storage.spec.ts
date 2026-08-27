/** @vitest-environment jsdom */

/*
 * BUG-B (live 23/08) — `eventLogs` saturait le localStorage et jetait
 * `QuotaExceededError: setItem 'eventLogs' exceeded the quota` dans la console
 * d'Avi (clé relevée à ~0,4 Mo). Trois protections vérifiées ici :
 *
 *   1. la sérialisation est PLAFONNÉE en taille — les entrées les plus
 *      anciennes sont élaguées d'abord, les récentes survivent ;
 *   2. un `setItem` qui jette (quota plein) est avalé : AUCUN appelant qui se
 *      contente de journaliser ne doit casser — y compris `markAsRead`, dont le
 *      `setItem` était nu ;
 *   3. quand le quota est plein, la clé est purgée puis réécrite en version
 *      minimale (purge auto) au lieu de laisser le stockage saturé pour
 *      toujours.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { logStore, serializeLogsWithinBudget, MAX_LOGS_STORAGE_CHARS, type LogEntry } from './logs';

function quotaError() {
  const error = new Error("setItem 'eventLogs' exceeded the quota");
  error.name = 'QuotaExceededError';

  return error;
}

function fakeEntry(id: number, timestamp: string, payloadChars = 2048): [string, LogEntry] {
  return [
    `entry-${id}`,
    {
      id: `entry-${id}`,
      timestamp,
      level: 'info',
      message: `message ${id}`,
      details: { payload: 'x'.repeat(payloadChars) },
      category: 'api',
    },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('serializeLogsWithinBudget — le journal persisté est borné en TAILLE, pas seulement en nombre', () => {
  it('élague les entrées les plus anciennes jusqu’à repasser sous le plafond, et garde les récentes', () => {
    const logs: Record<string, LogEntry> = {};

    // ~200 Ko de payloads : bien au-delà du plafond de 128 Ko de caractères.
    for (let i = 0; i < 100; i += 1) {
      const [id, entry] = fakeEntry(i, new Date(Date.UTC(2026, 7, 23, 10, 0, i)).toISOString());
      logs[id] = entry;
    }

    const { serialized, dropped } = serializeLogsWithinBudget(logs);

    expect(serialized.length).toBeLessThanOrEqual(MAX_LOGS_STORAGE_CHARS);
    expect(dropped).toBeGreaterThan(0);

    const kept = JSON.parse(serialized) as Record<string, LogEntry>;

    // La plus récente survit toujours ; la plus ancienne part en premier.
    expect(kept['entry-99']).toBeDefined();
    expect(kept['entry-0']).toBeUndefined();
    expect(Object.keys(kept).length + dropped).toBe(100);
  });

  it('ne touche à rien sous le plafond', () => {
    const [id, entry] = fakeEntry(1, '2026-08-23T10:00:00.000Z', 10);
    const { serialized, dropped } = serializeLogsWithinBudget({ [id]: entry });

    expect(dropped).toBe(0);
    expect(JSON.parse(serialized)[id]).toBeDefined();
  });

  it('converge même quand une seule entrée dépasse à elle seule le plafond', () => {
    const [id, entry] = fakeEntry(1, '2026-08-23T10:00:00.000Z', 64 * 1024);
    const { serialized } = serializeLogsWithinBudget({ [id]: entry }, 1024);

    expect(serialized.length).toBeLessThanOrEqual(1024);
  });
});

describe('QuotaExceededError avalée — journaliser ne casse JAMAIS l’appelant', () => {
  it('logSystem n’explose pas quand le stockage refuse toutes les écritures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });

    expect(() => logStore.logSystem('write under full quota')).not.toThrow();
  });

  it('markAsRead n’explose pas non plus — son setItem était NU sur main', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });

    expect(() => logStore.markAsRead('some-log-id')).not.toThrow();
  });

  it('purge auto : quota plein → la clé est libérée puis réécrite en version minimale', () => {
    const original = Storage.prototype.setItem;

    let failures = 0;

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      // Le premier setItem sur eventLogs simule le quota plein observé live.
      if (key === 'eventLogs' && failures === 0) {
        failures += 1;
        throw quotaError();
      }

      return original.call(this, key, value);
    });

    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    expect(() => logStore.logSystem('message after saturation')).not.toThrow();

    // La clé saturée a été purgée…
    expect(removeSpy.mock.calls.some(([key]) => key === 'eventLogs')).toBe(true);

    // …et la réécriture minimale a abouti : le journal récent est persisté.
    const persisted = localStorage.getItem('eventLogs');
    expect(persisted).not.toBeNull();
    expect(persisted).toContain('message after saturation');
  });
});
