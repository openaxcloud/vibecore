import { describe, expect, it } from 'vitest';

import { findFrenchAuditResidue, type AuditSemanticEntry } from '~/lib/i18n/catalogs/live-audit-heuristics';

function entry(text: string, overrides: Partial<AuditSemanticEntry> = {}): AuditSemanticEntry {
  return {
    kind: 'text',
    text,
    locator: '#subject',
    semanticKey: 'subject',
    ...overrides,
  };
}

describe('French live-audit heuristics', () => {
  it('accepts French prose containing approved brands and protocols', () => {
    const french = entry('Connectez GitHub avec OAuth pour utiliser votre dépôt.');

    expect(findFrenchAuditResidue([entry('Connect GitHub with OAuth to use your repository.')], [french])).toEqual([]);
  });

  it('rejects English UI copy at the same semantic location', () => {
    const english = entry('Save with GitHub');

    expect(findFrenchAuditResidue([english], [english])).toEqual([
      expect.objectContaining({ reason: 'english-match', text: 'Save with GitHub' }),
    ]);
  });

  it('rejects glossary anglicisms even inside otherwise French prose', () => {
    const french = entry('Connectez votre backend à cet espace.');

    expect(findFrenchAuditResidue([entry('Connect your backend to this workspace.')], [french])).toEqual([
      expect.objectContaining({ reason: 'forbidden-term' }),
    ]);
  });

  it.each([
    'Une Code review est requise avant la mise en production.',
    'Les code reviews restent visibles dans l’historique.',
    'Utilisez une mise en page responsive sur mobile.',
    'Un rollback est disponible pour cette version.',
    'Les rollbacks restent accessibles pendant trente jours.',
    'Ce workflow valide la mise en production.',
    'Les workflows sont réutilisables par l’équipe.',
    'QA',
    'La vérification QA commence demain.',
    'Activez le monitoring du service.',
    'La réponse arrive en streaming.',
  ])('rejects the visible French-surface anglicism in %j', (text) => {
    expect(findFrenchAuditResidue([], [entry(text)])).toEqual([
      expect.objectContaining({ reason: 'forbidden-term', text }),
    ]);
  });

  /*
   * `\b` se définit sur `[A-Za-z0-9_]` : une lettre accentuée n'est pas un
   * caractère de mot, donc `\bbranch\b` acceptait « branché » et signalait des
   * dérivés français parfaitement corrects comme des anglicismes.
   */
  it.each([
    'Branchez ce modèle à un service applicatif temps réel.',
    'Un service de support branché reste soumis aux conditions de son fournisseur.',
    'Les connecteurs branchés apparaissent dans la source.',
    'Le rôle est taggué dans le journal.',
  ])('accepts the accented French derivative of an English term in %j', (text) => {
    expect(findFrenchAuditResidue([], [entry(text)])).toEqual([]);
  });

  it.each([
    'Notre team prépare la livraison.',
    'Notre Team prépare aussi la livraison.',
    'Notre Team accompagne les utilisateurs Pro.',
    'Les teams collaborent chaque jour.',
    'Ce starter accélère le projet.',
    'Découvrez des starters prêts à l’emploi.',
  ])('still rejects a common English team or starter noun in %j', (text) => {
    expect(findFrenchAuditResidue([], [entry(text)])).toEqual([
      expect.objectContaining({ reason: 'forbidden-term', text }),
    ]);
  });

  it.each([
    'Starter',
    'Core',
    'Pro',
    'Enterprise',
    'Team',
    'Choisissez la formule Team.',
    'Votre offre Pro reste active.',
    'Comparez les offres Starter, Core, Pro et Enterprise.',
    'Offres : Starter/Core/Pro/Enterprise',
    'Les formules Core et Team incluent davantage de capacité.',
    'Starter — documentation et communauté en priorité.',
  ])('accepts the official commercial offer name in %j', (text) => {
    expect(findFrenchAuditResidue([], [entry(text)])).toEqual([]);
  });

  it('does not treat identical French alt text, cognates or proper nouns as English', () => {
    const values = [
      entry('Agent IA E-Code créant une application sécurisée.', { kind: 'alt', semanticKey: 'hero-alt' }),
      entry('Documentation', { semanticKey: 'documentation' }),
      entry('Contact', { semanticKey: 'contact' }),
      entry('Next.js', { semanticKey: 'framework' }),
      entry('Starter', { semanticKey: 'offer' }),
    ];

    expect(findFrenchAuditResidue(values, values)).toEqual([]);
  });

  it('still rejects identical English image alt text', () => {
    const englishAlt = entry('E-Code — build, ship and scale production applications with AI', {
      kind: 'alt',
      semanticKey: 'hero-alt',
    });

    expect(findFrenchAuditResidue([englishAlt], [englishAlt])).toEqual([
      expect.objectContaining({ kind: 'alt', reason: 'forbidden-term' }),
    ]);
  });

  it('rejects raw catalog keys but accepts domains, filenames and prose references', () => {
    expect(findFrenchAuditResidue([], [entry('settings.workspace.title')])).toEqual([
      expect.objectContaining({ reason: 'raw-key' }),
    ]);
    expect(findFrenchAuditResidue([], [entry('example.test')])).toEqual([]);
    expect(findFrenchAuditResidue([], [entry('app.e-code.ai')])).toEqual([]);
    expect(findFrenchAuditResidue([], [entry('ecode://workspace/customer-portal')])).toEqual([]);
    expect(findFrenchAuditResidue([], [entry('ari-builds')])).toEqual([]);
    expect(findFrenchAuditResidue([], [entry('Consultez api-keys.md pour continuer.')])).toEqual([]);
    expect(findFrenchAuditResidue([], [entry('Source citée : billing.md')])).toEqual([]);
  });

  it.each([
    'https://docs.example.test/workflows/responsive-layout',
    'ecode://workspace/monitoring-dashboard',
    'code-review',
    'responsive-grid',
    'rollback-policy',
    'release-workflow',
    'qa-check',
    'monitoring-agent',
    'streaming-response',
    'QA_MODE',
    '--workflow=release',
    '/rollback',
    'responsive.tsx',
    'rollback-policy.yaml',
    'src/workflows/rollback.ts',
  ])('accepts the non-translatable technical value %j', (text) => {
    expect(findFrenchAuditResidue([], [entry(text)])).toEqual([]);
  });

  it('ignores audited terms inside technical filename references in French prose', () => {
    expect(
      findFrenchAuditResidue([], [entry('Consultez responsive.tsx et rollback-policy.yaml avant de continuer.')]),
    ).toEqual([]);
  });

  it.each([
    'Les commandes /build, /run et /preview-error restent disponibles.',
    'Améliorer project/README.md à partir du fichier ouvert.',
    'Les métriques Cloud Monitoring restent disponibles.',
    'Utilisez la file d’attente habituelle pour contacter le support.',
    'Tarifs E-Code : Starter avec des crédits quotidiens, Core à 25 € et Enterprise sur devis.',
  ])('accepts the non-translatable technical or commercial context in %j', (text) => {
    expect(findFrenchAuditResidue([], [entry(text)])).toEqual([]);
  });

  it('does not confuse common French homographs with English product terms', () => {
    const french = [
      entry('Aucun service en arrière-plan non autorisé', { semanticKey: 'background-service' }),
      entry('Créez des branches et effectuez vos commits.', { semanticKey: 'git' }),
      entry('Cas d’usage — E-Code', { semanticKey: 'use-case' }),
      entry('Validation tenant compte de l’agent', { semanticKey: 'validation' }),
    ];

    expect(findFrenchAuditResidue([], french)).toEqual([]);
  });
});
