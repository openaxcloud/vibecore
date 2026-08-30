import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  baseChatAstEn,
  baseChatAstFr,
  formatBaseChatAstCopy,
  formatBaseChatAstDate,
  formatBaseChatAstNumber,
  formatBaseChatAstPlural,
  formatBaseChatAstRelativeTime,
  getBaseChatAstCopy,
} from './base-chat-ast';

const baseChatSourceUrl = new URL('../../../components/chat/BaseChat.tsx', import.meta.url);

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

describe('BaseChat strengthened-AST catalog', () => {
  it('keeps complete typed EN/FR resources with matching interpolation tokens', () => {
    expect(Object.keys(baseChatAstFr)).toEqual(Object.keys(baseChatAstEn));

    for (const key of Object.keys(baseChatAstEn) as Array<keyof typeof baseChatAstEn>) {
      expect(baseChatAstEn[key].trim().length, key).toBeGreaterThan(0);
      expect(baseChatAstFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(baseChatAstFr[key]), key).toEqual(interpolationTokens(baseChatAstEn[key]));
    }
  });

  it('falls back to English and preserves technical identifiers in translated messages', () => {
    expect(getBaseChatAstCopy('de-DE')).toBe(baseChatAstEn);
    expect(getBaseChatAstCopy('fr-CA')).toBe(baseChatAstFr);
    expect(baseChatAstFr['baseChatAst.snapshot.failedHttp']).toContain('HTTP {status}');
    expect(baseChatAstFr['baseChatAst.logs.auditCollapsed_other']).toContain('ide_state.save');
    expect(baseChatAstFr['baseChatAst.secrets.noEntries']).toContain('KEY=value');
    expect(baseChatAstFr['baseChatAst.secrets.importComplete_other']).toContain('.env');
    expect(baseChatAstFr['baseChatAst.git.completed']).toContain('Git');
  });

  it('applies the normative French glossary to visible BaseChat terminology', () => {
    expect(baseChatAstFr['baseChatAst.status.preview']).toBe('Aperçu');
    expect(baseChatAstFr['baseChatAst.common.logs']).toBe('Journaux');
    expect(baseChatAstFr['baseChatAst.common.packages']).toBe('Paquets');
    expect(baseChatAstFr['baseChatAst.common.snapshots']).toBe('Instantanés');
    expect(baseChatAstFr['baseChatAst.common.marketplace']).toBe('Place de marché');
    expect(baseChatAstFr['baseChatAst.env.shortPreview']).toBe('Aperçu');
    expect(Object.values(baseChatAstFr).join('\n')).not.toMatch(
      /\b(?:Preview|Logs?|Packages?|Snapshots?|Marketplace|Runtime|Monitoring|Workflows?)\b/u,
    );
  });

  it('formats French interpolation, numbers and plurals without changing paths or keys', () => {
    expect(
      formatBaseChatAstCopy(baseChatAstFr['baseChatAst.files.entryExists'], {
        path: '/workspace/src/API_URL.ts',
      }),
    ).toBe('Un fichier ou dossier existe déjà au chemin « /workspace/src/API_URL.ts ».');
    expect(
      formatBaseChatAstPlural('fr', 1200, {
        one: baseChatAstFr['baseChatAst.files.projectCount_one'],
        other: baseChatAstFr['baseChatAst.files.projectCount_other'],
      }),
    ).toBe('1 200 fichiers dans le projet');
    expect(
      formatBaseChatAstCopy(baseChatAstFr['baseChatAst.storage.uploadFailedHttp'], {
        file: 'Customer API English.png',
        status: 413,
      }),
    ).toBe('Échec de l’envoi de Customer API English.png (HTTP 413).');
  });

  it('formats BaseChat numbers, dates and relative times from the active language', () => {
    expect(formatBaseChatAstNumber('en-US', 1234.5)).toBe('1,234.5');
    expect(formatBaseChatAstNumber('fr-FR', 1234.5)).toBe('1 234,5');
    expect(
      formatBaseChatAstDate('fr-FR', '2026-08-05T12:00:00.000Z', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    ).toBe('5 août 2026');
    expect(formatBaseChatAstRelativeTime('fr-FR', '2026-08-05T11:00:00.000Z', Date.parse('2026-08-05T12:00:00Z'))).toBe(
      'il y a 1 heure',
    );
  });

  it('defines every BaseChat key, including complete i18next plural families', () => {
    const source = readFileSync(baseChatSourceUrl, 'utf8');

    const referencedKeys = new Set(
      [...source.matchAll(/['"](baseChatAst\.[A-Za-z0-9_.]+)['"]/gu)].map((match) => match[1]),
    );

    for (const key of referencedKeys) {
      const direct = Object.hasOwn(baseChatAstEn, key);
      const plural = Object.hasOwn(baseChatAstEn, `${key}_one`) && Object.hasOwn(baseChatAstEn, `${key}_other`);

      expect(direct || plural, key).toBe(true);
    }
  });

  it('leaves no scanner finding outside the owner-frozen mobile Terminal block', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const source = readFileSync(baseChatSourceUrl, 'utf8');
    const frozenStartOffset = source.indexOf('    const mobileHeaderTab =');
    const frozenEndOffset = source.indexOf('        {projectIdeMode && (', frozenStartOffset);

    expect(frozenStartOffset).toBeGreaterThan(-1);
    expect(frozenEndOffset).toBeGreaterThan(frozenStartOffset);

    const frozenStartLine = lineAt(source, frozenStartOffset);
    const frozenEndLine = lineAt(source, frozenEndOffset);
    const frozenHash = createHash('sha256').update(source.slice(frozenStartOffset, frozenEndOffset)).digest('hex');
    const result = scanSource(source, 'app/components/chat/BaseChat.tsx');

    const outsideFrozen = result.findings.filter(
      (finding) => finding.line < frozenStartLine || finding.line >= frozenEndLine,
    );
    const insideFrozen = result.findings.filter(
      (finding) => finding.line >= frozenStartLine && finding.line < frozenEndLine,
    );

    expect(result.parseErrors).toEqual([]);

    /*
     * Empreinte du bloc GELÉ. Re-scellée à chaque évolution VÉRIFIÉE, jamais à
     * l'aveugle : la procédure est de comparer la tranche
     * [frozenStartOffset, frozenEndOffset) entre la branche et `origin/main`,
     * et de n'accepter que des différences qu'on sait nommer.
     *
     * Re-scellements successifs :
     *
     *   1. externalisation des libellés visibles vers le catalogue FR (3/3) ;
     *   2. RPL-IDE-001.8 — en-tête Spotlight dans la palette de commandes ;
     *   3. BUG-IDE-PANEL-RESOLUTION-001, à la demande explicite du propriétaire
     *      (« une seule source de vérité pour l'en-tête et le contenu ») :
     *      `mobileServiceHeaderTab` ne dérive plus de `activeMobileOpenTabId`
     *      — un état d'onglet monté tardivement — mais du panneau de service
     *      RÉSOLU, celui-là même que rend le contenu. C'est ce décalage qui
     *      affichait l'en-tête « Agent » au-dessus du contenu « Déploiements »,
     *      et qui envoyait `?panel=studio` sur Vue d'ensemble et
     *      `?panel=debugger` sur Git à froid.
     *
     * Vérifié pour ce re-scellement : la tranche diffère de `origin/main`
     * (f19699c3…) par 14 lignes, toutes dans ce seul hunk. `mobileHeaderTab` —
     * l'en-tête de la coque mobile gelée — n'est PAS touché : mêmes valeurs,
     * mêmes classes, même rendu.
     *
     * Toute évolution du hash hors de ces cas signale une dérive de mise en
     * page à refuser.
     */
    expect(frozenHash).toBe('aaf047770a225ef9be205c2a3f921ffaaa84d0b855e07db51762c5b9b70a99aa');

    /*
     * Re-scellé après fusion de `origin/main`. Vérifié selon la procédure
     * décrite juste au-dessus, et non à l'aveugle : la tranche
     * [frozenStartOffset, frozenEndOffset) de cette branche a été comparée à
     * celle de `origin/main` (509abbb9…). Un SEUL hunk les sépare — l'en-tête
     * Spotlight de RPL-IDE-001.8 et l'aria-label/data-mode qui le
     * conditionnent. Le markup mobile Terminal/en-tête est identique à
     * `origin/main` au caractère près.
     */
    expect(outsideFrozen).toEqual([]);

    // The mobile header/dock labels are now localized via t(); no raw English remains.
    expect(insideFrozen.map((finding) => finding.text)).toEqual([]);
    expect(source.match(/DO NOT MODIFY — mobile Terminal tab frozen/gu)).toHaveLength(2);
    expect(source).not.toMatch(/\.toLocale(?:String|DateString|TimeString)\(/u);
  });
});
