import assert from 'node:assert/strict';
import { setTimeout as realTimeout, clearTimeout as realClearTimeout } from 'node:timers';
import { createDataStream } from 'ai';
import { describe, it, vi } from 'vitest';
import { creerSuiviDeChaine } from './chaine-de-generation';

const bounded = async <T>(promise: Promise<T>) => {
  let timer: ReturnType<typeof realTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = realTimeout(() => resolve('still-open'), 5_000);
      }),
    ]);
  } finally {
    if (timer) {
      realClearTimeout(timer);
    }
  }
};

const withClock = async (run: () => Promise<void>) => {
  vi.useFakeTimers();

  try {
    await run();
  } finally {
    vi.useRealTimers();
  }
};

describe('borne terminale de la chaîne (SDK réel)', () => {
  it('ferme la réponse fusionnée même quand read et cancel du fournisseur restent bloqués', async () =>
    withClock(async () => {
      const suivi = creerSuiviDeChaine(2_160_000);

      let cancelled = false;

      const source = new ReadableStream<`0:${string}\n`>({
        cancel() {
          cancelled = true;
          return new Promise(() => {});
        },
      });
      const stream = createDataStream({
        async execute(writer) {
          suivi.debut();
          writer.merge(suivi.bornerFlux(source));
          assert.equal(await suivi.attendre(), true);
          writer.write('0:"terminal"\n');
        },
      });

      const reader = stream.getReader();
      await vi.advanceTimersByTimeAsync(2_160_000);
      assert.equal((await reader.read()).value, '0:"terminal"\n');
      assert.deepEqual(await bounded(reader.read()), { done: true, value: undefined });
      assert.equal(suivi.signal.aborted, true);
      assert.equal(cancelled, true);
    }));

  it('Stop ferme la réponse et libère attendre sans attendre la borne', async () =>
    withClock(async () => {
      const stop = new AbortController();
      const suivi = creerSuiviDeChaine(10_000, stop.signal);
      suivi.debut();

      const reader = suivi.bornerFlux(new ReadableStream()).getReader();
      const attente = suivi.attendre();
      stop.abort();
      assert.equal(await bounded(attente), false);
      assert.deepEqual(await bounded(reader.read()), { done: true, value: undefined });
      assert.equal(suivi.delaiDepasse(), false);
    }));

  it('ne coupe pas une chaîne saine entre ses neuf segments ni après sa fin', async () =>
    withClock(async () => {
      const suivi = creerSuiviDeChaine(2_160_000);
      suivi.debut();

      const attente = suivi.attendre();

      for (let i = 0; i < 8; i++) {
        suivi.debut();
        suivi.fin();
        await vi.advanceTimersByTimeAsync(215_000);
        assert.equal(suivi.signal.aborted, false);
        assert.equal(suivi.enVol(), 1);
      }

      await vi.advanceTimersByTimeAsync(215_000);
      assert.equal(suivi.signal.aborted, false);
      suivi.fin();
      assert.equal(await attente, false);
      await vi.advanceTimersByTimeAsync(2_160_000);
      assert.equal(suivi.signal.aborted, false);
    }));

  it('livre intégralement deux segments fusionnés sains', async () =>
    withClock(async () => {
      const suivi = creerSuiviDeChaine(500);

      const stream = createDataStream({
        async execute(writer) {
          suivi.debut();

          for (const text of ['premier', 'second']) {
            writer.merge(
              suivi.bornerFlux(
                new ReadableStream({
                  start(c) {
                    c.enqueue(`0:"${text}"\n`);
                    c.close();
                  },
                }),
              ),
            );

            if (text === 'premier') {
              suivi.debut();
              suivi.fin();
              await Promise.resolve();
            }
          }

          suivi.fin();
          assert.equal(await suivi.attendre(), false);
        },
      });

      const chunks = [];
      const reader = stream.getReader();

      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        chunks.push(value);
      }

      assert.deepEqual(chunks, ['0:"premier"\n', '0:"second"\n']);
    }));

  it('un flux attaché après expiration est fermé immédiatement', async () =>
    withClock(async () => {
      const suivi = creerSuiviDeChaine(5);
      suivi.debut();

      const attente = suivi.attendre();
      await vi.advanceTimersByTimeAsync(5);
      await attente;
      assert.deepEqual(await bounded(suivi.bornerFlux(new ReadableStream()).getReader().read()), {
        done: true,
        value: undefined,
      });
    }));

  it('une erreur fournisseur reste une erreur et ne devient pas une expiration', async () =>
    withClock(async () => {
      const suivi = creerSuiviDeChaine(500);
      const error = new Error('provider');

      const reader = suivi
        .bornerFlux(
          new ReadableStream({
            start(c) {
              c.error(error);
            },
          }),
        )
        .getReader();
      await assert.rejects(reader.read(), error);
      assert.equal(suivi.delaiDepasse(), false);
    }));
});
