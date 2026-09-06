import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Lot IDE-MOBILE-2026-09-05 — cinq captures iPhone d'Avi (22:51–23:05) :
 *   1. la feuille « Outils MCP » ouverte HORS de l'écran (BUG-MOBILE-MCP-001) ;
 *   2. la carte de démarrage de la Webview aux étapes tronquées, et un
 *      « Ancrer à droite » sans volet de droite (BUG-PREVIEW-MOBILE-001) ;
 *   3. le panneau Journaux dont la barre d'outils mangeait l'écran
 *      (BUG-LOGS-MOBILE-001).
 *
 * Lot IDE-MOBILE-2026-09-06 — quatre captures de plus (« tu as pas réduit
 * ici… fixe tous les panneaux, tout sans exception ») :
 *   4. l'échelle du chrome des panneaux (la règle de coquille aplatissait tout
 *      à 14 px pendant que la légende descendait à 9 px) ;
 *   5. le bandeau Journaux sur trois rangées, actions en icônes ;
 *   6. la Webview : barre d'adresse, carte de démarrage (le BON élément,
 *      `.bolt-preview-loading-steps`), onglets des journaux ;
 *   7. la feuille « + » et l'état de départ de l'Agent : rien de tronqué.
 *
 * Mesuré sur le build de production, Chromium, AVANT correction :
 *   - modale à 390 px : left = 195 px pour 366 px de large → 171 px hors écran ;
 *   - modale à 1440 px : left = 720 px, coin haut-gauche au centre, sur bureau
 *     AUSSI. La cause n'est pas mobile : `@keyframes vc-modal-in` animait
 *     `transform`, et `animation-fill-mode: both` remplaçait pour toujours le
 *     `translate(-50%, -50%)` qui centre les modales Radix.
 */

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const INDEX = sansCommentaires(readFileSync(join(__dirname, 'index.scss'), 'utf8'));
const BASE_CHAT = readFileSync(join(__dirname, '..', 'components', 'chat', 'BaseChat.tsx'), 'utf8');

function bloc(selecteur: string): string {
  const debut = INDEX.indexOf(`${selecteur} {`);
  expect(debut, `règle ${selecteur} introuvable`).toBeGreaterThan(-1);

  return INDEX.slice(debut, INDEX.indexOf('}', debut) + 1);
}

/* La DERNIÈRE déclaration d'un sélecteur — celle des requêtes de média étroites, qui gagne. */
function dernierBloc(selecteur: string): string {
  const debut = INDEX.lastIndexOf(`${selecteur} {`);
  expect(debut, `règle ${selecteur} introuvable`).toBeGreaterThan(-1);

  return INDEX.slice(debut, INDEX.indexOf('}', debut) + 1);
}

describe('1. modales — l’animation d’entrée ne doit jamais écraser le centrage', () => {
  it('`vc-modal-in` anime `scale`, pas `transform`', () => {
    const debut = INDEX.indexOf('@keyframes vc-modal-in {');
    expect(debut).toBeGreaterThan(-1);

    const fin = INDEX.indexOf('\n}\n', debut);
    const keyframes = INDEX.slice(debut, fin);

    expect(keyframes).not.toMatch(/transform\s*:/);
    expect(keyframes).toMatch(/scale\s*:\s*0\.9/);
    expect(keyframes).toMatch(/scale\s*:\s*1\s*;/);
  });

  it('les modales portent toujours cette animation en `both` — le piège reste armé, la garde aussi', () => {
    const regle = bloc("body :where([role='dialog'], .dialog, .modal, .bolt-project-command-palette)");

    expect(regle).toMatch(/animation:\s*vc-modal-in[^;]*both/);
  });
});

describe('2. carte de démarrage de la Webview sur téléphone', () => {
  it('deux colonnes assumées et des libellés qui se replient au lieu d’être tronqués', () => {
    expect(bloc('.bolt-responsive-ide-mobile .bolt-preview-splash-steps')).toMatch(/repeat\(2,/);

    const libelle = bloc('.bolt-responsive-ide-mobile .bolt-preview-splash-steps strong');

    expect(libelle).toMatch(/white-space:\s*normal/);
    expect(libelle).toMatch(/overflow:\s*visible/);
  });

  it('la VRAIE carte de démarrage (`loading-steps`) : deux colonnes, libellé entier à 11 px', () => {
    // 05/09 : seule la `splash` avait été corrigée ; la capture montrait la `loading`.
    expect(bloc('.bolt-responsive-ide-mobile .bolt-preview-loading-steps')).toMatch(/repeat\(2,/);

    const libelle = bloc(
      '.bolt-responsive-ide-mobile .bolt-preview-loading-steps strong,\n  .bolt-responsive-ide-mobile .bolt-preview-splash-steps strong',
    );

    expect(libelle).toMatch(/white-space:\s*normal/);
    expect(libelle).toMatch(/overflow:\s*visible/);
    expect(libelle).toMatch(/font-size:\s*11px\s*!important/);
  });

  it('« Ancrer à droite » est masqué : pas de volet de droite sur un téléphone', () => {
    expect(bloc('.bolt-responsive-ide-mobile .bolt-preview-logs-panel header > button')).toMatch(/display:\s*none/);
  });

  it('les onglets des journaux de la Webview : 12 px, et le bandeau se replie', () => {
    expect(bloc('.bolt-responsive-ide-mobile .bolt-preview-logs-panel button')).toMatch(
      /font-size:\s*12px\s*!important/,
    );
    expect(bloc('.bolt-responsive-ide-mobile .bolt-preview-logs-panel header')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('la barre d’adresse : 36 px, bouton de port 30 px (mesurés 53 et 44)', () => {
    // Trois déclarations de ce sélecteur ; la dernière est celle du 06/09.
    expect(dernierBloc('.bolt-responsive-ide-mobile .bolt-workbench-mobile .bolt-preview-addressbar')).toMatch(
      /min-height:\s*36px/,
    );

    const port = bloc(
      '.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-workbench-mobile .bolt-preview-port-button',
    );

    expect(port).toMatch(/height:\s*30px\s*!important/);
  });
});

describe('3. panneau Journaux sur téléphone', () => {
  it('une seule famille de boutons : 28 px, 12 px, même bordure', () => {
    const boutons = bloc(
      '.bolt-responsive-ide-mobile .bolt-project-console-header button,\n  .bolt-responsive-ide-mobile .bolt-project-console-header .bolt-project-console-status',
    );

    expect(boutons).toMatch(/height:\s*28px/);
    expect(boutons).toMatch(/font-size:\s*12px\s*!important/);
    expect(boutons).toMatch(/border:\s*1px solid/);
  });

  it('le champ de recherche partage sa ligne avec les actions, au plancher iOS de 16 px', () => {
    const champ = bloc('.bolt-responsive-ide-mobile .bolt-project-console-header input');

    expect(champ).toMatch(/flex:\s*1 1 auto/);
    expect(champ).toMatch(/font-size:\s*16px/);
  });

  it('la vue fractionnée est masquée — deux colonnes n’ont pas de sens sur 390 px', () => {
    const cache = bloc(
      ".bolt-responsive-ide-mobile .bolt-project-console-header button[aria-label*='fractionn'],\n  .bolt-responsive-ide-mobile .bolt-project-console-header button[aria-label*='split' i]",
    );

    expect(cache).toMatch(/display:\s*none/);
  });

  it('trois rangées : flux et niveaux défilent au doigt, les actions sont des icônes de 32 px', () => {
    expect(bloc('.bolt-responsive-ide-mobile .bolt-project-console-header')).toMatch(/display:\s*grid/);

    const defilent = bloc(
      '.bolt-responsive-ide-mobile .bolt-project-console-streams,\n  .bolt-responsive-ide-mobile .bolt-project-console-level-chips',
    );

    expect(defilent).toMatch(/overflow-x:\s*auto/);
    expect(bloc('.bolt-responsive-ide-mobile .bolt-project-console-search button')).toMatch(/width:\s*32px/);
    expect(bloc('.bolt-responsive-ide-mobile .bolt-project-console-action-label')).toMatch(/display:\s*none/);
    expect(bloc('.bolt-responsive-ide-mobile .bolt-project-console-action-icon')).toMatch(/display:\s*inline-block/);
  });

  it('sur bureau les deux groupes sont transparents et les icônes absentes — rien ne change', () => {
    expect(bloc('.bolt-project-console-streams,\n.bolt-project-console-search')).toMatch(/display:\s*contents/);
    expect(bloc('.bolt-project-console-action-icon')).toMatch(/display:\s*none/);
  });

  it('le balisage porte les deux groupes et une icône par action — la moitié DOM de la garde', () => {
    expect(BASE_CHAT).toContain('className="bolt-project-console-streams"');
    expect(BASE_CHAT).toContain('className="bolt-project-console-search"');
    expect(BASE_CHAT.match(/bolt-project-console-action-icon i-ph:/g)?.length).toBe(6);
    expect(BASE_CHAT.match(/className="bolt-project-console-action-label"/g)?.length).toBe(6);
  });
});

describe('4. échelle du chrome des panneaux sur téléphone', () => {
  const PANNEAU = '.bolt-project-ide-shell\n    .bolt-responsive-ide-mobile\n    .bolt-workbench-mobile\n    ';

  it('la légende ne descend plus à 9 px sous 1024 px : 11 px, pas moins que le bureau', () => {
    const mobile = INDEX.indexOf('@media (max-width: 1024px) {\n  :root {');

    expect(mobile).toBeGreaterThan(-1);

    const racine = INDEX.slice(mobile, INDEX.indexOf('\n  }\n', mobile));

    expect(racine).toMatch(/--vc-type-label-size:\s*11px/);
    expect(INDEX).not.toMatch(/--vc-type-label-size:\s*9px/);
  });

  it('13 / 12 / 11 / 10 px avec `!important`, portés au-dessus de la règle de coquille', () => {
    expect(
      bloc(
        ".bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-workbench-mobile :where(.text-sm):not([class*='i-'])",
      ),
    ).toMatch(/font-size:\s*13px\s*!important/);
    expect(
      bloc(`${PANNEAU}:where(.text-xs, small, [class*='text-xs']:not([class*=':text-xs'])):not([class*='i-'])`),
    ).toMatch(/font-size:\s*12px\s*!important/);
    expect(bloc(`${PANNEAU}:where([class*='text-[10px]'], [class*='text-[11px]']):not([class*='i-'])`)).toMatch(
      /font-size:\s*11px\s*!important/,
    );
    expect(bloc(`${PANNEAU}:where(.uppercase[class*='tracking']):not([class*='i-'])`)).toMatch(
      /font-size:\s*10px\s*!important/,
    );
  });

  it('la règle de coquille qui aplatit tout à 14 px est toujours là — la garde a une raison d’être', () => {
    expect(INDEX).toMatch(
      /\.bolt-project-ide-shell\s*:where\(div, span, p, a, li, td, summary, button, input, select, textarea, label, small, strong\):not\(\[class\*='i-'\]\)[\s\S]{0,400}font-size: var\(--vc-type-interface-size\) !important/,
    );
  });

  it('un en-tête « titre | bouton » se replie — et les cibles gardent 44 px (aucune règle de hauteur sur h-7 / h-9)', () => {
    expect(
      bloc('.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-workbench-mobile :where(.flex.justify-between)'),
    ).toMatch(/flex-wrap:\s*wrap/);

    // Run 1481 refusé par TACTILE-001 : 36 px sur `h-7` — plus jamais.
    expect(INDEX).not.toMatch(/\.bolt-workbench-mobile :where\(button\.h-7/);
    expect(INDEX).not.toMatch(/\.bolt-workbench-mobile :where\(button\.h-9/);
  });
});

describe('5. feuille « + » et état de départ de l’Agent : rien de tronqué', () => {
  it('feuille « + » : titres 13 px, descriptions 12 px sans coupe, une colonne sur téléphone', () => {
    expect(
      bloc(".bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-mobile-more-item-copy span:not([class*='i-'])"),
    ).toMatch(/font-size:\s*13px\s*!important/);

    const description = bloc(
      ".bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-mobile-more-item-copy small:not([class*='i-'])",
    );

    expect(description).toMatch(/font-size:\s*12px\s*!important/);
    expect(description).toMatch(/-webkit-line-clamp:\s*unset/);

    const liste = dernierBloc('.bolt-responsive-ide-mobile .bolt-mobile-more-list');

    expect(liste).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(liste).not.toMatch(/repeat\(/);
  });

  it('état de départ : une action par ligne, libellé qui se replie à 13 px', () => {
    const grille = dernierBloc('.bolt-mobile-agent-start-actions');

    expect(grille).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);

    const libelle = bloc(
      ".bolt-project-ide-shell .bolt-mobile-agent-start-actions button span:last-child:not([class*='i-'])",
    );

    expect(libelle).toMatch(/white-space:\s*normal/);
    expect(libelle).toMatch(/font-size:\s*13px\s*!important/);
    expect(dernierBloc('.bolt-mobile-agent-start-actions button')).toMatch(/min-height:\s*var\(--vc-touch-min, 44px\)/);
  });

  it('composeur : la place pour « Économique » vient des marges des sélecteurs, jamais des cibles de 44 px', () => {
    expect(
      bloc('.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-project-chatbox .bolt-chatbox-mode-trigger'),
    ).toMatch(/padding:\s*0 4px\s*!important/);
    expect(
      bloc('.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-project-chatbox .bolt-composer-chip'),
    ).toMatch(/padding:\s*0 4px\s*!important/);

    // Run 1481 refusé par TACTILE-001 : 40 px de large sur les trois boutons — plus jamais.
    expect(INDEX).not.toMatch(/\.bolt-chatbox-toolbar-button \{[^}]*width:\s*40px/);
  });

  it('feuille « Panneaux » (⋮) : libellés entiers à 12 px, plus de coupe à deux lignes', () => {
    const libelle = bloc(
      ".bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-mobile-more-menu-item > span:last-child:not([class*='i-'])",
    );

    expect(libelle).toMatch(/font-size:\s*12px\s*!important/);
    expect(libelle).toMatch(/-webkit-line-clamp:\s*unset/);
    expect(libelle).toMatch(/overflow:\s*visible/);
  });
});

describe('6. ce que l’audit des 33 panneaux laissait encore tronqué', () => {
  it('état de départ : les trois étapes se replient à 11 px', () => {
    const etape = bloc(
      ".bolt-project-ide-shell\n    .bolt-responsive-ide-mobile\n    .bolt-mobile-agent-start-steps\n    span:last-child:not([class*='i-'])",
    );

    expect(etape).toMatch(/white-space:\s*normal/);
    expect(etape).toMatch(/font-size:\s*11px\s*!important/);
  });

  it('tâche de démarrage de la Webview et cartes de chiffres des paquets : repli, pas de coupe', () => {
    const regle = bloc(
      '.bolt-responsive-ide-mobile .bolt-preview-splash-task small,\n  .bolt-responsive-ide-mobile .bolt-project-package-stat-grid small',
    );

    expect(regle).toMatch(/white-space:\s*normal/);
    expect(regle).toMatch(/overflow:\s*visible/);
  });

  it('fil de l’agent : le chemin de fichier se replie au lieu d’être coupé, la cible de 44 px reste', () => {
    const chemin = bloc('.bolt-responsive-ide-mobile .bolt-action-row .bolt-action-file-path');

    expect(chemin).toMatch(/white-space:\s*normal/);
    expect(chemin).toMatch(/overflow-wrap:\s*anywhere/);

    // Le résumé « Afficher la commande » garde sa cible de 44 px, hors flux de 6 px.
    const resume = bloc('.bolt-responsive-ide-mobile .bolt-action-row-details > summary');

    expect(resume).toMatch(/margin-block:\s*-6px/);
    expect(resume).not.toMatch(/min-height/);
  });

  it('le balisage de la ligne d’action garde la forme que ces règles supposent', () => {
    const artifact = readFileSync(join(__dirname, '..', 'components', 'chat', 'Artifact.tsx'), 'utf8');

    // Le `truncate` d'origine est toujours là : c'est lui que la règle mobile renverse.
    expect(artifact).toContain('className="bolt-action-row min-w-0"');
    expect(artifact).toMatch(/className="bolt-action-file-path truncate/);
    expect(INDEX).toMatch(/\.bolt-action-target \{[^}]*min-height: 44px/);
  });
});

describe('7. captures iPhone 06/09 10:35–10:36 : Journaux du serveur, Problèmes, Ports', () => {
  it('Ports : une URL ou un chemin en monospace se replie sur téléphone', () => {
    const regle = bloc('.bolt-responsive-ide-mobile .bolt-workbench-mobile :where(.truncate.font-mono, code.truncate)');

    expect(regle).toMatch(/white-space:\s*normal/);
    expect(regle).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('les journaux du serveur de la Webview et le message d’un problème passent par la lecture humaine', () => {
    const preview = readFileSync(join(__dirname, '..', 'components', 'workbench', 'Preview.tsx'), 'utf8');

    expect(preview).toContain("import { texteRuntimeLisible } from '~/lib/ide/runtime-log-line';");
    expect(preview).toMatch(/workspaceLogs\.slice\(-120\)\.map\(\(ligne\) => texteRuntimeLisible\(String\(ligne\)\)\)/);
    expect(BASE_CHAT).toContain("<p>{ligneRuntimeLisible(String(diagnostic.message ?? '')).texte}</p>");
  });
});

describe('8. captures iPhone 06/09 11:01–11:03 : Stockage d’objets, Paramètres, Éditeur', () => {
  it('barre d’outils d’un panneau : deux boutons par rangée, 44 px, jamais cinq boutons empilés', () => {
    const bouton = bloc(
      '.bolt-responsive-ide-mobile .bolt-workbench-mobile-service .bolt-project-panel-toolbar :where(button)',
    );

    expect(bouton).toMatch(/width:\s*auto/);
    expect(bouton).toMatch(/flex:\s*1 1 calc\(50% - 4px\)/);
    expect(bouton).toMatch(/min-height:\s*var\(--vc-touch-min, 44px\)/);
    expect(
      dernierBloc('.bolt-responsive-ide-mobile .bolt-workbench-mobile-service .bolt-project-panel-toolbar'),
    ).toMatch(/flex-wrap:\s*wrap/);
  });

  it('Paramètres : un seul défilement (liste des raccourcis sans hauteur maximale), bande d’onglets compacte', () => {
    const liste = bloc('.bolt-responsive-ide-mobile .bolt-project-settings-keybindings');

    expect(liste).toMatch(/max-height:\s*none/);
    expect(liste).toMatch(/overflow:\s*visible/);

    expect(dernierBloc('.bolt-responsive-ide-mobile .bolt-project-settings-sidebar')).toMatch(/top:\s*-16px/);
    expect(dernierBloc('.bolt-responsive-ide-mobile .bolt-project-settings-sidebar button small')).toMatch(
      /display:\s*none/,
    );
    expect(dernierBloc('.bolt-responsive-ide-mobile .bolt-project-settings-sidebar button')).toMatch(
      /min-height:\s*var\(--vc-touch-min, 44px\)/,
    );
  });

  it('Éditeur : la pastille « Historique » est fixée au-dessus du socle, fenêtre visuelle comprise', () => {
    const pastille = bloc(".bolt-responsive-ide-mobile [data-testid='file-history-open']");

    expect(pastille).toMatch(/position:\s*fixed/);
    expect(pastille).toMatch(/--mobile-nav-height/);
    expect(pastille).toMatch(/--vc-mobile-visual-viewport-bottom/);
  });
});

describe('9. captures iPhone 06/09 11:03–11:04 : clavier levé, carte d’action de l’agent', () => {
  it('clavier levé : le composeur se colle au clavier, le socle disparaît, la pastille suit', () => {
    expect(
      bloc(
        "html[data-vc-clavier='ouvert'] .bolt-responsive-ide-mobile[data-mobile-panel='chat'] .bolt-project-agent-composer",
      ),
    ).toMatch(/bottom:\s*0\s*!important/);
    expect(bloc("html[data-vc-clavier='ouvert'] .bolt-mobile-replit-nav")).toMatch(/display:\s*none/);
    expect(INDEX).toMatch(
      /html\[data-vc-clavier='ouvert'\] \.bolt-responsive-ide-mobile\[data-mobile-panel='chat'\] \.bolt-agent-scroll-to-bottom,[\s\S]{0,300}bottom:\s*12px/,
    );
  });

  it('l’attribut est posé par BaseChat depuis la mesure de la fenêtre visuelle, et retiré au démontage', () => {
    expect(BASE_CHAT).toContain('import { clavierProbablementOuvert, recouvrementBasDuNavigateur } from');
    expect(BASE_CHAT).toContain('if (clavierProbablementOuvert(recouvrementBas)) {');
    expect(BASE_CHAT).toContain("document.documentElement.setAttribute('data-vc-clavier', 'ouvert');");
    expect(BASE_CHAT.match(/document\.documentElement\.removeAttribute\('data-vc-clavier'\)/g)?.length).toBe(2);
  });

  it('carte d’action de l’agent : une rangée, titre 13 px, sous-titre 11 px, bouton à droite', () => {
    expect(bloc('.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-project-agent-action-card')).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\) auto/,
    );
    expect(
      bloc(
        ".bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-project-agent-action-card strong:not([class*='i-'])",
      ),
    ).toMatch(/font-size:\s*13px\s*!important/);

    const bouton = bloc('.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-project-agent-action-card button');

    expect(bouton).toMatch(/width:\s*auto/);
    expect(bouton).toMatch(/white-space:\s*nowrap/);
  });
});

describe('10. captures iPhone 06/09 12:17–12:19 : menu de message, sélection, plan, Sécurité', () => {
  it('le menu contextuel porte de vrais libellés — plus de `::after` que la règle des infobulles éteignait', () => {
    expect(INDEX).not.toMatch(/bolt-message-context-menu \.bolt-assistant-message-action::after/);
    expect(bloc('.bolt-message-action-label')).toMatch(/display:\s*none/);
    expect(bloc('.bolt-project-ide-shell .bolt-message-context-menu .bolt-message-action-label')).toMatch(
      /display:\s*inline/,
    );

    const assistant = readFileSync(join(__dirname, '..', 'components', 'chat', 'AssistantMessage.tsx'), 'utf8');
    const utilisateur = readFileSync(join(__dirname, '..', 'components', 'chat', 'UserMessage.tsx'), 'utf8');

    expect(assistant.match(/className="bolt-message-action-label"/g)?.length).toBe(5);
    expect(utilisateur.match(/className="bolt-message-action-label"/g)?.length).toBe(1);
  });

  it('au doigt, la bulle de message n’est plus sélectionnable — le code, si', () => {
    const debut = INDEX.indexOf("@media (hover: none) {\n  [data-menu-contextuel='true'] {");

    expect(debut).toBeGreaterThan(-1);
    expect(INDEX.slice(debut, debut + 200)).toMatch(/user-select:\s*none/);
    expect(bloc("[data-menu-contextuel='true'] :where(pre, code, .bolt-assistant-message-code)")).toMatch(
      /user-select:\s*text/,
    );
  });

  it('plan de l’agent : la tâche passe sous le rôle ; lignes de panneau sur une ligne', () => {
    expect(bloc('.bolt-responsive-ide-mobile .bolt-agent-plan li')).toMatch(/flex-wrap:\s*wrap/);
    expect(bloc('.bolt-responsive-ide-mobile .bolt-agent-plan li > span:last-child')).toMatch(/flex:\s*1 1 100%/);
    expect(bloc('.bolt-responsive-ide-mobile .bolt-panel-row')).toMatch(/justify-content:\s*space-between/);
    expect(BASE_CHAT).toContain('className="bolt-panel-row-detail mt-1 text-xs text-bolt-elements-textSecondary"');
  });

  it('« télécommande » ne traduit plus « remote » : dépôt distant', () => {
    const catalogue = readFileSync(join(__dirname, '..', 'lib', 'i18n', 'catalogs', 'chat.ts'), 'utf8');

    expect(catalogue).not.toContain('télécommande');
    expect(catalogue).toContain("'Connecter un dépôt distant GitHub'");
  });
});
