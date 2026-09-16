import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DENSITY_SENSITIVE_SELECTORS,
  MOBILE_TABLET_MAX_PX,
  SINGLE_COLUMN_FLOOR_PX,
  findDensityViolations,
  isRuleSubject,
  parseRules,
  stripCssComments,
} from './ide-panel-density';

const STYLESHEET = join(process.cwd(), 'app/styles/index.scss');
const css = readFileSync(STYLESHEET, 'utf8');

describe('retrait des commentaires avant recherche', () => {
  it('ignore un selecteur qui n existe que dans la prose d un commentaire', () => {
    const decoy = `
      /* .bolt-project-metric-grid { grid-template-columns: 1fr; } */
      // .bolt-project-env-row { grid-template-columns: 1fr; }
      .something { color: red; }
    `;

    expect(stripCssComments(decoy)).not.toContain('bolt-project-metric-grid');
    expect(findDensityViolations(decoy).violations).toHaveLength(0);
  });

  it('voit toujours une vraie regle placee juste apres un commentaire', () => {
    const real = `
      /* .bolt-project-deploy-summary est mentionne ici sans etre une regle */
      .bolt-project-metric-grid { grid-template-columns: 1fr; }
    `;

    expect(findDensityViolations(real).violations.map((v) => v.selector)).toEqual(['.bolt-project-metric-grid']);
  });

  it('ne confond pas un selecteur avec un selecteur plus long qui le prefixe', () => {
    const sibling = '.bolt-project-env-row-actions { grid-template-columns: 1fr; }';

    expect(findDensityViolations(sibling).violations).toHaveLength(0);
  });
});

describe('fiabilite de la sonde', () => {
  it('se declare non fiable en dessous de 10 regles examinees', () => {
    const report = findDensityViolations('.a { color: red; }');

    expect(report.rulesExamined).toBeLessThan(10);
    expect(report.reliable).toBe(false);
  });

  it('se declare fiable sur la vraie feuille de style et y compte beaucoup de regles', () => {
    const report = findDensityViolations(css);

    expect(report.rulesExamined).toBeGreaterThan(500);
    expect(report.reliable).toBe(true);
  });
});

describe('densite des panneaux IDE', () => {
  it('n ecrase aucune grille sensible sur une colonne unique en largeur utile', () => {
    const report = findDensityViolations(css);

    expect(report.reliable).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('garde l empilement mobile/tablette, ou il est voulu', () => {
    const stripped = stripCssComments(css);

    /*
     * La tablette 768 se traite comme le mobile 390 : l'enveloppe mobile doit
     * continuer d'empiler ces grilles.
     */
    expect(stripped).toContain('.bolt-responsive-ide-mobile');

    const mobileRules = parseRules(stripped).filter((rule) =>
      [...rule.atRules, rule.selector].join(' ').includes('.bolt-responsive-ide-mobile'),
    );

    expect(mobileRules.length).toBeGreaterThanOrEqual(10);
  });

  it('exprime les cibles tactiles en pixels, jamais en rem', () => {
    /*
     * La base rem vaut 12px en desktop et 14px en <=1024px : toute cible
     * tactile exprimee en rem serait deformee.
     */
    const stripped = stripCssComments(css);
    const remTargets = [...stripped.matchAll(/min-(?:height|width):\s*([\d.]+)rem/g)];

    expect(remTargets.map((match) => match[0])).toEqual([]);
  });
});

describe('contre-epreuves', () => {
  it('tombe si le correctif est retire (retour a la colonne unique a 760px)', () => {
    /*
     * Mesure en DELTA par rapport a la feuille reelle : la contre-epreuve
     * prouve que le retrait du correctif ajoute bien ces violations, sans
     * dependre du fait que la feuille en soit par ailleurs exempte.
     */
    const before = findDensityViolations(css);

    const reverted = `
      @container (max-width: 760px) {
        .bolt-project-service-panel :where(.bolt-project-metric-grid, .bolt-project-integrations-grid) {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }
      ${css}
    `;

    const after = findDensityViolations(reverted);

    expect(after.reliable).toBe(true);
    expect(after.violations.length).toBe(before.violations.length + 2);
    expect(after.violations.map((v) => v.selector)).toContain('.bolt-project-metric-grid');
    expect(after.violations.map((v) => v.selector)).toContain('.bolt-project-integrations-grid');
  });

  it('n accuse pas un DESCENDANT d une grille sensible', () => {
    // `… article footer` cible le pied d'une carte, pas la grille.
    const descendant = `
      @container (max-width: 700px) {
        .bolt-project-integrations-grid article footer { grid-template-columns: minmax(0, 1fr) !important; }
      }
    `;

    expect(isRuleSubject('.bolt-project-integrations-grid article footer', '.bolt-project-integrations-grid')).toBe(
      false,
    );
    expect(findDensityViolations(descendant).violations).toEqual([]);
  });

  it('laisse passer l empilement voulu en tablette et mobile (@media <= 1024px)', () => {
    expect(MOBILE_TABLET_MAX_PX).toBe(1024);

    const tablet = `
      @media (max-width: 960px) {
        .bolt-project-package-stat-grid { grid-template-columns: 1fr; }
      }
    `;

    expect(findDensityViolations(tablet).violations).toEqual([]);
  });

  it('mais signale toujours un empilement impose au-dela de la tablette', () => {
    const desktop = `
      @media (max-width: 1440px) {
        .bolt-project-package-stat-grid { grid-template-columns: 1fr; }
      }
    `;

    expect(findDensityViolations(desktop).violations.map((v) => v.selector)).toEqual([
      '.bolt-project-package-stat-grid',
    ]);
  });

  it('tombe aussi si le seuil de repli est remonte au-dessus du panneau lateral', () => {
    /*
     * Le panneau lateral de l'IDE mesure ~735px : un repli declare a 760px
     * s'applique donc sur un ecran de 1440. Le plancher de la sonde doit
     * rester en dessous, sinon elle devient aveugle a ce cas precis.
     */
    expect(SINGLE_COLUMN_FLOOR_PX).toBeLessThan(735);

    const tooHigh = `
      @container (max-width: 735px) {
        .bolt-project-env-row { grid-template-columns: 1fr !important; }
      }
    `;

    expect(findDensityViolations(tooHigh).violations.map((v) => v.selector)).toEqual(['.bolt-project-env-row']);
  });

  it('tombe si l exemption est elargie au-dela de l enveloppe mobile', () => {
    /*
     * Une exemption qui couvrirait tout `.bolt-project-service-panel` rendrait
     * la sonde muette sur exactement le defaut qu'elle doit attraper.
     */
    const desktopScoped = `
      @container (max-width: 700px) {
        .bolt-project-service-panel .bolt-project-metric-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }
    `;

    expect(findDensityViolations(desktopScoped).violations.map((v) => v.selector)).toEqual([
      '.bolt-project-metric-grid',
    ]);
  });

  it('reste silencieuse quand le repli est legitime (panneau reellement etroit)', () => {
    const legitimate = `
      @container (max-width: 340px) {
        .bolt-project-metric-grid { grid-template-columns: minmax(0, 1fr) !important; }
      }
    `;

    expect(findDensityViolations(legitimate).violations).toEqual([]);
  });

  it('couvre les panneaux nommes par le proprietaire du produit', () => {
    expect(DENSITY_SENSITIVE_SELECTORS).toContain('.bolt-project-integrations-grid');
    expect(DENSITY_SENSITIVE_SELECTORS).toContain('.bolt-project-metric-grid');
    expect(DENSITY_SENSITIVE_SELECTORS).toContain('.bolt-project-deploy-summary');
    expect(DENSITY_SENSITIVE_SELECTORS).toContain('.bolt-project-env-row');
  });
});
