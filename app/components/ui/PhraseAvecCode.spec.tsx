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
