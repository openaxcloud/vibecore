import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { it as test } from 'vitest';
import {
  protectionsRequises,
  verifierProtectionsProduction,
  verifierConfigMapProduction,
} from './verifier-protections-production.mjs';

const saine = () => ({
  platformEnv: { adminMfaRequired: true, aiGatewayRequireAuth: 'true' },
  database: { sharedCluster: { enabled: true } },
  global: { marketingWwwRedirect: true },
});

test('les protections actives passent, même avec des réglages de dimensionnement différents', () => {
  verifierProtectionsProduction({
    ...saine(),
    services: { screenshotter: { resources: { limits: { memory: '2Gi' } } } },
  });
});

for (const chemin of protectionsRequises) {
  test(`${chemin} ne peut ni disparaître ni être coupé`, () => {
    for (const valeur of [undefined, false, 'false', '', 'TRUE', 1]) {
      const release = saine();
      const cles = chemin.split('.');
      const objet = cles.slice(0, -1).reduce((obj, cle) => obj[cle], release);
      objet[cles.at(-1)] = valeur;
      assert.throws(() => verifierProtectionsProduction(release), {
        message: new RegExp(chemin.replaceAll('.', '\\.')),
      });
    }
  });
}

test('un fichier conforme ne peut pas sauver une release vide ou invalide', () => {
  verifierProtectionsProduction(saine());
  for (const release of [{}, null, [], 'true']) assert.throws(() => verifierProtectionsProduction(release));
});

test('les valeurs stockées ne suffisent pas si le ConfigMap désarme la MFA', () => {
  verifierProtectionsProduction(saine());
  const configmap = { data: { ADMIN_MFA_REQUIRED: 'true', AI_GATEWAY_REQUIRE_AUTH: 'true' } };
  verifierConfigMapProduction(configmap);
  for (const cle of Object.keys(configmap.data)) {
    assert.throws(() => verifierConfigMapProduction({ data: { ...configmap.data, [cle]: 'false' } }), new RegExp(cle));
  }
});

test('la commande refuse le JSON invalide sans imprimer son contenu', () => {
  const dir = mkdtempSync(join(tmpdir(), 'protections-'));
  try {
    const fichier = join(dir, 'release.json');
    writeFileSync(fichier, '{"secret": "SENTINELLE_NE_JAMAIS_AFFICHER"');
    const resultat = spawnSync(
      process.execPath,
      [new URL('./verifier-protections-production.mjs', import.meta.url).pathname, fichier],
      { encoding: 'utf8' },
    );
    assert.equal(resultat.status, 1);
    assert.doesNotMatch(resultat.stderr, /SENTINELLE_NE_JAMAIS_AFFICHER/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('le workflow contrôle la release vivante avant upgrade et le ConfigMap après', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-main.yml', import.meta.url), 'utf8');
  const controle = workflow.indexOf('node scripts/release-gate/verifier-protections-production.mjs');
  assert.ok(controle > workflow.indexOf('helm get values "${HELM_RELEASE}" --namespace'));
  assert.ok(controle < workflow.indexOf('helm upgrade "${HELM_RELEASE}" infra/helm/platform'));
  assert.match(workflow, /verifier-protections-production\.mjs[\s\S]*?\/tmp\/protections-configmap\.json/);
  assert.doesNotMatch(workflow, /-f\s+infra\/helm\/platform\/values-prod\.yaml/);
});
