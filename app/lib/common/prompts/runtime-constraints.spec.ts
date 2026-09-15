import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discussPrompt } from './discuss-prompt';
import { getFineTunedPrompt } from './new-prompt';
import optimized from './optimized';
import { getSystemPrompt } from './prompts';
import {
  normalizePromptRuntimeMode,
  REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS,
  resolvePromptRuntimeMode,
  WEB_REFERENCE_INSTRUCTIONS,
  WEB_REFERENCE_INSTRUCTIONS_DISCUSS,
} from './runtime-constraints';
import { PromptLibrary } from '~/lib/common/prompt-library';

/*
 * BUG-AGENT-WEBCLONE-001 — the prompt told the model it runs « in-browser,
 * no cloud VM » while production actions execute in a Linux pod with curl and
 * outbound HTTPS. Asked to clone a site, it answered « aucun accès réseau
 * sortant ». These tests pin: (1) the remote runtime is described truthfully in
 * EVERY prompt variant, (2) the WebContainer wording is untouched when no mode
 * is given (byte-identical default, prompt-include-flags.spec.ts's contract),
 * (3) the <web_reference> rules are present in every build prompt.
 */

const cwd = '/home/project';
const sb = { isConnected: false, hasSelectedProject: false } as const;
const libraryOptions = { cwd, allowedHtmlElements: [], modificationTagName: 'mods', supabase: sb } as const;

const BROWSER_CLAIM = /in-browser Node\.js runtime/iu;

describe('normalizePromptRuntimeMode / resolvePromptRuntimeMode', () => {
  const saved = { RUNTIME_MODE: process.env.RUNTIME_MODE, VITE_RUNTIME_MODE: process.env.VITE_RUNTIME_MODE };

  afterEach(() => {
    process.env.RUNTIME_MODE = saved.RUNTIME_MODE;
    process.env.VITE_RUNTIME_MODE = saved.VITE_RUNTIME_MODE;

    if (saved.RUNTIME_MODE === undefined) {
      delete process.env.RUNTIME_MODE;
    }

    if (saved.VITE_RUNTIME_MODE === undefined) {
      delete process.env.VITE_RUNTIME_MODE;
    }

    vi.unstubAllEnvs();
  });

  it('defaults to webcontainer for anything but the exact remote value', () => {
    expect(normalizePromptRuntimeMode(undefined)).toBe('webcontainer');
    expect(normalizePromptRuntimeMode('')).toBe('webcontainer');
    expect(normalizePromptRuntimeMode('remote')).toBe('webcontainer');
    expect(normalizePromptRuntimeMode('remote-kubernetes')).toBe('remote-kubernetes');
  });

  it('reads the request env first, then process.env (RUNTIME_MODE over VITE_RUNTIME_MODE); blank = unset', () => {
    vi.stubEnv('VITE_RUNTIME_MODE', '');
    vi.stubEnv('RUNTIME_MODE', '');

    expect(resolvePromptRuntimeMode(undefined)).toBe('webcontainer');
    expect(resolvePromptRuntimeMode({ RUNTIME_MODE: '   ' })).toBe('webcontainer');

    expect(resolvePromptRuntimeMode({ RUNTIME_MODE: 'remote-kubernetes' })).toBe('remote-kubernetes');
    expect(resolvePromptRuntimeMode({ VITE_RUNTIME_MODE: 'remote-kubernetes' })).toBe('remote-kubernetes');
    expect(resolvePromptRuntimeMode({ RUNTIME_MODE: 'webcontainer', VITE_RUNTIME_MODE: 'remote-kubernetes' })).toBe(
      'webcontainer',
    );

    process.env.VITE_RUNTIME_MODE = 'remote-kubernetes';
    expect(resolvePromptRuntimeMode(undefined)).toBe('remote-kubernetes');
    expect(resolvePromptRuntimeMode({})).toBe('remote-kubernetes');
  });
});

describe('remote-kubernetes wording', () => {
  it('states the real capabilities: bash, git, curl, outbound HTTPS — and the real limits', () => {
    expect(REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS).toMatch(/curl/u);
    expect(REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS).toMatch(/git/u);
    expect(REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS).toMatch(/HTTPS \(port 443\) to the public internet WORKS/u);
    expect(REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS).toMatch(/Plain HTTP \(port 80\)[^.]*blocked/u);
    expect(REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS).toMatch(/NOT available: Python\/pip/u);
    expect(REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS).not.toMatch(BROWSER_CLAIM);
    expect(REMOTE_KUBERNETES_SYSTEM_CONSTRAINTS).not.toMatch(/WebContainer/u);
  });

  const variants: Array<[string, (mode?: 'webcontainer' | 'remote-kubernetes') => string]> = [
    ['original getSystemPrompt', (mode) => getSystemPrompt(cwd, sb, undefined, true, true, mode)],
    ['fine-tuned getFineTunedPrompt', (mode) => getFineTunedPrompt(cwd, sb, undefined, true, true, mode)],
    ['optimized', (mode) => optimized({ ...libraryOptions, runtimeMode: mode })],
    ['discuss', (mode) => discussPrompt(mode)],
  ];

  for (const [name, build] of variants) {
    it(`${name}: remote mode drops the WebContainer claim, default keeps it byte-for-byte`, () => {
      const remote = build('remote-kubernetes');
      const webcontainer = build('webcontainer');
      const implicit = build(undefined);

      expect(remote).not.toMatch(/WebContainer/u);
      expect(remote).not.toMatch(BROWSER_CLAIM);
      expect(remote).toMatch(/curl/u);
      expect(remote).toMatch(/HTTPS \(port 443\)/u);

      expect(webcontainer).toMatch(/WebContainer/u);
      expect(implicit).toBe(webcontainer);
      expect(remote).not.toBe(webcontainer);

      // Exactly one <system_constraints> block, whatever the mode.
      expect(remote.match(/<system_constraints>/gu)).toHaveLength(1);
      expect(webcontainer.match(/<system_constraints>/gu)).toHaveLength(1);
    });
  }

  it('PromptLibrary threads runtimeMode to the default and original prompts', () => {
    for (const id of ['default', 'original', 'optimized'] as const) {
      const remote = PromptLibrary.getPropmtFromLibrary(id, { ...libraryOptions, runtimeMode: 'remote-kubernetes' });
      const plain = PromptLibrary.getPropmtFromLibrary(id, { ...libraryOptions });

      expect(remote).not.toMatch(/WebContainer/u);
      expect(plain).toMatch(/WebContainer/u);
    }
  });
});

describe('<web_reference_instructions>', () => {
  it('forbids the two observed failure modes: « no network » and inventing a site analysis', () => {
    expect(WEB_REFERENCE_INSTRUCTIONS).toMatch(/Never claim the platform could not read a site the user named/u);
    expect(WEB_REFERENCE_INSTRUCTIONS).toMatch(
      /Never describe, summarise or "analyse" a site you were not given a <web_reference> for/u,
    );
    expect(WEB_REFERENCE_INSTRUCTIONS).toMatch(/link them, never download them/u);
    expect(WEB_REFERENCE_INSTRUCTIONS).toMatch(/specialist lanes only count as observations/u);
  });

  it('the production default prompt lets observed image URLs override the Pexels rule', () => {
    const prompt = getFineTunedPrompt(cwd, sb);

    expect(prompt).toContain(
      'Unless the user or a <web_reference> supplies image URLs, E-Code ALWAYS uses stock photos',
    );
    expect(WEB_REFERENCE_INSTRUCTIONS).toContain(
      'Observed image URLs take precedence over the stock-photo (Pexels) rule',
    );
  });

  it('never tells a WebContainer deployment to deny its own constraints: the rule is about the platform fetch, not the runtime', () => {
    expect(WEB_REFERENCE_INSTRUCTIONS).not.toMatch(/run without network access/u);
    expect(WEB_REFERENCE_INSTRUCTIONS).toContain('Never claim the platform could not read a site the user named');
  });

  it('is present once in every BUILD prompt, in both runtimes; the discuss prompt carries its own flavour', () => {
    const builds = [
      getSystemPrompt(cwd, sb, undefined, true, true),
      getSystemPrompt(cwd, sb, undefined, true, true, 'remote-kubernetes'),
      getFineTunedPrompt(cwd, sb),
      getFineTunedPrompt(cwd, sb, undefined, false, false, 'remote-kubernetes'),
      optimized({ ...libraryOptions }),
      optimized({ ...libraryOptions, runtimeMode: 'remote-kubernetes' }),
    ];

    for (const prompt of builds) {
      expect(prompt.match(/<web_reference_instructions>/gu)).toHaveLength(1);
      expect(prompt).toContain(WEB_REFERENCE_INSTRUCTIONS);
    }

    for (const discuss of [discussPrompt(), discussPrompt('remote-kubernetes')]) {
      expect(discuss.match(/<web_reference_instructions>/gu)).toHaveLength(1);
      expect(discuss).toContain(WEB_REFERENCE_INSTRUCTIONS_DISCUSS);
      expect(discuss).not.toContain('Rebuild the same page structure');
    }
  });
});

/*
 * BUG-AGENT-WEBCLONE-001 — l'agent se croyait dans un bac à sable navigateur
 * alors qu'il dispose d'un vrai conteneur Linux, et refusait donc des tâches
 * que le runtime réel sait faire.
 *
 * LE MÉCANISME, et c'est ce que ces cas reproduisent : `vite.config.ts` active
 * `vite-plugin-node-polyfills` avec `globals.process = true`, donc le bundle
 * SSR reçoit un SHIM de navigateur dont `env` vaut `{}`. Toute lecture
 * `process.env.X` y est aveugle. `globalThis.process`, lui, n'est pas réécrit.
 *
 * Un test qui poserait simplement `process.env.RUNTIME_MODE` passerait au vert
 * SANS le correctif — il mesurerait un monde que le pod n'a pas. C'est
 * pourquoi le shim est monté explicitement ici.
 */
describe('BUG-AGENT-WEBCLONE-001 — le mode est lu dans le VRAI environnement', () => {
  const vraiProcess = globalThis.process;

  afterEach(() => {
    Object.defineProperty(globalThis, 'process', { value: vraiProcess, configurable: true, writable: true });
  });

  /** Le pod web tel qu'il est : `process.env` aveugle, vrai environnement peuplé. */
  function monterLeShim(vraiEnv: Record<string, string | undefined>) {
    const shim = { ...vraiProcess, env: vraiEnv } as unknown as NodeJS.Process;
    Object.defineProperty(globalThis, 'process', { value: shim, configurable: true, writable: true });
  }

  it('témoin positif : sans rien, on retombe bien sur le défaut documenté', () => {
    monterLeShim({});

    expect(resolvePromptRuntimeMode({})).toBe('webcontainer');
  });

  /*
   * ⚠️ CE CAS EST LA VRAIE GARDE, ET IL EST STATIQUE — POUR UNE RAISON MESURÉE.
   *
   * Ma première version ne posait que les cas de comportement ci-dessous. Ils
   * sont restés VERTS quand j'ai retiré le correctif (17/17), donc ils ne
   * gardaient rien. La cause : sous vitest, `process` et `globalThis.process`
   * sont LE MÊME objet, et la lecture nue `processEnv?.RUNTIME_MODE` trouve
   * donc ce que le shim expose. Ce qui distingue les deux mondes n'existe que
   * dans le pod, où `vite-plugin-node-polyfills` réécrit `process` sans toucher
   * à `globalThis.process` — un environnement que ce banc ne peut pas fabriquer.
   *
   * Ce qui se vérifie ici, alors, c'est que le code CONSULTE le vrai
   * environnement. Ancré sur l'appel, jamais sur le commentaire (règle 5).
   */
  it('la résolution consulte le VRAI environnement, pas seulement `process.env`', () => {
    const source = readFileSync(join(__dirname, 'runtime-constraints.ts'), 'utf8')
      .split('\n')
      .filter((ligne) => {
        const nu = ligne.trimStart();
        return !nu.startsWith('*') && !nu.startsWith('/*') && !nu.startsWith('//');
      })
      .join('\n');

    const corps = source.slice(source.indexOf('export function resolvePromptRuntimeMode'));
    const liste = corps.slice(0, corps.indexOf('.find('));

    expect(liste, 'le corps de la résolution est introuvable — la garde ne mesure rien').toContain('candidate');
    expect(liste).toContain("readRuntimeEnv('RUNTIME_MODE')");
    expect(liste).toContain("readRuntimeEnv('VITE_RUNTIME_MODE')");

    /* Et AVANT les lectures nues, qui sont aveugles dans le pod. */
    expect(liste.indexOf("readRuntimeEnv('RUNTIME_MODE')")).toBeLessThan(liste.indexOf('processEnv?.RUNTIME_MODE'));
  });

  it('RUNTIME_MODE posé dans le vrai environnement est LU', () => {
    monterLeShim({ RUNTIME_MODE: 'remote-kubernetes' });

    expect(resolvePromptRuntimeMode({})).toBe('remote-kubernetes');
  });

  it('VITE_RUNTIME_MODE posé dans le vrai environnement est LU aussi', () => {
    /*
     * Le pod porte l'une OU l'autre selon la voie (ARG de build, configmap) :
     * n'en lire qu'une laisserait la moitié des déploiements sur le défaut.
     */
    monterLeShim({ VITE_RUNTIME_MODE: 'remote-kubernetes' });

    expect(resolvePromptRuntimeMode({})).toBe('remote-kubernetes');
  });

  it('une valeur VIDE (clé de configmap non renseignée) ne compte pas', () => {
    monterLeShim({ RUNTIME_MODE: '   ', VITE_RUNTIME_MODE: 'remote-kubernetes' });

    expect(resolvePromptRuntimeMode({})).toBe('remote-kubernetes');
  });

  it('l’argument explicite garde la priorité sur l’environnement', () => {
    monterLeShim({ RUNTIME_MODE: 'remote-kubernetes' });

    expect(resolvePromptRuntimeMode({ RUNTIME_MODE: 'webcontainer' })).toBe('webcontainer');
  });
});
