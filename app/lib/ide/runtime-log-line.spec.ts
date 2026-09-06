import { describe, expect, it } from 'vitest';
import { ligneRuntimeLisible, texteRuntimeLisible } from './runtime-log-line';

/*
 * BUG-DEBUG-I18N-001 — capture iPhone d'Avi, 05/09 23:01 : le panneau
 * Débogueur affichait trois lignes JSON brutes de l'agent, tronquées et
 * corrompues (« …"port":5173,' failed"} »). Un humain veut lire : niveau,
 * événement, port.
 */
describe('ligneRuntimeLisible', () => {
  it('rend un événement JSON structuré en une ligne lisible', () => {
    const ligne = ligneRuntimeLisible(
      '{"level":"error","service":"workspace-agent","event":"preview.proxy.unreachable","port":5173,"message":"connect ECONNREFUSED"}',
    );

    expect(ligne).toEqual({
      niveau: 'error',
      texte: 'workspace-agent · preview.proxy.unreachable · port 5173 · connect ECONNREFUSED',
    });
  });

  it('récupère les champs encore lisibles d’une ligne JSON TRONQUÉE — le cas de la capture', () => {
    const ligne = ligneRuntimeLisible(
      '{"level":"error","service":"workspace-agent","event":"preview.proxy.unreachable","port":5173,\' failed"}',
    );

    expect(ligne.niveau).toBe('error');
    expect(ligne.texte).toBe('workspace-agent · preview.proxy.unreachable · port 5173');
    expect(ligne.texte).not.toContain('{');
  });

  it('laisse passer telle quelle une ligne qui n’est pas du JSON', () => {
    expect(ligneRuntimeLisible('  VITE v5.4.21  ready in 312 ms ')).toEqual({
      niveau: null,
      texte: 'VITE v5.4.21  ready in 312 ms',
    });
  });

  it('ne perd rien sur un objet sans champ connu : le JSON reste affiché', () => {
    expect(ligneRuntimeLisible('{"foo":1}')).toEqual({ niveau: null, texte: '{"foo":1}' });
  });

  it('un JSON invalide sans événement ni niveau revient brut plutôt que vide', () => {
    expect(ligneRuntimeLisible('{"foo":"ba')).toEqual({ niveau: null, texte: '{"foo":"ba' });
  });
});

/*
 * Captures iPhone d'Avi, 06/09 10:35–10:36 : la même ligne JSON brute dans
 * « Journaux du serveur » de la Webview (un `<pre>`, 27 fois) et dans le
 * panneau Problèmes (« 27 occurrences détectées »).
 */
describe('texteRuntimeLisible', () => {
  it('rend la ligne de la capture en texte, niveau entre crochets', () => {
    expect(
      texteRuntimeLisible(
        '{"level":"error","service":"workspace-agent","event":"preview.proxy.unreachable","port":5173,"error":"fetch failed"}',
      ),
    ).toBe('[error] workspace-agent · preview.proxy.unreachable · port 5173 · fetch failed');
  });

  it('laisse passer une ligne ordinaire sans crochets', () => {
    expect(texteRuntimeLisible('Reconnexion à l’espace de travail en cours d’exécution.')).toBe(
      'Reconnexion à l’espace de travail en cours d’exécution.',
    );
  });
});
