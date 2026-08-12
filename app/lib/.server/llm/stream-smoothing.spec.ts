import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { smoothStream } from 'ai';
import { describe, expect, it } from 'vitest';

/*
 * BUG-QA-STREAM-CHOPPY-001 — « l'agent quand il affiche les messages ça saute,
 * ça jump, impossible de lire ».
 *
 * QA measured the real agent stream: the provider delivered ~110 characters
 * every ~700 ms (14 chunks over 9.36 s, median inter-chunk gap 695 ms). Between
 * two blocks the client has nothing to paint, so the transcript advances in
 * visible jumps. nginx was cleared (same cadence from inside the pod), and the
 * 40 ms client-side smoothing cannot invent frames that never arrived — only the
 * SERVER can subdivide them.
 *
 * These tests replay that exact measured shape through the transform now wired
 * in `stream-text.ts`, and assert the emitted cadence.
 */

// The measured shape: 110-character blocks, 14 of them.
const MEASURED_CHUNK_CHARS = 110;
const MEASURED_CHUNK_COUNT = 14;

function buildBlockyText() {
  const word = 'streaming ';
  const block = word.repeat(Math.ceil(MEASURED_CHUNK_CHARS / word.length)).slice(0, MEASURED_CHUNK_CHARS);

  return Array.from({ length: MEASURED_CHUNK_COUNT }, () => block);
}

/** Feed the blocks through the transform and collect the text deltas it emits. */
async function runTransform(blocks: string[]) {
  const source = new ReadableStream({
    start(controller) {
      for (const text of blocks) {
        controller.enqueue({ type: 'text-delta', textDelta: text });
      }

      /*
       * The transform flushes its pending buffer when a NON-text-delta chunk
       * arrives. A real provider stream always terminates with such a part, so
       * the replay must too — otherwise the trailing partial word is withheld
       * and the comparison would be unfair to the transform.
       */
      controller.enqueue({ type: 'finish', finishReason: 'stop' });
      controller.close();
    },
  });

  /*
   * `delayInMs: null` removes the transform's own pacing timer so the test is
   * deterministic and fast; the SUBDIVISION (one delta per word) is what matters
   * here and is independent of the delay.
   */
  const transform = smoothStream({ chunking: 'word', delayInMs: null });

  const transformed = source.pipeThrough(
    transform({ tools: {} as never, stopStream: () => undefined }) as unknown as TransformStream,
  );

  const out: string[] = [];
  const reader = (transformed as ReadableStream<{ type: string; textDelta?: string }>).getReader();

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value?.type === 'text-delta' && typeof value.textDelta === 'string') {
      out.push(value.textDelta);
    }
  }

  return out;
}

describe('BUG-QA-STREAM-CHOPPY-001 — server-side word chunking', () => {
  it('subdivides the measured 110-char blocks into many more, smaller frames', async () => {
    const blocks = buildBlockyText();
    const emitted = await runTransform(blocks);

    // AVANT : 14 frames for the whole response.
    expect(blocks).toHaveLength(MEASURED_CHUNK_COUNT);

    // APRÈS : one frame per word — an order of magnitude more paint opportunities.
    expect(emitted.length).toBeGreaterThan(blocks.length * 5);

    const maxFrameChars = Math.max(...emitted.map((frame) => frame.length));
    expect(maxFrameChars).toBeLessThan(MEASURED_CHUNK_CHARS / 2);
  });

  it('preserves the text byte-for-byte (smoothing must never alter content)', async () => {
    const blocks = buildBlockyText();
    const emitted = await runTransform(blocks);

    expect(emitted.join('')).toBe(blocks.join(''));
  });

  it('keeps accents, CJK and emoji intact across frame boundaries', async () => {
    const text = 'Déploiement réussi 完了しました 🚀 avec accents et emoji';
    const emitted = await runTransform([text, ' ' + text]);

    expect(emitted.join('')).toBe(text + ' ' + text);
    expect(emitted.length).toBeGreaterThan(4);
  });
});

/*
 * The tests above prove what the transform DOES. This one proves it is actually
 * WIRED into the agent's generation stream — the defect was precisely that
 * `smoothStream` shipped in the SDK but was referenced nowhere.
 */
describe('BUG-QA-STREAM-CHOPPY-001 — the transform is wired into streamText', () => {
  const source = readFileSync(join(__dirname, 'stream-text.ts'), 'utf8');

  it('passes a word-chunking smoothStream as experimental_transform', () => {
    expect(source).toMatch(/experimental_transform:\s*smoothStream\(\{\s*chunking:\s*'word'\s*\}\)/);
    expect(source).toMatch(/import\s+\{[^}]*\bsmoothStream\b[^}]*\}\s+from\s+'ai'/);
  });

  it('places the default before ...filteredOptions so callers can still override it', () => {
    /*
     * Match the real statements, not their mention in comments (this very fix's
     * comment names `...filteredOptions`, which a plain indexOf would hit first).
     */
    const lines = source.split('\n');
    const transformAt = lines.findIndex((line) => /^\s*experimental_transform:/.test(line));
    const filteredAt = lines.findIndex((line) => /^\s*\.\.\.filteredOptions,\s*$/.test(line));

    expect(transformAt).toBeGreaterThan(-1);
    expect(filteredAt).toBeGreaterThan(-1);
    expect(transformAt).toBeLessThan(filteredAt);
  });
});
