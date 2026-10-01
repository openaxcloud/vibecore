import { describe, expect, it } from 'vitest';
import { fusionnerATroisVoies } from './fusion-a-trois-voies';

const BASE = [
  "import { useState } from 'react';",
  '',
  'export default function App() {',
  '  return (',
  '    <main>',
  '      <h1>Compteur</h1>',
  '    </main>',
  '  );',
  '}',
  '',
].join('\n');

describe('fusionnerATroisVoies', () => {
  it('garde la ligne de l’utilisateur ET le bouton de l’agent quand ils touchent des régions distinctes (cas mesuré en production)', () => {
    const agent = BASE.replace(
      '      <h1>Compteur</h1>\n',
      '      <h1>Compteur</h1>\n      <button>Remise à zéro</button>\n',
    );

    const utilisateur = `${BASE}// MARQUEUR-UTILISATEUR\n`;

    const resultat = fusionnerATroisVoies(BASE, agent, utilisateur);

    expect(resultat).toEqual({ propre: true, contenu: `${agent}// MARQUEUR-UTILISATEUR\n` });
  });

  it('déclare un conflit quand les deux modifient la même ligne différemment', () => {
    const agent = BASE.replace('Compteur', 'Compteur de l’agent');
    const utilisateur = BASE.replace('Compteur', 'Compteur de l’utilisateur');

    expect(fusionnerATroisVoies(BASE, agent, utilisateur)).toEqual({ propre: false });
  });

  it('déclare un conflit quand les deux modifications se TOUCHENT — la prudence est voulue', () => {
    const agent = BASE.replace('    <main>\n', '    <main className="a">\n');
    const utilisateur = BASE.replace('      <h1>Compteur</h1>\n', '      <h1>Mon compteur</h1>\n');

    expect(fusionnerATroisVoies(BASE, agent, utilisateur)).toEqual({ propre: false });
  });

  it('accepte une modification identique des deux côtés', () => {
    const meme = BASE.replace('Compteur', 'Titre');
    const agent = `${meme}// agent\n`;

    expect(fusionnerATroisVoies(BASE, agent, meme)).toEqual({ propre: true, contenu: agent });
  });

  it('rend la version de l’utilisateur quand l’agent ne change rien, et celle de l’agent quand l’utilisateur ne change rien', () => {
    const autre = BASE.replace('Compteur', 'X');

    expect(fusionnerATroisVoies(BASE, BASE, autre)).toEqual({ propre: true, contenu: autre });
    expect(fusionnerATroisVoies(BASE, autre, BASE)).toEqual({ propre: true, contenu: autre });
  });

  it('garde une suppression de l’utilisateur loin de la modification de l’agent', () => {
    const agent = BASE.replace('Compteur', 'Titre');
    const utilisateur = BASE.replace("import { useState } from 'react';\n", '');

    expect(fusionnerATroisVoies(BASE, agent, utilisateur)).toEqual({
      propre: true,
      contenu: agent.replace("import { useState } from 'react';\n", ''),
    });
  });
});
