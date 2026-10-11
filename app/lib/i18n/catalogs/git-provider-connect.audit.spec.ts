import { describe, expect, it } from 'vitest';
import { gitProviderConnectEn, gitProviderConnectFr } from './git-provider-connect';
import { findFrenchAuditResidue, type AuditSemanticEntry } from './live-audit-heuristics';

/**
 * Le panneau « dépôt distant » passe l'audit de traduction française de la CI.
 *
 * Mesuré le 2026-10-01 sur la CI (audit live, page /projects/…/preview) :
 * « Connectez un compte Bitbucket pour vos workflows Git hébergés. » rejeté
 * comme anglicisme (forbidden-term). Ce test applique la MÊME règle que l'audit
 * à tout le catalogue, sans attendre qu'une page l'affiche.
 */
describe('catalogue git-provider-connect — audit français', () => {
  it('aucun libellé français ne contient d’anglicisme ni de texte anglais', () => {
    // L'audit live voit les textes REMPLIS : on remplit les gabarits comme l'interface.
    const exemples: Record<string, string> = { account: 'ada', provider: 'GitHub', branch: 'main' };
    const remplir = (text: string) => text.replace(/\{(\w+)\}/g, (_, nom: string) => exemples[nom] ?? 'x');

    const entree = (cle: string, text: string): AuditSemanticEntry => ({
      kind: 'text',
      text: remplir(text),
      locator: cle,
      semanticKey: cle,
    });

    const anglais = Object.entries(gitProviderConnectEn).map(([cle, text]) => entree(cle, text));
    const francais = Object.entries(gitProviderConnectFr).map(([cle, text]) => entree(cle, text));

    expect(findFrenchAuditResidue(anglais, francais).map((f) => `${f.reason}: ${f.text}`)).toEqual([]);
  });
});
