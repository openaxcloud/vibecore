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
