import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messageDEchecDInstallation } from './api.projects.$projectId.ide-panel.$panel';

/*
 * BUG-IDE-005 — le panneau Paquets répondait `HTTP 200 {ok:true}` alors que le
 * run enregistré portait `exitCode 1 / status failed` et que RIEN n'était
 * installé (reproduit live le 06/08). L'échec n'existait que dans la liste
 * « Install & runtime checks » de la barre latérale, sous la ligne de
 * flottaison — pas là où l'utilisateur venait de cliquer.
 *
 * MÊME MÉCANISME QUE BUG-GIT-001 : une action qui rate répond comme si elle
 * avait réussi. C'est la règle qui est visée ici, pas la seule occurrence.
 */
describe('messageDEchecDInstallation', () => {
  it('porte le code de sortie ET la fin de la sortie, où se trouve la cause', () => {
    const message = messageDEchecDInstallation(
      {
        exitCode: 1,
        output: [
          'npm warn deprecated foo@1.0.0',
          'npm error code E404',
          'npm error 404 Not Found - GET https://registry.npmjs.org/paquet-inexistant',
        ].join('\n'),
      },
      'fr',
    );

    expect(message).toContain('1');
    expect(message, 'la cause réelle doit remonter').toContain('E404');
    expect(message).toContain('paquet-inexistant');
  });

  it('reste lisible quand la commande n’a rien écrit', () => {
    const message = messageDEchecDInstallation({ exitCode: 127, output: '' }, 'fr');

    expect(message).toContain('127');
    expect(message.length, 'un message vide ne dit rien').toBeGreaterThan(20);
  });

  it('est borné : un message d’interface, pas un journal', () => {
    const message = messageDEchecDInstallation(
      { exitCode: 1, output: Array.from({ length: 400 }, (_, i) => `ligne de bruit numero ${i}`).join('\n') },
      'fr',
    );

    expect(message.length).toBeLessThan(700);

    // Et c'est bien la FIN qui est gardée : c'est là qu'est le diagnostic.
    expect(message).toContain('399');
    expect(message).not.toContain('numero 0 ');
  });

  it('parle la langue de la requête', () => {
    expect(messageDEchecDInstallation({ exitCode: 1 }, 'fr')).toContain('Rien');
    expect(messageDEchecDInstallation({ exitCode: 1 }, 'en')).toContain('Nothing');
  });
});

describe('la route refuse de répondre « ok » sur un run échoué', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/routes/api.projects.$projectId.ide-panel.$panel.ts'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//gu, '');

  const branchePaquets = (() => {
    const debut = source.indexOf("} else if (panel === 'packages') {");
    expect(debut, 'la branche packages a disparu').toBeGreaterThan(-1);

    return source.slice(debut, source.indexOf("} else if (panel === 'extensions') {", debut));
  })();

  it('le code de sortie décide de la réponse', () => {
    expect(branchePaquets).toContain('run.exitCode !== 0');
    expect(branchePaquets).toContain('PACKAGE_RUN_FAILED');
    expect(branchePaquets).toContain('status: 422');
  });

  it("l'historique du run est écrit AVANT le refus — la trace doit survivre", () => {
    const ecriture = branchePaquets.indexOf('PACKAGES_STATE_ENV_KEY');
    const refus = branchePaquets.indexOf('PACKAGE_RUN_FAILED');

    expect(ecriture).toBeGreaterThan(-1);
    expect(refus, 'refuser avant d’enregistrer perdrait la sortie, seule preuve de la cause').toBeGreaterThan(ecriture);
  });
});
