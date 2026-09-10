import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-GIT-001, seconde moitié — la chaîne d'intentions du panneau Git n'avait
 * pas de dernier `else`. Une intention inconnue traversait tout sans déclencher
 * un seul appel git, puis tombait sur `return json({ ok: true })`.
 *
 * Mesuré le 15/08 sur DEUX projets sur deux : un `POST …/ide-panel/git` → 200,
 * et dans les journaux des trois pods API, uniquement des `GET`. Aucune route
 * d'écriture git atteinte, `HEAD` inchangé, 0 fichier indexé.
 *
 * Corriger l'appelant ne suffisait pas : le prochain formulaire qui oublierait
 * son intention se serait tu de la même façon. C'est le refus explicite qui
 * transforme ce défaut en erreur visible, définitivement.
 */
describe('panneau Git : une intention inconnue ne peut plus réussir en silence', () => {
  const source = readFileSync(join(process.cwd(), 'app/routes/api.projects.$projectId.ide-panel.$panel.ts'), 'utf8');

  const brancheGit = (() => {
    const debut = source.indexOf("} else if (panel === 'git') {");
    expect(debut, 'la branche git de l’action a disparu').toBeGreaterThan(-1);

    const suite = source.indexOf('\n  } else {', debut);

    return source.slice(debut, suite === -1 ? source.length : suite);
  })();

  it('la chaîne se termine par un refus, pas par un silence', () => {
    expect(brancheGit).toContain('UNSUPPORTED_PANEL_ACTION');
    expect(brancheGit).toContain('status: 400');
  });

  it('le refus nomme l’intention refusée, pour qu’on sache laquelle', () => {
    const refus = brancheGit.slice(brancheGit.indexOf('UNSUPPORTED_PANEL_ACTION'));
    expect(refus).toContain('intent');
  });

  it('les intentions git réelles restent toutes traitées', () => {
    for (const intention of [
      'commit',
      'commit-push',
      'push',
      'pull',
      'sync',
      'configure-remote',
      'remove-remote',
      'checkout-branch',
      'create-branch',
      'stash',
      'apply-stash',
      'pop-stash',
      'cherry-pick',
      'resolve-conflict',
      'discard',
      'restore',
      'mark-resolved',
      'pr',
    ]) {
      expect(brancheGit, `l’intention « ${intention} » n’est plus traitée`).toContain(`'${intention}'`);
    }
  });

  it('« commit » appelle bien la route d’écriture git', () => {
    const commit = brancheGit.slice(
      brancheGit.indexOf("if (intent === 'commit'"),
      brancheGit.indexOf("} else if (intent === 'push'"),
    );
    expect(commit).toContain('/git/commit');
    expect(commit).toContain("method: 'POST'");
  });
});
