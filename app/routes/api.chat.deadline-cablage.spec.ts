import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { decisionDeFacturationSurAbandon } from '~/lib/.server/llm/facturation-abandon';

const CHAT = readFileSync('app/routes/api.chat.ts', 'utf8');

describe('borne de génération : câblage et sorties terminales', () => {
  it('conserve le budget neuf segments et câble signal + fusion aux deux générations', () => {
    assert.ok(CHAT.includes('creerSuiviDeChaine((MAX_RESPONSE_SEGMENTS + 1) * BUDGET_PAR_SEGMENT_MS, request.signal)'));
    assert.equal(CHAT.split('abortSignal: suiviDeChaine.signal').length - 1, 2);
    assert.equal(CHAT.split('dataStream.merge(suiviDeChaine.bornerFlux(source))').length - 1, 2);
    assert.ok(CHAT.includes("solderUsageConnu('CHAIN_DEADLINE')"));
    assert.ok(CHAT.includes("solderUsageConnu('STREAM_ABORTED')"));
    assert.ok(CHAT.includes('solderUsageConnu(code)'));
    assert.equal(
      CHAT.split('!suiviDeChaine.delaiDepasse() && !clientDisconnected && routedTurnProvider').length - 1,
      2,
    );
  });

  it('une fin tardive persiste le segment mais ne lance jamais la continuation', async () => {
    const start = CHAT.indexOf('if (suiviDeChaine.signal.aborted) {');
    assert.ok(start > CHAT.indexOf("contenuDuTour += content ?? ''"));

    const end = CHAT.indexOf("if (finishReason !== 'length'", start);
    assert.ok(end > start);

    const fence = CHAT.slice(start, end);

    let saved = 0;
    let closed = 0;
    let continued = 0;

    const run = new Function(
      'suiviDeChaine',
      'solderUsageConnu',
      'persisterLaReponseDuServeur',
      'safeCloseMcp',
      'continueTurn',
      `return (async () => { ${fence} continueTurn(); })()`,
    );
    await run(
      { signal: { aborted: true }, delaiDepasse: () => true },
      async (reason: string) => {
        assert.equal(reason, 'CHAIN_DEADLINE');
      },
      async () => {
        saved++;
      },
      async () => {
        closed++;
      },
      () => {
        continued++;
      },
    );
    assert.deepEqual({ saved, closed, continued }, { saved: 1, closed: 1, continued: 0 });
    await run(
      { signal: { aborted: false } },
      () => {},
      async () => {
        saved++;
      },
      async () => {
        closed++;
      },
      () => {
        continued++;
      },
    );
    assert.equal(continued, 1);
  });

  it('deadline, erreur puis fin tardive : une facture connue, persistance conservée', async () => {
    const start = CHAT.indexOf('const solderUsageConnu = (code: string) => {');
    assert.ok(start > 0);

    const end = CHAT.indexOf('const dataStream = createDataStream({', start);
    const settlement = CHAT.slice(start, end).replace('(code: string)', '(code)');
    const fenceStart = CHAT.indexOf('if (suiviDeChaine.signal.aborted) {');
    const fence = CHAT.slice(fenceStart, CHAT.indexOf("if (finishReason !== 'length'", fenceStart));
    const writes: unknown[] = [];

    let saved = 0;

    const run = new Function(
      'decisionDeFacturationSurAbandon',
      'recordChatUsage',
      'persisterLaReponseDuServeur',
      `
      let tourDejaFacture = false;
      const projectId = 'project', chatMode = 'build', routedTurnProvider = 'provider', routedTurnModel = 'model';
      const request = { headers: { get: () => null } }, logger = { info() {} };
      const cumulativeUsage = { promptTokens: 12, completionTokens: 3, totalTokens: 15 };
      ${settlement}
      const suiviDeChaine = { signal: { aborted: true }, delaiDepasse: () => true };
      const safeCloseMcp = async () => {};
      return (async () => {
        solderUsageConnu('CHAIN_DEADLINE');
        solderUsageConnu('CHAIN_DEADLINE');
        ${fence}
      })();
    `,
    );
    await run(
      decisionDeFacturationSurAbandon,
      async (write: unknown) => {
        writes.push(write);
      },
      async () => {
        saved++;
      },
    );
    assert.equal(writes.length, 1);
    assert.equal(saved, 1);
    assert.deepEqual(writes[0], {
      projectId: 'project',
      provider: 'provider',
      model: 'model',
      inputTokens: 12,
      outputTokens: 3,
      finishReason: 'chain-deadline',
      cookieHeader: undefined,
      source: 'chat',
    });
  });
});

it('aucun nouveau PUT partiel au délai ou à Stop : persistance réservée aux fins de segment', () => {
  const attente = CHAT.indexOf('const delaiDepasse = await suiviDeChaine.attendre();');
  const erreur = CHAT.indexOf('onError: (error: any)', attente);
  assert.ok(attente > 0 && erreur > attente);
  assert.equal(CHAT.slice(attente, erreur).includes('persisterLaReponseDuServeur'), false);
  assert.equal(CHAT.includes('fileDePersistance'), false);
});
