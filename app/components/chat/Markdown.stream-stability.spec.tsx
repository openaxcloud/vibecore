/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./Artifact', () => ({
  Artifact: () => null,
  openArtifactInWorkbench: vi.fn(),
}));

vi.mock('./CodeBlock', () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

vi.mock('./MermaidBlock', () => ({
  MermaidBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { Markdown } from './Markdown';

/*
 * BUG-STREAM-JUMP-001 — « le contenu de l'agent n'arrête pas de sauter, c'est
 * impossible de suivre le streaming » (Avi, 08/09).
 *
 * Cause MESURÉE à 390 sur le build de production, tour streamé, sonde
 * MutationObserver : `append` vient de `useChat` et change d'identité à chaque
 * lot de jetons. La table `components` de react-markdown en dépendait, donc
 * chacune de ses entrées changeait de TYPE à chaque lot, et react-markdown
 * démontait puis remontait tout le sous-arbre — le markdown de TOUS les
 * messages du fil, tours terminés compris, recréé toutes les 25 à 65 ms
 * (387 recréations sur 400 mutations relevées). D'où le bloc de code qui
 * clignote (39 apparitions/disparitions) et le à-coup de −159 px.
 *
 * Après correctif, même sonde, même build : 3 recréations sur 135 mutations,
 * 3 clignotements, plus aucun à-coup négatif.
 *
 * Ce test tient la RÈGLE, pas le symptôme : un nouveau `append` ne doit rien
 * remonter. Il se lit sur l'IDENTITÉ des nœuds du DOM — la seule chose qui
 * distingue un re-rendu (bon) d'un remontage (le défaut).
 */

function creerI18n() {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: 'fr',
    fallbackLng: 'en',
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

afterEach(cleanup);

const CONTENU = 'Un paragraphe de prose.\n\n```ts\nconst x = 1;\n```\n\nEt la suite du texte.';

function noeuds(racine: HTMLElement) {
  return {
    paragraphe: racine.querySelector('p'),
    bloc: racine.querySelector('pre'),
  };
}

describe('markdown pendant un flux — aucun remontage', () => {
  it('garde les MÊMES nœuds quand `append` change d’identité à chaque lot de jetons', () => {
    const i18n = creerI18n();

    const { container, rerender } = render(
      <I18nextProvider i18n={i18n}>
        <Markdown append={vi.fn()} setChatMode={vi.fn()}>
          {CONTENU}
        </Markdown>
      </I18nextProvider>,
    );

    const avant = noeuds(container);

    expect(avant.paragraphe, 'le rendu de départ doit produire un paragraphe').toBeTruthy();
    expect(avant.bloc, 'le rendu de départ doit produire un bloc de code').toBeTruthy();

    /*
     * Dix lots de jetons : `append` et `setChatMode` sont NEUFS à chaque fois,
     * exactement ce que fait `useChat` pendant une génération.
     */
    for (let lot = 0; lot < 10; lot += 1) {
      rerender(
        <I18nextProvider i18n={i18n}>
          <Markdown append={vi.fn()} setChatMode={vi.fn()}>
            {CONTENU}
          </Markdown>
        </I18nextProvider>,
      );
    }

    const apres = noeuds(container);

    expect(apres.paragraphe, 'le paragraphe déjà lu ne doit pas être recréé').toBe(avant.paragraphe);
    expect(apres.bloc, 'le bloc de code ne doit pas clignoter').toBe(avant.bloc);
  });

  it('appelle tout de même le DERNIER `append`, jamais celui du premier rendu', () => {
    const i18n = creerI18n();
    const premier = vi.fn();
    const dernier = vi.fn();

    const arbre = (append: () => void) => (
      <I18nextProvider i18n={i18n}>
        <Markdown append={append} setChatMode={vi.fn()} html>
          {
            '<div class="__boltQuickAction__"><button data-bolt-quick-action="true" data-type="message" data-message="salut">Envoyer</button></div>'
          }
        </Markdown>
      </I18nextProvider>
    );

    const { container, rerender } = render(arbre(premier));
    rerender(arbre(dernier));

    const bouton = container.querySelector<HTMLButtonElement>('button[data-type="message"]');

    expect(bouton, 'l’action rapide doit être rendue').toBeTruthy();
    bouton!.click();

    expect(dernier, 'le clic doit atteindre le rappel le plus récent').toHaveBeenCalledTimes(1);
    expect(premier, 'jamais le rappel figé du premier rendu').not.toHaveBeenCalled();
  });
});
