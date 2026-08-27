import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getI18nInstance, resetI18nForTest } from '~/lib/i18n/runtime';

/*
 * BUG-QA-I18N-COUNT-003 — suite du fil rouge QA sur les compteurs.
 *
 * Le balayage du dépôt a montré que « 8fichiers » n'était pas un cas isolé mais
 * une CLASSE : douze compteurs de l'IDE étaient rendus par des expressions JSX
 * adjacentes, et cinq d'entre eux fabriquaient leur pluriel en collant un « s »
 * anglais. Les libellés ayant été extraits MOT À MOT, le rendu français était en
 * plus faux sur le fond : `extension` traduit en « rallonge » (la rallonge
 * électrique), la phrase perdue.
 *
 * Ces tests ne se contentent pas de grepper le code : ils font rendre les clés
 * par la VRAIE instance i18next, dans les deux langues, au singulier et au
 * pluriel.
 */

const CHAT_DIR = __dirname;
const baseChat = readFileSync(join(CHAT_DIR, 'BaseChat.tsx'), 'utf8');

/** Le code seul : les commentaires du correctif citent eux-mêmes les motifs interdits. */
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

describe('BUG-QA-I18N-COUNT-003 — rendu réel des compteurs, EN et FR', () => {
  beforeEach(() => resetI18nForTest());
  afterEach(() => resetI18nForTest());

  /** [clé, params, attendu EN, attendu FR] pour le singulier puis le pluriel. */
  const CASES: Array<[string, Record<string, unknown>, string, string]> = [
    /*
     * BUG-QA-I18N-COUNT-001/002 — le compteur de fichiers d'origine
     * (« 7fichiers », « 1 fichiers »). La clé plurielle porte l'espace ET le
     * pluriel ; on la verrouille sur 0, 1, 2 et 7 dans les deux langues.
     * Note : en français, Intl.PluralRules classe 0 en « one », d'où
     * « 0 fichier » (grammaire correcte) contre « 0 files » en anglais.
     */
    ['baseChatAst.files.count', { count: 0 }, '0 files', '0 fichier'],
    ['baseChatAst.files.count', { count: 1 }, '1 file', '1 fichier'],
    ['baseChatAst.files.count', { count: 2 }, '2 files', '2 fichiers'],
    ['baseChatAst.files.count', { count: 7 }, '7 files', '7 fichiers'],
    ['baseChatAst.counts.hunks', { count: 1 }, '1 hunk', '1 segment'],
    ['baseChatAst.counts.hunks', { count: 4 }, '4 hunks', '4 segments'],
    [
      'baseChatAst.counts.keybindings',
      { count: 1 },
      '1 active binding in this workspace',
      '1 raccourci actif dans cet espace de travail',
    ],
    [
      'baseChatAst.counts.keybindings',
      { count: 9 },
      '9 active bindings in this workspace',
      '9 raccourcis actifs dans cet espace de travail',
    ],
    ['baseChatAst.counts.messages', { count: 1 }, '1 message', '1 message'],
    ['baseChatAst.counts.messages', { count: 7 }, '7 messages', '7 messages'],
    ['baseChatAst.counts.extensionsShown', { count: 1 }, '1 extension shown', '1 extension affichée'],
    ['baseChatAst.counts.extensionsShown', { count: 12 }, '12 extensions shown', '12 extensions affichées'],
    ['baseChatAst.counts.tasks', { count: 1 }, '1 task', '1 tâche'],
    ['baseChatAst.counts.tasks', { count: 3 }, '3 tasks', '3 tâches'],
    ['baseChatAst.counts.secretsToImport', { count: 1 }, '1 secret to import', '1 secret à importer'],
    ['baseChatAst.counts.secretsToImport', { count: 5 }, '5 secrets to import', '5 secrets à importer'],
    ['baseChatAst.counts.linesSkipped', { count: 1 }, '1 line will be skipped', '1 ligne sera ignorée'],
    ['baseChatAst.counts.linesSkipped', { count: 6 }, '6 lines will be skipped', '6 lignes seront ignorées'],
    [
      'baseChatAst.counts.checkpointsFiltered',
      { shown: 1, count: 1 },
      '1 of 1 checkpoint',
      '1 sur 1 point de contrôle',
    ],
    [
      'baseChatAst.counts.checkpointsFiltered',
      { shown: 8, count: 12 },
      '8 of 12 checkpoints',
      '8 sur 12 points de contrôle',
    ],
    ['baseChatAst.counts.dependencies', { prod: 42, dev: 13 }, '42 prod / 13 dev', '42 prod / 13 dev'],
    ['baseChatAst.counts.eventsShown', { shown: '42', count: 120 }, '42 of 120 events', '42 sur 120 événements'],
    [
      'baseChatAst.counts.bucketsPeak',
      { count: 24, peak: '9' },
      '24 buckets · peak 9/bucket',
      '24 intervalles · pic 9/intervalle',
    ],
    ['baseChatAst.counts.occurrences', { count: 1 }, '1 occurrence', '1 occurrence détectée'],
    ['baseChatAst.counts.occurrences', { count: 7 }, '7 occurrences', '7 occurrences détectées'],
    [
      'baseChatAst.counts.problemsSummary',
      { errors: 3, warnings: 5 },
      '3 errors · 5 warnings in the current workspace',
      '3 erreurs · 5 avertissements dans l’espace de travail actuel',
    ],
    [
      'baseChatAst.counts.presenceOnline',
      { shown: '1', count: 1 },
      '1 online user with live cursor and selection sync.',
      '1 utilisateur en ligne, curseur et sélection synchronisés.',
    ],
    [
      'baseChatAst.counts.presenceOnline',
      { shown: '4', count: 4 },
      '4 online users with live cursor and selection sync.',
      '4 utilisateurs en ligne, curseurs et sélections synchronisés.',
    ],
    [
      'baseChatAst.counts.lastDeployments',
      { count: 1 },
      'Last deployment, newest on the right.',
      'Dernier déploiement, le plus récent à droite.',
    ],
    [
      'baseChatAst.counts.lastDeployments',
      { count: 6 },
      'Last 6 deployments, newest on the right.',
      'Les 6 derniers déploiements, le plus récent à droite.',
    ],
    [
      'baseChatAst.phrases.emptyYet',
      { title: 'deployments' },
      'No deployments yet',
      'Aucun deployments pour l’instant',
    ],
    ['baseChatAst.phrases.shortcutFor', { label: 'Ctrl+K' }, 'Ctrl+K shortcut', 'Raccourci Ctrl+K'],
    ['baseChatAst.phrases.runOutcome', { status: 'failed', code: 1 }, 'failed · exit 1', 'failed · code de sortie 1'],
    ['baseChatAst.phrases.authorVersion', { author: 'MCP', version: '2' }, 'MCP · v2', 'MCP · v2'],
    ['baseChatAst.phrases.deltaVsPrevious', { delta: '+12' }, '+12 vs previous', '+12 par rapport au précédent'],
  ];

  for (const [key, params, expectedEn, expectedFr] of CASES) {
    const label = Object.entries(params)
      .map(([name, value]) => `${name}=${String(value)}`)
      .join(' ');

    it(`${key} (${label}) rend correctement en anglais`, () => {
      expect(getI18nInstance().t(key, { ...params, lng: 'en' })).toBe(expectedEn);
    });

    it(`${key} (${label}) rend correctement en français`, () => {
      expect(getI18nInstance().t(key, { ...params, lng: 'fr' })).toBe(expectedFr);
    });
  }

  it('aucun rendu ne colle le nombre au libellé (le défaut d_origine)', () => {
    const instance = getI18nInstance();

    for (const [key, params] of CASES) {
      for (const lng of ['en', 'fr'] as const) {
        const rendered = instance.t(key, { ...params, lng });

        // « 8fichiers » : un chiffre immédiatement suivi d'une lettre.
        expect(rendered, `${key} / ${lng} → ${rendered}`).not.toMatch(/\d\p{L}/u);
      }
    }
  });

  it('aucune clé ne fuit à l_écran (toutes existent dans les deux catalogues)', () => {
    const instance = getI18nInstance();

    for (const [key, params] of CASES) {
      for (const lng of ['en', 'fr'] as const) {
        expect(instance.t(key, { ...params, lng })).not.toContain('baseChatAst.counts');
      }
    }
  });
});

/*
 * Un treizième site présente le même défaut mais tombe DANS le bloc mobile
 * Terminal scellé par son propriétaire (`DO NOT MODIFY — mobile Terminal tab
 * frozen`, empreinte SHA-256 vérifiée par `base-chat-ast.spec.ts`). Le corriger
 * casserait ce sceau, ce qui n'est pas ma décision : il est laissé en l'état et
 * remonté. Les gardes ci-dessous excluent donc ce bloc — nommément, pas en
 * silence — et le test suivant prouve que c'est bien la SEULE exclusion.
 */
const FROZEN_START = '    const mobileHeaderTab =';
const FROZEN_END = '        {projectIdeMode && (';

function frozenLineRange(source: string): [number, number] {
  const startOffset = source.indexOf(FROZEN_START);
  const endOffset = source.indexOf(FROZEN_END, startOffset);
  const lineAt = (offset: number) => source.slice(0, offset).split('\n').length;

  return [lineAt(startOffset), lineAt(endOffset)];
}

describe('BUG-QA-I18N-COUNT-003 — le motif ne peut plus être réintroduit', () => {
  const code = codeOnly(baseChat);
  const [frozenFrom, frozenTo] = frozenLineRange(baseChat);

  /** Vrai si la ligne (1-indexée) appartient au bloc gelé. */
  const isFrozen = (line: number) => line >= frozenFrom && line < frozenTo;

  it('le bloc gelé est bien localisé (sinon les gardes ci-dessous ne valent rien)', () => {
    expect(frozenFrom).toBeGreaterThan(0);
    expect(frozenTo).toBeGreaterThan(frozenFrom);
  });

  it('plus aucun compteur JSX adjacent à un libellé traduit', () => {
    const lines = code.split('\n');
    const offenders: string[] = [];

    for (let i = 0; i < lines.length - 1; i += 1) {
      if (isFrozen(i + 1)) {
        continue;
      }

      if (/^\s*\{[\w.]*(?:[Cc]ount|[Ll]ength)\}\s*$/.test(lines[i]) && /^\s*\{(t\(|copy\[)/.test(lines[i + 1])) {
        offenders.push(`L${i + 1}: ${lines[i].trim()} + ${lines[i + 1].trim()}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('le seul site non corrigé est celui du bloc gelé, et il est toujours là', () => {
    /*
     * Si ce test tombe, c'est que le bloc a été descellé ou déplacé : le défaut
     * doit alors être corrigé comme les douze autres, et ce test supprimé.
     */
    const lines = baseChat.split('\n');
    const remaining = lines.findIndex((line) => line.includes('chat.copy.activeBindingsInThisWorkspace_0a75087f'));

    expect(remaining).toBeGreaterThan(-1);
    expect(isFrozen(remaining + 1)).toBe(true);
  });

  it('plus aucun pluriel fabriqué en collant un « s » anglais', () => {
    expect(code).not.toMatch(/=== 1 \? '' : 's'/);
  });

  it('les traductions mot-à-mot devenues inutiles ne sont plus référencées', () => {
    /*
     * Ces clés étaient l'extraction d'UN SEUL mot d'une phrase : elles ne
     * peuvent pas être traduites juste. Deux d'entre elles avaient d'ailleurs
     * produit un contresens — `'No'` (déterminant) → « Non » (la réponse), et
     * l'acronyme `MCP` → « PCM ».
     */
    for (const orphan of [
      'chat.copy.extension_f9896101',
      'chat.copy.shown_552a9a57',
      'chat.copy.msg_19f34ee1',
      'chat.copy.hunk_487d3241',
      'chat.copy.checkpoints_abdf4ec3',
      'chat.copy.of_de04fa0e',
      'chat.copy.secret_e5e9fa1b',
      'chat.copy.toImport_f2c4337d',
      'chat.copy.line_264f39ca',
      'chat.copy.willBeSkipped_dd4df254',
      'chat.copy.task_7fbb727d',
      'chat.copy.no_816c52fd',
      'chat.copy.yet_1002ea7f',
      'chat.copy.errors_e6ef8d02',
      'chat.copy.warningsInTheCurrentWorkspace_e8b37cee',
      'chat.copy.occurrences_11e49537',
      'chat.copy.onlineUsersWithLiveCursorAnd_ea5daf10',
      'chat.copy.shortcut_4e4c03ff',
      'chat.copy.exit_c4098fbe',
      'chat.copy.last_d1c69a85',
      'chat.copy.newestOnTheRight_f96e7c59',
      'chat.copy.mcp_21593b80',
      'chat.copy.v_26c12f1e',
      'chat.copy.vsPrevious_2eb3ee87',
      'chat.copy.bucketsPeak_3010e505',
      'chat.copy.bucket_420c637b',
    ]) {
      expect(code, `${orphan} est encore utilisé`).not.toContain(orphan);
    }
  });

  /*
   * Garde GÉNÉRIQUE, et non plus une liste de cas connus : toute expression JSX
   * seule sur sa ligne, suivie d'un libellé traduit seul sur la sienne, est
   * concaténée sans séparateur par React. C'est ce motif — pas les symptômes —
   * qui doit rester interdit.
   */
  it('aucune expression JSX ne colle à un libellé traduit (hors collages voulus)', () => {
    /*
     * Trois sites collent VOLONTAIREMENT, parce que le libellé commence par le
     * suffixe de l'unité : « 12x », « 87% agreement », « 99% success ».
     */
    const DELIBERATE = new Set(['chat.copy.x_74e0fa34', 'chat.copy.agreement_fc61aa8b', 'chat.copy.success_319e54bc']);

    const lines = code.split('\n');
    const offenders: string[] = [];

    for (let i = 0; i < lines.length - 1; i += 1) {
      if (isFrozen(i + 1)) {
        continue;
      }

      const current = lines[i].trim();
      const next = lines[i + 1].trim();

      // Une expression seule sur sa ligne — mais pas un séparateur explicite {' '}.
      if (!/^\{[^{}]*\}$/.test(current) || /^\{['"`]/.test(current)) {
        continue;
      }

      if (!/^\{(t\(|copy\[)/.test(next)) {
        continue;
      }

      if ([...DELIBERATE].some((key) => next.includes(key))) {
        continue;
      }

      offenders.push(`L${i + 1}: ${current} + ${next}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

/*
 * La garde ci-dessus ne protégeait que `BaseChat.tsx` — or rien n'empêche le
 * motif de réapparaître ailleurs. Celle-ci balaie TOUT `app/`, ce qui en fait
 * réellement un garde-fou transverse et non un correctif local.
 */
describe('BUG-QA-I18N-COUNT-003 — le motif est interdit dans TOUT app/', () => {
  const APP_ROOT = join(CHAT_DIR, '..', '..');

  /** Collages voulus : le libellé commence par le suffixe de l'unité (« 12x », « 87% »). */
  const DELIBERATE = ['chat.copy.x_74e0fa34', 'chat.copy.agreement_fc61aa8b', 'chat.copy.success_319e54bc'];

  function tsxFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          tsxFiles(full, found);
        }

        continue;
      }

      if (entry.name.endsWith('.tsx') && !entry.name.includes('.spec.')) {
        found.push(full);
      }
    }

    return found;
  }

  it('aucune expression JSX collée à un libellé traduit, nulle part', () => {
    const files = tsxFiles(APP_ROOT);
    const offenders: string[] = [];

    expect(files.length, 'le balayage doit trouver des fichiers').toBeGreaterThan(100);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const isBaseChat = file.endsWith('BaseChat.tsx');
      const [from, to] = isBaseChat ? frozenLineRange(source) : [-1, -1];
      const lines = codeOnly(source).split('\n');

      for (let i = 0; i < lines.length - 1; i += 1) {
        // Le bloc mobile Terminal scellé est exclu, et lui seul (cf. note ci-dessus).
        if (isBaseChat && i + 1 >= from && i + 1 < to) {
          continue;
        }

        const current = lines[i].trim();
        const next = lines[i + 1].trim();

        if (!/^\{[^{}]*\}$/.test(current) || /^\{['"`]/.test(current)) {
          continue;
        }

        if (!/^\{(t\(|copy\[)/.test(next) || DELIBERATE.some((key) => next.includes(key))) {
          continue;
        }

        offenders.push(`${file.slice(APP_ROOT.length + 1)}:${i + 1}  ${current} + ${next}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
