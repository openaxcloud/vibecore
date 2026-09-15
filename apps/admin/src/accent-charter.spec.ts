import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CHARTE-IDE-001 — la console d'administration ne peut plus diverger seule.
 *
 * `apps/admin` est une application Vite distincte avec sa PROPRE feuille de
 * style. Elle redéclarait `--vc-ide-accent-action` — une seconde source de
 * vérité pour un jeton qui n'en admet qu'une. Quand le produit est passé à
 * l'orange de marque, l'admin est restée bleue : c'était la dernière surface
 * bleue, et seul un test E2E l'a rattrapé.
 *
 * Ce test compare les deux fichiers DIRECTEMENT. Il ne réclame pas que l'admin
 * cesse de déclarer le jeton — elle en a besoin, elle ne charge pas
 * `index.scss` — mais que sa valeur soit CELLE de la charte.
 */

const ROOT = join(__dirname, '..', '..', '..');
const ADMIN = readFileSync(join(__dirname, 'styles.css'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'app/styles/index.scss'), 'utf8');

/**
 * Valeurs littérales déclarées pour un jeton, hors commentaires et hors renvois
 * `var(...)`. Les commentaires sont retirés d'abord : la charte CITE l'ancien
 * bleu dans son explication, et le lire comme une déclaration inverserait le
 * verdict du test.
 */
function literalValues(token: string, source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const re = new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'g');
  const found: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    found.push(m[1].toLowerCase());
  }

  return found;
}

describe('CHARTE-IDE-001 — la console d’administration suit la charte', () => {
  it('déclare l’accent d’action, puisqu’elle ne charge pas index.scss', () => {
    expect(literalValues('--vc-ide-accent-action', ADMIN)).not.toHaveLength(0);
  });

  it('emploie une valeur que la charte déclare elle aussi', () => {
    // Dans `index.scss`, `--vc-ide-accent-action` DÉRIVE de `--vc-action-primary`
    // (c'est tout l'objet de la source unique) : ce sont les littéraux de ce
    // dernier qui font foi.
    const charte = new Set(literalValues('--vc-action-primary', INDEX));
    const admin = literalValues('--vc-ide-accent-action', ADMIN);

    expect(charte.size).toBeGreaterThan(0);

    for (const value of admin) {
      expect([...charte]).toContain(value);
    }
  });

  it('n’a plus une seule valeur bleue dans la famille d’action', () => {
    const blueDominant = (hex: string) => {
      const h = hex.replace('#', '');
      return parseInt(h.slice(4, 6), 16) > parseInt(h.slice(0, 2), 16);
    };

    for (const token of ['--vc-ide-accent-action', '--accent', '--accent-strong']) {
      for (const value of literalValues(token, ADMIN)) {
        expect({ token, value, bleu: blueDominant(value) }).toMatchObject({ bleu: false });
      }
    }
  });

  it('pose une couleur de libellé lisible sur l’aplat d’accent', () => {
    // Le blanc échouait sur les DEUX teintes : 3,00:1 sur le bleu, 2,80:1 sur
    // l'orange. Le libellé doit venir du jeton dédié, pas d'un `#ffffff` en dur.
    expect(ADMIN).toMatch(/--vc-ide-text-on-accent\s*:/);

    const filled = ADMIN.slice(ADMIN.indexOf(".nav button[aria-current='page']"));
    const rule = filled.slice(0, filled.indexOf('}'));

    expect(rule).toContain('background: var(--accent)');
    expect(rule).toContain('color: var(--vc-ide-text-on-accent)');
    expect(rule).not.toMatch(/color:\s*#fff/i);
  });
});
