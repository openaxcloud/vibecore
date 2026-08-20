import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * BUG-IDE-013 — « le panneau PROBLÈMES ne s'ouvre jamais ».
 *
 * Mesuré live le 19/08 : la barre d'état comptait juste (« Problèmes 1 0 »,
 * `aria-label="Ouvrir les problèmes : 1 erreur, 0 avertissements."`), donc
 * l'alimentation marchait. C'est l'OUVERTURE qui manquait : sur mobile,
 * `openBottomTerminal('problems')` appelait `setMobileIdePanel('terminal')` et
 * envoyait donc « Problèmes » sur la surface Terminal — gelée (ref IMG_9149),
 * et qui ignore `bottomTerminalView` pour toujours afficher le Shell.
 *
 * Ces tests lisent la SOURCE plutôt que de monter `BaseChat` (≈ 23 000 lignes,
 * des dizaines de dépendances runtime) : ce qu'il faut verrouiller ici est le
 * CÂBLAGE, et un test de câblage qui ne peut pas se monter ne verrouille rien.
 */
const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');

function blocDe(nom: string): string {
  const debut = source.indexOf(nom);
  expect(debut, `${nom} doit exister`).toBeGreaterThan(-1);

  return source.slice(debut, source.indexOf('\n    );', debut));
}

describe('BUG-IDE-013 — « Problèmes » est un panneau, pas la surface Terminal', () => {
  it('enregistre « problems » parmi les panneaux de gestion', () => {
    const debut = source.indexOf('const IDE_MANAGEMENT_PANELS = [');
    const bloc = source.slice(debut, source.indexOf('] as const;', debut));

    expect(bloc).toContain("'problems'");
  });

  it('route « Problèmes » vers son panneau au lieu de la surface Terminal gelée', () => {
    const bloc = blocDe('const openBottomTerminal = useCallback(');

    // La branche dédiée doit précéder le repli vers le Terminal…
    const brancheProblemes = bloc.indexOf("view === 'problems'");
    const repliTerminal = bloc.indexOf("setMobileIdePanel('terminal')");

    expect(brancheProblemes).toBeGreaterThan(-1);
    expect(repliTerminal).toBeGreaterThan(-1);
    expect(brancheProblemes).toBeLessThan(repliTerminal);

    // …et poser l'onglet « problems », jamais l'onglet Terminal.
    expect(bloc).toContain("setMobileIdePanel('deploy', { activeTabId: 'problems' })");
    expect(bloc).toContain("setProjectPanelSearchParam('problems')");
  });

  it('rend le panneau alimenté par le store diagnostics, sans passer par l’API des panneaux', () => {
    /*
     * `ProjectProblemsPanel` lit `useDiagnosticsStore`. Le faire passer par
     * `ProjectIdeServicePanel` déclencherait un appel `/ide-panel/problems`
     * qui 404 — et afficherait une erreur à la place des diagnostics qu'on a
     * déjà sous la main. Les deux surfaces doivent donc court-circuiter.
     */
    expect(source).toMatch(/if \(panel === 'problems'\) \{\s*return <ProjectProblemsPanel \/>;/u);
    expect(source).toMatch(/if \(props\.panel === 'problems'\) \{\s*return <ProjectProblemsPanel \/>;/u);
  });

  it('aiguille depuis une enveloppe SANS crochet, hors du bloc gelé', () => {
    /*
     * Le point d'appel mobile vit DANS le bloc gelé par Avi, scellé par
     * empreinte dans `base-chat-ast.spec.ts`. L'aiguillage doit donc vivre dans
     * l'enveloppe `ProjectIdeServicePanel`, définie après le bloc — sinon le
     * sceau dérive, et c'est précisément ce qu'il est là pour refuser.
     *
     * L'enveloppe ne porte AUCUN crochet : le corps réel est déplacé dans
     * `ProjectIdeApiServicePanel` et appelé tel quel, donc aucun crochet ne
     * devient conditionnel.
     */
    const debutGele = source.indexOf('    const mobileHeaderTab =');
    const finGele = source.indexOf('        {projectIdeMode && (', debutGele);
    const enveloppe = source.indexOf('function ProjectIdeServicePanel(props:');

    expect(debutGele).toBeGreaterThan(-1);
    expect(finGele).toBeGreaterThan(debutGele);
    expect(enveloppe).toBeGreaterThan(finGele);

    const corpsEnveloppe = source.slice(enveloppe, source.indexOf('\n}\n', enveloppe));

    expect(corpsEnveloppe).toContain('<ProjectIdeApiServicePanel {...props} />');
    expect(corpsEnveloppe).not.toMatch(/\buse[A-Z]/u);
  });

  it('laisse le sceau du dock mobile intact', () => {
    /*
     * Avi a gelé les trois onglets fixes et leur ordre (SCR-004, certifié live
     * le 20/08). Ajouter un panneau ne doit PAS s'y inviter : « Problèmes »
     * s'atteint par la barre d'état, l'URL ou la grille — pas en poussant un
     * onglet fixe dehors.
     */
    const debut = source.indexOf('const ECODE_MOBILE_DEFAULT_TABS = [');
    const bloc = source.slice(debut, source.indexOf('] as const;', debut));

    expect(bloc).toContain("'preview', 'agent', 'deployments'");
    expect(bloc).not.toContain('problems');
  });

  it('donne au panneau un titre et une icône, jamais son identifiant brut', () => {
    // BUG-IDE-002 : un panneau sans clé affichait son id (« skills », « studio »).
    expect(source).toContain("problems: 'baseChatAst.common.problems'");
    expect(source).toContain("problems: 'i-ph:warning-circle'");
  });
});

describe('BUG-IDE-013 — les diagnostics restent cliquables vers fichier:ligne', () => {
  it('ouvre le fichier à la ligne du diagnostic', () => {
    const bloc = source.slice(source.indexOf('function ProjectProblemsPanel()'));

    expect(bloc).toContain('workbenchStore.setSelectedFile(resolvedPath)');
    expect(bloc).toContain('setCurrentDocumentScrollPosition({ line: Math.max(0, line - 1)');
    expect(bloc).toContain("workbenchStore.currentView.set('code')");
  });
});
