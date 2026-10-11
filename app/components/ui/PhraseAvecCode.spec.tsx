import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhraseAvecCode } from './PhraseAvecCode';
import { baseChatAstEn, baseChatAstFr } from '~/lib/i18n/catalogs/base-chat-ast';

/*
 * Mesuré le 2026-09-30 sur Safari iOS (panneau Intégrations) : une phrase en
 * trois clés autour de deux `<code>` rendait « un`users`migration de table » en
 * français et « — a`users`table migration » en anglais — en JSX, le retour à la
 * ligne entre `{t(…)}` et `<code>` ne produit AUCUNE espace.
 */

const PHRASES = [
  ['baseChatAst.integrations.authDescription', { users: 'users', secret: 'AUTH_JWT_SECRET' }],
  ['baseChatAst.workflows.notScheduled', { exemple: '0 3 * * *' }],
  ['baseChatAst.monitoring.hiddenRoutine_other', { code: 'project.ide_state.*' }],
] as const;

describe('PhraseAvecCode — le code est posé DANS la phrase de chaque langue', () => {
  for (const [langue, catalogue] of [
    ['en', baseChatAstEn],
    ['fr', baseChatAstFr],
  ] as const) {
    for (const [cle, codes] of PHRASES) {
      it(`${langue} — ${cle} : une espace ou une ponctuation de chaque côté de chaque code`, () => {
        const texte = (catalogue as Record<string, string>)[cle].replace('{count}', '3');
        const html = renderToStaticMarkup(<PhraseAvecCode texte={texte} codes={codes} />);

        expect(html).not.toMatch(/\{\w+\}/);

        for (const code of Object.values(codes)) {
          expect(html, `« ${code} » absent`).toContain(`<code>${code}</code>`);
        }

        // Jamais collé à une lettre : « un<code>users</code>migration » était le défaut.
        expect(html).not.toMatch(/[\p{L}\p{N}]<code>/u);
        expect(html).not.toMatch(/<\/code>[\p{L}\p{N}]/u);
      });
    }
  }

  it('le français suit sa grammaire (« une migration de la table users »)', () => {
    const html = renderToStaticMarkup(
      <PhraseAvecCode texte={baseChatAstFr['baseChatAst.integrations.authDescription']} codes={PHRASES[0][1]} />,
    );

    expect(html).toContain('une migration de la table <code>users</code>');
  });

  it('un marqueur sans code fourni reste visible — on ne l’avale pas en silence', () => {
    expect(renderToStaticMarkup(<PhraseAvecCode texte="a {inconnu} b" codes={{}} />)).toBe('a {inconnu} b');
  });
});

describe('règle : plus aucune phrase découpée autour d’un <code> dans BaseChat', () => {
  // Un `{t(…)}` collé à un `<code>` (ou l'inverse), séparés seulement par des blancs.
  const MOTIF = /\{t\([^)]*\)\}\s*<code>|<\/code>\s*\{t\(/;

  it('contrôle positif : le motif reconnaît le découpage d’origine', () => {
    expect(MOTIF.test("{t('a')}\n            <code>users</code>\n            {t('b')}")).toBe(true);
  });

  it('BaseChat n’en contient plus', () => {
    const source = readFileSync(new URL('../chat/BaseChat.tsx', import.meta.url).pathname, 'utf8');

    expect(source.match(new RegExp(MOTIF, 'g')) ?? []).toEqual([]);
  });
});

/*
 * Même famille, vue le 01/10 sur Safari iOS (panneau Journaux) : « Aucun Console
 * pour le moment ». Un déterminant suivi d'un marqueur ne peut pas s'accorder
 * en français — le mot inséré a son propre genre, son nombre et sa majuscule
 * (« Aucun Console », « Aucun Journaux des flux de travail », « Aucun base de
 * données »). La règle vise TOUS les catalogues français.
 */
describe('règle : aucun « Aucun / Aucune » directement suivi d’un marqueur dans les catalogues français', () => {
  const MOTIF = /\b(Aucun|Aucune)\s+\{\w+\}/u;

  it('contrôle positif : le motif reconnaît le modèle d’origine', () => {
    expect(MOTIF.test('Aucun {stream} pour le moment.')).toBe(true);
  });

  it('aucun modèle français ne l’emploie', async () => {
    const { readdirSync } = await import('node:fs');
    const dossier = new URL('../../lib/i18n/catalogs/', import.meta.url).pathname;
    const fautifs: string[] = [];

    for (const fichier of readdirSync(dossier).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      const source = readFileSync(dossier + fichier, 'utf8');
      const debutFr = source.search(/export const \w+Fr\b/u);

      if (debutFr < 0) {
        continue;
      }

      for (const ligne of source.slice(debutFr).split('\n')) {
        if (MOTIF.test(ligne)) {
          fautifs.push(`${fichier} : ${ligne.trim()}`);
        }
      }
    }

    expect(fautifs).toEqual([]);
  });
});

/*
 * Même famille, vue le 01/10 sur Safari iOS (panneau Journaux) : l'indication du
 * champ de recherche disait « Journaux de recherche » — le VERBE anglais « Search
 * logs » traduit comme un NOM. Trois clés l'étaient (« Commandes de recherche »,
 * « Points de contrôle des agents de recherche »). Les deux vrais noms sont
 * nommés ci-dessous : un ajout doit être une décision, pas un oubli.
 */
describe('règle : « Search … » (verbe) n’est jamais traduit par « … de recherche » (nom)', () => {
  const NOMS_LEGITIMES = new Set([
    'settings.copy.searchQuery_3ad6e0f4',
    'chat.copy.searchAndAnalyticsIndexing_3c363e99',
  ]);

  it('aucune clé fautive dans les catalogues', async () => {
    const { readdirSync } = await import('node:fs');
    const dossier = new URL('../../lib/i18n/catalogs/', import.meta.url).pathname;
    const fautives: string[] = [];

    const paires = (bloc: string) =>
      new Map([...bloc.matchAll(/'([\w.]+)':\s*\n?\s*(['"])((?:(?!\2).)*)\2/gu)].map((m) => [m[1], m[3]]));

    for (const fichier of readdirSync(dossier).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      const source = readFileSync(dossier + fichier, 'utf8');
      const debutFr = source.search(/export const \w+Fr\b/u);

      if (debutFr < 0) {
        continue;
      }

      const en = paires(source.slice(0, debutFr));
      const fr = paires(source.slice(debutFr));

      for (const [cle, anglais] of en) {
        const francais = fr.get(cle);

        if (
          francais &&
          /^Search\s/u.test(anglais) &&
          /\bde recherche\b/u.test(francais) &&
          !/^(Rechercher|Recherchez|Chercher|Filtrer)/u.test(francais) &&
          !NOMS_LEGITIMES.has(cle)
        ) {
          fautives.push(`${cle} : « ${anglais} » → « ${francais} »`);
        }
      }
    }

    expect(fautives).toEqual([]);
  });
});
