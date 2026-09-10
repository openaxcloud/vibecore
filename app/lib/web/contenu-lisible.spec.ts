import { describe, expect, it } from 'vitest';

import { extraireContenuLisible } from './contenu-lisible';

/*
 * BUG-URL-FETCH-DUMP-001 — Avi, 09/09 : « quand je marque l'URL ça affiche le
 * contenu pas organisé c'est incompréhensible ».
 *
 * La page ci-dessous REPRODUIT la structure de sa capture (`volt-watt.com`) :
 * un menu de langues, un titre, un slogan, des boutons et une liste de points
 * forts. Avec l'ancien extracteur, tout cela sortait en UNE ligne — c'est le
 * défaut, et c'est ce que le premier test mesure.
 */
const PAGE = `
<!doctype html>
<html><head><title>VoltWatt</title><style>.a{color:red}</style></head>
<body>
  <nav><a href="/en">English</a> <a href="/fr">Français</a> <a href="/de">Deutsch</a></nav>
  <header><span>VoltWatt</span></header>
  <main>
    <h1>Global Leader in Renewable Energy</h1>
    <p>Powering Tomorrow's Energy Today</p>
    <p>Leading the renewable energy transition with innovative solar, wind, and storage solutions.</p>
    <h2>Our Core Strengths</h2>
    <ul>
      <li>7+ Years Experience</li>
      <li>360&#176; Full Service</li>
      <li>2.5M Tons CO2 Saved</li>
    </ul>
    <a href="/solutions">Discover Our Solutions</a>
    <script>window.x = 1;</script>
  </main>
  <footer>&copy; VoltWatt</footer>
</body></html>`;

describe('extraireContenuLisible', () => {
  const sortie = extraireContenuLisible(PAGE);

  it('rend un document sur PLUSIEURS lignes — le défaut était d’en faire une seule', () => {
    const lignes = sortie.split('\n').filter((l) => l.trim().length > 0);

    expect(lignes.length, `sortie obtenue :\n${sortie}`).toBeGreaterThan(5);
  });

  it('garde les titres comme titres, et non collés au texte qui suit', () => {
    expect(sortie).toContain('## Global Leader in Renewable Energy');
    expect(sortie).toContain('### Our Core Strengths');
    expect(sortie, 'un titre collé à son paragraphe est exactement ce qu’Avi a vu').not.toContain(
      'Global Leader in Renewable Energy Powering Tomorrow',
    );
  });

  it('rend les listes en puces, une par ligne', () => {
    expect(sortie).toContain('- 7+ Years Experience');
    expect(sortie).toContain('- 2.5M Tons CO2 Saved');
    expect(sortie, 'les points forts ne doivent plus s’enchaîner sur une ligne').not.toContain(
      '7+ Years Experience 360',
    );
  });

  it('sépare deux paragraphes voisins', () => {
    expect(sortie).not.toContain("Powering Tomorrow's Energy Today Leading the renewable");
  });

  it('écarte le bruit : scripts, styles, navigation, pied de page', () => {
    expect(sortie).not.toContain('window.x');
    expect(sortie).not.toContain('color:red');
    expect(sortie, 'le menu de langues est du bruit dans un extrait').not.toContain('Deutsch');
  });

  it('décode les entités plutôt que de les afficher', () => {
    expect(sortie).toContain('360°');
    expect(sortie).not.toContain('&#176;');
  });

  it('garde le texte des liens, qui fait partie de la phrase', () => {
    expect(sortie).toContain('Discover Our Solutions');
  });

  it('ne rend ni ligne vide en rafale ni puce orpheline', () => {
    expect(sortie).not.toMatch(/\n{3,}/u);
    expect(sortie).not.toMatch(/(?:^|\n)-\s*(?:\n|$)/u);
  });

  /*
   * Les trois qui suivent viennent d'avoir REGARDÉ la sortie, pas seulement le
   * verdict des tests précédents : ils passaient tous les neuf alors que le
   * rendu réel collait encore deux liens voisins, aérait les puces comme des
   * paragraphes, et laissait fuiter le <title> dans le corps. Un test vert
   * n'est pas un rendu lisible.
   */
  it('ne colle pas deux liens voisins — « Discover Our SolutionsView Our Projects »', () => {
    const sortieDeuxLiens = extraireContenuLisible('<p><a>Discover Our Solutions</a><a>View Our Projects</a></p>');

    expect(sortieDeuxLiens).toContain('Discover Our Solutions View Our Projects');
  });

  it('serre les puces : une par ligne, sans ligne vide entre elles', () => {
    expect(sortie).toContain('- 7+ Years Experience\n- 360° Full Service');
  });

  it('ne fait pas fuiter le <title> dans le corps — l’appelant l’affiche déjà à part', () => {
    expect(sortie.split('\n')[0]).not.toBe('VoltWatt');
  });

  it('supporte une entrée vide ou sans corps sans lever', () => {
    expect(extraireContenuLisible('')).toBe('');
    expect(extraireContenuLisible('<html></html>')).toBe('');
  });
});
