import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { estIdentifiantTechnique, initialesPersonne, libellePersonne } from './person-label';

/**
 * BUG-QA-IDENTIFIANTS-BRUTS-UI-001 — un identifiant technique n'est pas un nom.
 *
 * Sept endroits affichaient un cuid de 25 caractères à la place du nom d'une
 * personne. Signalé par Avi sur « Membres actifs », puis retrouvé dans tout le
 * bloc Collaborateurs.
 */
describe('BUG-QA-IDENTIFIANTS-BRUTS-UI-001 — libellé de personne', () => {
  const CUID = 'cmta9cm7h003t0n8zy8heiw1v';

  it('MÉCANISME 1 — un cuid n’est JAMAIS rendu comme un nom', () => {
    expect(libellePersonne({ userId: CUID, repli: 'Participant 3' })).toBe('Participant 3');
    expect(libellePersonne({ userId: CUID, repli: 'Participant 3' })).not.toContain('cm');
  });

  it('préfère une vraie identité quand la charge en porte une', () => {
    expect(libellePersonne({ displayName: 'Avi', userId: CUID, repli: 'Participant 1' })).toBe('Avi');
    expect(libellePersonne({ name: 'Avi B.', userId: CUID, repli: 'Participant 1' })).toBe('Avi B.');
    expect(libellePersonne({ email: 'avi@example.com', userId: CUID, repli: 'Participant 1' })).toBe('avi@example.com');
  });

  it('n’accepte pas un cuid déguisé en displayName', () => {
    /* Sinon il suffirait que le serveur recopie l'id dans le champ nom. */
    expect(libellePersonne({ displayName: CUID, userId: CUID, repli: 'Participant 2' })).toBe('Participant 2');
  });

  it('garde un identifiant LISIBLE, s’il en existe', () => {
    expect(libellePersonne({ userId: 'avi', repli: 'Participant 1' })).toBe('avi');
  });

  it('MÉCANISME 2 — les avatars DISTINGUENT les participants', () => {
    /*
     * Le défaut aggravant : `String(userId).slice(0, 2)` rendait « cm » pour
     * TOUT LE MONDE, tous les cuid commençant par `c`. Les participants
     * devenaient visuellement identiques.
     */
    const a = initialesPersonne(libellePersonne({ userId: CUID, repli: 'Participant 1' }));
    const b = initialesPersonne(libellePersonne({ userId: 'cmzzz9cm7h003t0n8zy8heiw1v', repli: 'Participant 2' }));

    expect(a).not.toBe(b);
    expect(a).toBe('P1');
    expect(initialesPersonne('Avi Bensimon')).toBe('AB');
  });

  it('reconnaît la forme d’un identifiant technique', () => {
    expect(estIdentifiantTechnique(CUID)).toBe(true);
    expect(estIdentifiantTechnique('Avi')).toBe(false);
    expect(estIdentifiantTechnique(undefined)).toBe(false);
  });

  it('MÉCANISME 3 — les surfaces PASSENT bien par le libellé', () => {
    /*
     * Une fonction juste dont personne ne se sert ne corrige rien. On lit le
     * code SANS ses commentaires : la prose de ces fichiers cite `userId`,
     * donc une sonde lisant le brut passerait même si l'appel avait disparu.
     */
    const sansCommentaires = (chemin: string) =>
      readFileSync(chemin, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    const baseChat = sansCommentaires(join(__dirname, '..', 'components', 'chat', 'BaseChat.tsx'));
    const overview = sansCommentaires(join(__dirname, '..', 'components', 'project-ide', 'ProjectOverviewPanel.tsx'));

    expect(baseChat.length, 'source lue').toBeGreaterThan(100000);

    expect(baseChat, 'BaseChat doit importer le libellé').toMatch(/import \{[^}]*libellePersonne[^}]*\} from/);
    expect(overview, 'ProjectOverviewPanel doit importer le libellé').toMatch(/import \{ libellePersonne \} from/);

    /* Les rendus bruts exacts qui constituaient le défaut ont disparu. */
    for (const brut of [
      '<strong>{user.userId}</strong>',
      '<span>{collaborator.userId}</span>',
      '<small>{comment.userId}</small>',
      "String(user.userId ?? 'U').slice(0, 2)",
    ]) {
      expect(baseChat, `rendu brut encore présent : ${brut}`).not.toContain(brut);
    }

    expect(overview, 'rendu brut encore présent dans Vue d’ensemble').not.toContain(
      "{member.userId || copy['projectOverview.member.unknown']}",
    );
  });
});
