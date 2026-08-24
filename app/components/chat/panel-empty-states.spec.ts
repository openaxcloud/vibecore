import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { baseChatAstEn, baseChatAstFr } from '~/lib/i18n/catalogs/base-chat-ast';
import { chatEn, chatFr } from '~/lib/i18n/catalogs/chat';

/*
 * UNIF-07 (lot D) — gardes SOURCE sur les états vides restants et les
 * formulations, dans la continuité de panel-uniformization.spec.ts (lot 1).
 *
 * 1. Les listes vides des panneaux (Problems, Collaborators, Activity,
 *    Sessions, Billing, Object Storage, Skills, Packages, Ports, Extensions,
 *    Workflows, Env, Secrets, Deploy logs, palette « + ») passent par le
 *    canonique PanelEmptyState. La note 12 px `bolt-project-empty-panel` ne
 *    reste tolérée QUE pour les messages de statut/erreur/chargement et pour
 *    le hub Terminal (gelé sur la référence d'Avi) — son compte est scellé.
 * 2. Les formulations jargon (« returned by API », « The bucket is empty »,
 *    « seau », « {formatted} project errors ») sont réécrites en libellés
 *    humains, EN et FR.
 */

const baseChatSource = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

const baseChatCode = codeOnly(baseChatSource);

describe('UNIF-07 — états vides canoniques (lot D)', () => {
  it('les familles ad hoc Problems et palette « + » ont disparu (source + styles)', () => {
    const scss = readFileSync(join(__dirname, '..', '..', 'styles', 'index.scss'), 'utf8');

    expect(baseChatCode).not.toContain('bolt-project-problems-empty');
    expect(baseChatCode).not.toContain('bolt-project-tool-empty');
    expect(scss).not.toContain('bolt-project-problems-empty');
    expect(scss).not.toContain('bolt-project-tool-empty');
  });

  it('la note bolt-project-empty-panel est réservée aux statuts/chargements (compte scellé à 13)', () => {
    /*
     * Avant le lot D : 35 occurrences (chaque panneau vide avait sa note grise
     * alignée à gauche). Après : seules restent les notes de statut/erreur,
     * les états de chargement et le hub Terminal (gelé). Toute nouvelle liste
     * vide doit passer par PanelEmptyState, pas par cette classe.
     */
    const occurrences = baseChatCode.match(/bolt-project-empty-panel/g) ?? [];
    expect(occurrences).toHaveLength(13);
  });

  it('BaseChat rend au moins 25 PanelEmptyState (listes vides canoniques)', () => {
    const occurrences = baseChatCode.match(/<PanelEmptyState/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(25);
  });

  it('la recherche de compétences communautaires passe par une clé interpolée (plus de concat de guillemets)', () => {
    expect(baseChatCode).toContain('noCommunitySkillsMatchQuery_4c1d9a2e');
    expect(baseChatCode).not.toContain('noCommunitySkillsMatch_7bc0a3ba');
  });
});

describe('UNIF-07 — formulations humaines (lot D)', () => {
  const allChatValues = [...Object.values(chatEn), ...Object.values(chatFr)];
  const allAstValues = [...Object.values(baseChatAstEn), ...Object.values(baseChatAstFr)];

  it('bannit « returned by API » / « renvoyé(e) par l’API » de toute chaîne visible', () => {
    const offenders = allChatValues.filter((value) => /returned by (?:the )?API|renvoy\S* par l['’]API/iu.test(value));
    expect(offenders).toEqual([]);
  });

  it('bannit la traduction littérale « seau » (le produit dit « bucket »)', () => {
    // Lookbehind Unicode : ne pas compter « réseau » (le \b ASCII coupe après l'accent).
    const offenders = allChatValues.filter((value) => /(?<!\p{L})[Ss]eaux?\b/u.test(value));
    expect(offenders).toEqual([]);
  });

  it('réécrit les vides Sessions / Billing / Object Storage en libellés produit', () => {
    expect(chatEn['chat.copy.noActiveSessionsReturnedByApi_93156dfd']).toBe('No active sessions.');
    expect(chatFr['chat.copy.noActiveSessionsReturnedByApi_93156dfd']).toBe('Aucune session active.');
    expect(chatEn['chat.copy.noBillingLimitsReturnedByApi_68d00609']).toBe('No billing limits set.');
    expect(chatFr['chat.copy.noBillingLimitsReturnedByApi_68d00609']).toBe('Aucune limite de facturation définie.');
    expect(chatEn['chat.copy.theBucketIsEmpty_18809c5d']).toBe('No files in this bucket yet.');
    expect(chatFr['chat.copy.theBucketIsEmpty_18809c5d']).toBe('Aucun fichier dans ce bucket pour l’instant.');
  });

  it('le badge de diagnostics parle d’erreurs, pas de « project errors »', () => {
    const values = allAstValues.filter((value) => /project errors?|erreurs? du projet/u.test(value));
    expect(values).toEqual([]);
    expect(baseChatAstEn['baseChatAst.diagnostics.count_other']).toContain('errors');
    expect(baseChatAstFr['baseChatAst.diagnostics.count_other']).toContain('erreurs');
  });
});
