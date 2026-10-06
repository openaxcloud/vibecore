import { Fragment } from 'react';

/**
 * Une phrase traduite ENTIÈRE, dont les marqueurs `{nom}` deviennent des `<code>`.
 *
 * Mesuré le 2026-09-30 sur Safari iOS (panneau Intégrations) : la phrase était
 * découpée en trois clés autour de deux `<code>` — ordre des mots anglais imposé
 * au français (« un`users`migration de table »), et aucune espace nulle part :
 * en JSX, le retour à la ligne entre `{t(…)}` et `<code>` n'en produit pas, si
 * bien que l'anglais aussi rendait « — a`users`table migration ». Une phrase
 * par langue laisse chaque langue placer le code où sa grammaire le veut.
 */
export function PhraseAvecCode({ texte, codes }: { texte: string; codes: Record<string, string> }) {
  const morceaux = texte.split(/\{(\w+)\}/g);

  return (
    <>
      {morceaux.map((morceau, index) =>
        index % 2 === 1 && Object.prototype.hasOwnProperty.call(codes, morceau) ? (
          <code key={index}>{codes[morceau]}</code>
        ) : (
          <Fragment key={index}>{index % 2 === 1 ? `{${morceau}}` : morceau}</Fragment>
        ),
      )}
    </>
  );
}
