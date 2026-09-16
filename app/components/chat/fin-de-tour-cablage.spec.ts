import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * RP-CKPT-01 à 07 — le câblage de la fin de tour à la Replit, tenu par des
 * gardes qui lisent le CODE (règle 15 : un correctif sans test est réputé non
 * livré ; règle 5 : jamais ancré sur de la prose).
 *
 * Chaque point d'Avi (08/09, 07:48–07:51) a sa moitié de code, et chaque
 * moitié son test : le bloc rendu sous la réponse, les puces retirées de
 * l'IDE projet, le point pris automatiquement en fin de tour, la feuille de
 * retour arrière en trois blocs sans case à cocher, « Changes » qui ouvre le
 * commit, la durée et le coût dans l'annotation, la mémoire archivée côté API.
 */

const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url).pathname, 'utf8');

describe('fin de tour — câblage', () => {
  it('rend FinDeTour sous chaque réponse de l’agent dans l’IDE projet, puces retirées', () => {
    const messages = lire('./Messages.client.tsx');

    expect(messages).toContain("import { FinDeTour } from './FinDeTour';");
    expect(messages).toContain('<FinDeTour');
    expect(messages).toContain('masquerLesPuces={Boolean(props.projectIdeMode)}');
    expect(messages).toMatch(
      /fusionnerLesStatistiques\(\s*statistiquesDuTour\(message\),\s*point\?\.statistiques,?\s*\)/u,
    );

    const assistant = lire('./AssistantMessage.tsx');

    expect(assistant).toContain('{agentModeChipText && !masquerLesPuces ? (');
    expect(assistant).toContain('{usageChipText && !masquerLesPuces ? (');
  });

  it('prend le point de restauration AUTOMATIQUEMENT en fin de tour, dès que des fichiers ont changé', () => {
    const chat = lire('./Chat.client.tsx');

    expect(chat).toContain('if (leTourAEcritDesFichiers(messageComplet)) {');
    expect(chat).toContain('.creerLePointDeRestaurationDuTour({');

    const workbench = lire('../../lib/stores/workbench.ts');

    expect(workbench).toContain("form.set('intent', 'checkpoint');");
    expect(workbench).toContain("new CustomEvent('vibecore:snapshots-changed'");
    expect(workbench).toContain('await this.attendreLaFinDesTaches();');
    expect(workbench).toContain("form.set('turnIndex', String(input.turnIndex));");
    expect(chat).toContain('turnIndex,');
  });

  it('côté serveur : commit + instantané reliés au message, durée et coût dans l’annotation, mémoire archivée', () => {
    const route = lire('../../routes/api.projects.$projectId.ide-panel.$panel.ts');

    expect(route).toContain("} else if (intent === 'checkpoint') {");
    expect(route).toContain("kind: 'automatic',");
    expect(route).toContain('commitMessage: label,');
    expect(route).toContain("code !== 'GIT_NOTHING_TO_COMMIT'");
    expect(route).toContain('`/projects/${projectId}/agent-memory/rollback`');

    const chatRoute = lire('../../routes/api.chat.ts');

    expect(chatRoute).toContain('durationMs: Date.now() - chronoFlux.debut,');
    expect(chatRoute).toContain('factureDuTour = await recordChatUsage({');
    expect(chatRoute).toContain(
      "typeof factureDuTour?.costCents === 'number' ? { costCents: factureDuTour.costCents } : {}",
    );

    const api = lire('../../../services/api/src/app.ts');

    expect(api).toContain("app.post('/projects/:projectId/agent-memory/rollback', async (request) => {");

    const memoire = lire('../../../services/api/src/agent-memory.ts');

    expect(memoire).toContain('async archiveProjectMemoriesCreatedAfter(input: { projectId: string; since: Date }) {');
    expect(memoire).toContain('WHERE "projectId" = $1 AND "createdAt" > $2 AND "archivedAt" IS NULL');
  });

  it('BaseChat : points par message, rechargement à la prise d’un point, feuille Replit sans case à cocher, « Changes » → commit', () => {
    const baseChat = lire('./BaseChat.tsx');

    expect(baseChat).toMatch(
      /pointsDeRestaurationParMessage\(projectSnapshots,\s*\{\s*messages: messages \?\? \[\],\s*conversationId: currentAiConversationId,/u,
    );
    expect(baseChat).toContain("window.addEventListener('vibecore:snapshots-changed', handleSnapshotsChanged);");
    expect(baseChat).toContain('commitDemande.set(point.commitSha);');
    expect(baseChat).toContain("form.set('restoreAgentMemory', 'true');");
    expect(baseChat).toContain('data-testid="rollback-impact"');
    expect(baseChat).not.toContain('setRollbackDatabase(');
    expect(baseChat).toContain("['finDeTour.rollbackDialog.memory']");

    const git = lire('../git/GitTab.tsx');

    expect(git).toContain('const commitDemandeCourant = useStore(commitDemande);');
    expect(git).toContain('void loadCommitRef.current(commitDemandeCourant)');
  });

  it('feuille de style : les mesures Replit (ligne 38, icône 26, titre 14, rangée 13, bouton 28) et la croix de la feuille', () => {
    const feuille = lire('../../styles/index.scss');

    const bloc = (selecteur: string) => {
      const debut = feuille.indexOf(selecteur);

      expect(debut, selecteur).toBeGreaterThan(-1);

      return feuille.slice(debut, feuille.indexOf('}', debut));
    };

    expect(bloc('.bolt-fin-de-tour-titre {')).toContain('min-height: 38px;');
    expect(bloc('.bolt-fin-de-tour-titre {')).toContain('font-size: 14px;');
    expect(bloc('.bolt-fin-de-tour-icone {')).toContain('width: 26px;');
    expect(bloc('.bolt-fin-de-tour-rangee {')).toContain('font-size: 13px;');
    expect(bloc('.bolt-fin-de-tour-boutons > button {')).toContain('height: 28px;');
    expect(bloc('.bolt-fin-de-tour {')).toContain('font-family: var(--vc-font-interface);');
    expect(bloc('.bolt-project-rollback-fermer {')).toContain('position: absolute;');
    expect(bloc('.bolt-project-rollback-body h2 {')).toContain('font-size: 20px;');
    expect(bloc('.bolt-project-rollback-dialog footer button:last-child {')).toContain('background: #0079f2;');
    expect(feuille).toContain(
      '.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-project-rollback-body h2 {\n  font-size: 20px !important;',
    );
    expect(bloc('.bolt-project-ide-shell .bolt-project-rollback-overlay {')).toContain('z-index: 12070;');
  });
});
