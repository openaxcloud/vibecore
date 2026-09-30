import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreviewLoadingOverlay, PreviewNotRunningState, PreviewSplashSequence } from './Preview';

/*
 * BUG-LOGS-JSON-001 — aucune carte de l'Aperçu n'affiche la ligne JSON brute de
 * l'agent. Mesuré en prod le 30/09 à 390 px : la carte de démarrage montrait
 * `{"level":"error","service":"workspace-agent","event":"preview.proxy.unreachable",…}`
 * alors que le volet « Journaux du serveur » était corrigé depuis le 06/09.
 *
 * Ce test REND les trois cartes : il juge ce que l'utilisateur lit, pas le
 * source.
 */

const BRUTE =
  '{"level":"error","service":"workspace-agent","event":"preview.proxy.unreachable","port":5173,"error":"fetch failed"}';

const ORDINAIRE = '    at Object.<anonymous> (/workspace/src/main.tsx:4:1)';
const logs = [BRUTE, ORDINAIRE];
const etapes = [{ id: 'dependencies' as const, label: 'Dépendances', description: 'npm install' }];

const texte = (html: string) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const cartes: Array<[string, () => string]> = [
  [
    'préparation',
    () =>
      renderToStaticMarkup(
        <PreviewSplashSequence
          activeStep="dependencies"
          currentTask="…"
          isBusy
          logs={logs}
          progress={40}
          steps={etapes}
        />,
      ),
  ],
  [
    'démarrage',
    () =>
      renderToStaticMarkup(
        <PreviewLoadingOverlay activeStep="dependencies" currentTask="…" logs={logs} progress={40} steps={etapes} />,
      ),
  ],
  [
    'application non démarrée',
    () => renderToStaticMarkup(<PreviewNotRunningState isRunning={false} logs={logs} onRun={() => {}} />),
  ],
];

describe('cartes de l’Aperçu — le journal est lisible', () => {
  for (const [nom, rendre] of cartes) {
    it(`carte « ${nom} » : pas de JSON brut, la ligne ordinaire intacte`, () => {
      const html = texte(rendre());

      // Contrôle positif : le journal est bien rendu, sinon « absent » ne prouverait rien.
      expect(html, 'la ligne ordinaire doit être rendue telle quelle, indentation comprise').toContain(ORDINAIRE);
      expect(html).not.toContain('{"level"');
      expect(html).toContain('preview.proxy.unreachable');
    });
  }
});
