import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const chart = 'infra/helm/platform';
const render = (args = []) => execFileSync('helm', ['template', 'vibecore', chart, ...args], { encoding: 'utf8' });
const champ = (manifest, cle) => new RegExp(`^  ${cle}: "(true|false)"$`, 'm').exec(manifest)?.[1];

const defaut = render();
assert.equal(champ(defaut, 'ADMIN_MFA_REQUIRED'), 'true');
const production = render(['--values', `${chart}/values-prod.yaml`]);
assert.equal(champ(production, 'ADMIN_MFA_REQUIRED'), 'true');
assert.equal(champ(production, 'AI_GATEWAY_REQUIRE_AUTH'), 'true');
assert.ok(
  /# Source: vibecore-platform\/templates\/shared-database\.yaml/.test(production),
  'Le cluster partagé doit réellement être rendu.',
);
assert.ok(/www\.e-code\.ai/.test(production), 'Le domaine www doit réellement être rendu.');
const testSansMfa = render(['--set', 'platformEnv.adminMfaRequired=false']);
assert.equal(champ(testSansMfa, 'ADMIN_MFA_REQUIRED'), 'false');
const legacy = render(['--set-json', 'platformEnv.adminMfaRequired=null']);
assert.equal(champ(legacy, 'ADMIN_MFA_REQUIRED'), 'true');
console.log('Rendu Helm vérifié : MFA par défaut, protections de production et désactivation explicite de test.');
