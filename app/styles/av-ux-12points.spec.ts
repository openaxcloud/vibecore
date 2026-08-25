import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * AV-UX (retours d'Avi du 25/08, captures mobile 390px) — gardes de régression
 * sur les correctifs purement CSS/TSX de la série de 12 points. Les points
 * portés par du JSX scellé (en-tête mobile gelé, hash base-chat-ast) sont
 * corrigés ici par CSS uniquement : ces tests verrouillent ces règles.
 */
const scss = readFileSync(new URL('./index.scss', import.meta.url), 'utf8');

const workbenchSource = readFileSync(new URL('../components/workbench/Workbench.client.tsx', import.meta.url), 'utf8');

describe('AV-UX point 1 — plus de rangée vide sous l’en-tête mobile', () => {
  it('la barre d’outils du workbench n’est rendue en mobile que pour l’éditeur', () => {
    expect(workbenchSource).toContain("const showWorkbenchToolbar = !useMobileWorkbench || mobilePanel === 'editor';");
  });
});

describe('AV-UX point 2 — libellé d’onglet actif complet dans l’en-tête mobile', () => {
  it('le libellé du titre échappe au 20px !important appliqué aux icônes', () => {
    expect(scss).toMatch(
      /\.bolt-mobile-ecode-header button\.bolt-mobile-ecode-header-title > span:last-child \{\s*\n\s*width: auto !important;\s*\n\s*height: auto !important;/,
    );
  });
});

describe('AV-UX point 3 — tuiles du sélecteur d’onglets toutes identiques', () => {
  it('tuiles de la grille et accès rapides : même hauteur figée (102px)', () => {
    const cardBlock = scss.match(/\.bolt-mobile-tab-switcher-card \{[\s\S]*?\n\}/)?.[0] ?? '';
    const quickBlock = scss.match(/\.bolt-mobile-tab-switcher-quick button \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(cardBlock).toContain('height: 102px;');
    expect(cardBlock).toContain('min-height: 102px;');
    expect(quickBlock).toContain('height: 102px;');
    expect(quickBlock).toContain('min-height: 102px;');
  });

  it('même boîte d’icône : 40×40, rayon 10, glyphe 20px', () => {
    const quickIcon =
      scss.match(/\.bolt-mobile-tab-switcher-quick button > span:first-child \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(quickIcon).toContain('width: 40px;');
    expect(quickIcon).toContain('height: 40px;');
    expect(quickIcon).toContain('border-radius: 10px;');
    expect(quickIcon).toContain('font-size: 20px;');
  });
});

describe('AV-UX point 4 — croix de fermeture visible en clair ET en sombre', () => {
  it('la croix utilise le token de texte primaire (pas de blanc en dur)', () => {
    const closeBlock =
      scss.match(/\.bolt-mobile-tab-switcher-card \.bolt-mobile-tab-switcher-close \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(closeBlock).toContain('color: var(--vc-ide-text-primary);');
    expect(closeBlock).not.toMatch(/#fff|white/i);
  });

  it('la pastille de la croix est opaque et bordée (détachée de la tuile)', () => {
    const chipBlock = scss.match(/\.bolt-mobile-tab-switcher-close > span \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(chipBlock).toContain('background: var(--vc-ide-bg-app);');
    expect(chipBlock).toContain('border: 1px solid var(--mobile-nav-border);');
  });
});

describe('AV-UX point 8 — menu « ⋯ » du composeur ancré au viewport en mobile', () => {
  it('le conteneur de la barre d’outils perd son containment (piège du position:fixed)', () => {
    expect(scss).toMatch(/\.bolt-responsive-ide-mobile \.bolt-chatbox-toolbar \{\s*\n\s*container-type: normal;/);
  });

  it('les feuilles mobiles (outils, mode, puissance) sont opaques', () => {
    for (const selector of [
      '.bolt-responsive-ide-mobile .bolt-chatbox-tools-menu {',
      '.bolt-responsive-ide-mobile .bolt-chatbox-mode-menu {',
      '.bolt-responsive-ide-mobile .bolt-agent-power-popover {',
    ]) {
      const start = scss.indexOf(selector);
      expect(start, selector).toBeGreaterThan(-1);

      const block = scss.slice(start, scss.indexOf('\n  }', start));
      expect(block, selector).toContain('background: var(--vc-ide-bg-panel);');
      expect(block, selector).not.toContain('--mobile-nav-bg-elevated');
    }
  });
});

describe('AV-UX point 9 — barre de contexte agent (« Prompt ») retirée en mobile', () => {
  it('la barre est masquée et sa réserve de 52px rendue au transcript', () => {
    expect(scss).toMatch(
      /\.bolt-responsive-ide-mobile \.bolt-mobile-agent-context-bar \{\s*\n\s*display: none !important;/,
    );
    expect(scss).toMatch(
      /\.bolt-responsive-ide-mobile\[data-mobile-agent-context='true'\] \{\s*\n\s*--vc-mobile-agent-context-height: 0px;/,
    );
  });

  it('le bouton Planifier (fonction réelle : plan-first) garde des règles vivantes', () => {
    /*
     * Les anciens sélecteurs .bolt-chatbox-plan-button ne matchaient rien
     * (aucun sélecteur restant — seule une mention en commentaire est tolérée).
     */
    expect(scss).not.toMatch(/\.bolt-chatbox-plan-button\s*[,{]/);
    expect(scss).toContain('.bolt-responsive-ide-mobile .bolt-chatbox-plan-toggle');
  });
});
