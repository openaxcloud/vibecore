import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it as test } from 'vitest';
import { declencherCorrectifLivraison } from './declencher-correctif-livraison.mjs';

const entree = { depot: 'openaxcloud/vibecore', sha: 'c'.repeat(40), token: 'jeton-de-test' };

test('workflow_dispatch déclenche main et lie le déploiement au SHA du push', async () => {
  let appels = 0;
  await declencherCorrectifLivraison({
    ...entree,
    requete: async (url, options) => {
      if (!options.method) return { ok: true, json: async () => ({ workflow_runs: [] }) };
      appels++;
      assert.equal(
        url,
        'https://api.github.com/repos/openaxcloud/vibecore/actions/workflows/deploy-main.yml/dispatches',
      );
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer jeton-de-test');
      assert.deepEqual(JSON.parse(options.body), { ref: 'main', inputs: { target_sha: entree.sha } });
      return { ok: true, status: 204 };
    },
  });
  assert.equal(appels, 1);
});

test('les erreurs GitHub sont fatales et ne divulguent pas le corps', async () => {
  for (const status of [401, 403, 404, 500]) {
    await assert.rejects(
      declencherCorrectifLivraison({
        ...entree,
        requete: async (_url, options) =>
          options.method ? { ok: false, status } : { ok: true, json: async () => ({ workflow_runs: [] }) },
      }),
      new RegExp(`HTTP ${status}`),
    );
  }
});

test('un push mixte déjà en file ou servi ne produit pas de doublon', async () => {
  for (const etat of [
    { status: 'pending' },
    { status: 'queued' },
    { status: 'in_progress' },
    { status: 'completed', conclusion: 'success' },
  ]) {
    const resultat = await declencherCorrectifLivraison({
      ...entree,
      requete: async (_url, options) => {
        assert.equal(options.method, undefined, 'Un rollout existant ne doit pas être redemandé');
        return { ok: true, json: async () => ({ workflow_runs: [{ head_sha: entree.sha, event: 'push', ...etat }] }) };
      },
    });
    assert.equal(resultat, 'existant');
  }
});

test('un run annulé, échoué ou portant un autre SHA ne remplace pas le déploiement attendu', async () => {
  let demandes = 0;
  await declencherCorrectifLivraison({
    ...entree,
    requete: async (_url, options) => {
      if (options.method) {
        demandes++;
        return { ok: true };
      }
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            { head_sha: entree.sha, event: 'push', status: 'completed', conclusion: 'cancelled' },
            { head_sha: entree.sha, event: 'push', status: 'completed', conclusion: 'failure' },
            { head_sha: 'd'.repeat(40), event: 'push', status: 'in_progress' },
          ],
        }),
      };
    },
  });
  assert.equal(demandes, 1);
});

test('une lecture échouée ne se lit pas comme une file vide', async () => {
  await assert.rejects(
    declencherCorrectifLivraison({ ...entree, requete: async () => ({ ok: false, status: 403 }) }),
    /HTTP 403/,
  );
  await assert.rejects(
    declencherCorrectifLivraison({ ...entree, requete: async () => ({ ok: true, json: async () => ({}) }) }),
    /illisible/,
  );
});

test('absence de jeton ou identité invalide ne produit aucun appel', async () => {
  for (const mauvaise of [{ token: '' }, { sha: 'main' }, { depot: '../intrus' }]) {
    await assert.rejects(
      declencherCorrectifLivraison({
        ...entree,
        ...mauvaise,
        requete: () => {
          assert.fail('appel interdit');
        },
      }),
    );
  }
});

test('le workflow reste ciblé sur la chaîne, sans credential cloud ni concurrence du rollout', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-chain-change.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /paths:[\s\S]*?\.github\/workflows\/deploy-main\.yml/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /declencher-correctif-livraison\.mjs/);
  assert.doesNotMatch(workflow, /id-token: write|deploy-production-continuous|pull_request_target/);
});
