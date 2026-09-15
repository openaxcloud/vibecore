import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * SCR-006 — « le clic sur le nom du projet et Cmd+K ouvrent la recherche ».
 *
 * Mesuré live le 20/08 sur prod `93ed3c70` : le BUREAU marchait déjà (la
 * palette s'ouvrait, ce n'était pas la visite guidée), mais sur les coques
 * mobile ET tablette il ne se passait RIEN — `.bolt-project-command-palette`
 * n'était pas dans le DOM, `Cmd+K` laissait le focus sur `BODY`, et le bouton
 * du nom de projet du bandeau bureau existait sans être visible (le bandeau
 * entier est masqué sous 1200 px).
 */
const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const styles = readFileSync('app/styles/index.scss', 'utf8');

describe('SCR-006 — la recherche s’ouvre aussi sur mobile et tablette', () => {
  it('n’exclut plus la coque mobile du système de raccourcis', () => {
    /*
     * `enabled: projectIdeMode && !useMobileIde` désactivait TOUS les
     * raccourcis sur mobile, `Cmd+K` compris. Une tablette avec clavier est
     * exactement le cas où l'utilisateur les attend.
     */
    const debut = source.indexOf('useKeybindings({');
    const bloc = source.slice(debut, source.indexOf('\n    });', debut));

    expect(bloc).toContain('enabled: projectIdeMode,');
    expect(bloc).not.toContain('projectIdeMode && !useMobileIde');
  });

  it('fait de la zone d’identité de l’en-tête mobile un déclencheur de recherche', () => {
    const debut = source.indexOf('className="bolt-mobile-ecode-header-title"');

    expect(debut).toBeGreaterThan(-1);

    const bloc = source.slice(debut - 200, debut + 700);

    expect(bloc).toContain('<button');
    expect(bloc).toContain("t('baseChatMobileHeader.search')");
    expect(bloc).toContain("'vibecore:open-command-palette'");
    expect(bloc).toContain('data-testid="mobile-header-title-search"');
  });

  it('rend le bouton au pixel près comme l’ancien div, en-tête gelé oblige', () => {
    /*
     * Devenu `<button>`, l'élément hérite de `.bolt-mobile-ecode-header button`
     * — `36×36 px`, couleur atténuée, et surtout `> span { width: 20px }` qui
     * écraserait le libellé. Ces règles de spécificité SUPÉRIEURE (0,2,1 contre
     * 0,1,1) restaurent les valeurs du div. Sans elles, l'en-tête gelé dérive.
     */
    const sel = '.bolt-mobile-ecode-header button.bolt-mobile-ecode-header-title';
    const bloc = styles.slice(styles.indexOf(`${sel} {`), styles.indexOf('}', styles.indexOf(`${sel} {`)));

    expect(bloc).toMatch(/display:\s*flex/u);
    expect(bloc).toMatch(/width:\s*auto/u);
    expect(bloc).toMatch(/height:\s*auto/u);
    expect(bloc).toMatch(/flex:\s*1 1 auto/u);

    // Le libellé ne doit pas être ramené à 20 px par la règle générique.
    expect(styles).toContain(`${sel} > span:last-child`);
  });

  it('laisse la palette hors de toute condition « bureau seulement »', () => {
    /*
     * La palette elle-même n'était pas en cause : elle est rendue sur
     * `commandPaletteOpen` sans garde de coque. Ce test le verrouille, pour que
     * le correctif ne soit pas défait en ajoutant une garde ici.
     */
    const debut = source.indexOf('{commandPaletteOpen && (');
    const avant = source.slice(Math.max(0, debut - 400), debut);

    expect(debut).toBeGreaterThan(-1);
    expect(avant).not.toMatch(/!useMobileIde\s*&&\s*$/u);
  });
});
