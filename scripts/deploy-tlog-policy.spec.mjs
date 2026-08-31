/*
 * La politique de journal de transparence doit être la MÊME des deux côtés.
 *
 * `scripts/cosign-sign-images.sh` signe avec `--tlog-upload=false` : choix
 * délibéré et documenté — on ne publie pas les empreintes d'images privées dans
 * le Rekor public. La porte de déploiement, elle, vérifiait sans le drapeau
 * correspondant, donc exigeait une entrée de journal que rien ne crée jamais :
 *
 *     no matching signatures: signature not found in transparency log
 *
 * Résultat : une porte qui refuse TOUJOURS. Comme la sonde SEC-9 avant elle,
 * elle se lisait comme un arrêt de sécurité alors qu'elle ne mesurait rien —
 * et elle bloquait toute mise en production.
 *
 * Ce test lie les deux décisions l'une à l'autre. Peu importe laquelle change :
 * si elles divergent, il tombe.
 *
 * Run: pnpm vitest --run scripts/deploy-tlog-policy.spec.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIGN_SCRIPT = join(REPO_ROOT, 'scripts/cosign-sign-images.sh');
const WORKFLOW = join(REPO_ROOT, '.github/workflows/deploy-main.yml');

/** Retire les commentaires shell : ils EXPLIQUENT les drapeaux et se liraient sinon comme leur usage. */
function stripShellComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

const signSource = stripShellComments(readFileSync(SIGN_SCRIPT, 'utf8'));
const workflow = parseYaml(readFileSync(WORKFLOW, 'utf8'));
const verifyStep = workflow.jobs['build-and-deploy'].steps.find((step) =>
  step.name?.startsWith('Verify image signatures'),
);
const verifySource = stripShellComments(verifyStep?.run ?? '');

describe('politique de journal de transparence (cosign)', () => {
  it("l'étape de vérification existe et invoque bien cosign verify", () => {
    expect(verifyStep, 'étape de vérification des signatures').toBeDefined();
    expect(verifySource).toMatch(/cosign verify\b/);
  });

  it('signe sans publier au Rekor public', () => {
    expect(signSource).toMatch(/cosign sign\b/);
    expect(signSource).toMatch(/--tlog-upload=false/);
  });

  it('vérifie avec la MÊME politique que la signature', () => {
    const signsWithoutTlog = /--tlog-upload=false/.test(signSource);
    const verifyIgnoresTlog = /--insecure-ignore-tlog(=true)?/.test(verifySource);

    expect(
      verifyIgnoresTlog,
      "la signature n'alimente pas le Rekor : la vérification doit ignorer le journal, " +
        'sinon la porte refuse toujours',
    ).toBe(signsWithoutTlog);
  });

  it('vérifie toujours contre la clé KMS — la confiance vient de là, pas du journal', () => {
    expect(verifySource).toMatch(/--key\s+"\$\{KMS_KEY\}"/);
    expect(signSource).toMatch(/--key\s+"\$\{COSIGN_KMS_KEY\}"/);
  });
});
