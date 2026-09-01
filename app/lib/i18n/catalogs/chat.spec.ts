import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { chatEn, chatFr } from './chat';

const interpolationTokens = (value: string) =>
  [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();

const approvedFrenchIdentity = [
  /^(?:Agent|Anthropic|BYOK|CI\/CD|DevOps|Git|GitHub OAuth|Google|Google Pub\/Sub|OpenAI|OpenRouter|QA|UTC)$/u,
  /^(?:Bucket|Description|Quorum|Type|Webhooks)(?: \(\{value0\}\))?$/u,
  /^(?:cron|dev|prod \/|rsa)$/u,
  /^(?:app\.use|auth\.\*|deploy\.|git@|https?:\/\/|npm |postgresql:\/\/|src\/|user\.|var\(--|~\/workspace)/u,
  /^(?:--port|\/bucket|\/min|@scope\/|· v)/u,
  /^(?:[A-Z][A-Z0-9_]*(?:[=,].*)?)$/u,
  /^sha256:$/u,

  /*
   * Termes d'environnement de déploiement. Ils étaient TRADUITS, et le résultat
   * était un contresens à l'écran : « Production » rendait « Fabrication » (le
   * sens industriel), « Extensions » rendait « Rallonges » (la rallonge
   * électrique) et « Staging » rendait « Mise en scène » (le théâtre). Sur le
   * panneau Variables d'environnement en 390 px, « Fabrication » apparaissait
   * cinq fois sur un seul écran, si bien qu'un utilisateur configurant une
   * variable de production ne lisait jamais le mot « production ».
   *
   * Ce sont des noms d'environnements et de surfaces produit, pas de la prose :
   * ils restent identiques en français, d'où leur présence ici plutôt qu'une
   * traduction. À ne pas confondre avec `secrets` → « Variables secrètes » ou
   * `runtime` → « Environnement d'exécution », qui sont du français correct et
   * restent traduits (le premier est d'ailleurs épinglé plus bas).
   */
  /^(?:Extensions?|Production|Staging|extensions?)$/u,
];

describe('BaseChat EN/FR catalog', () => {
  it('keeps complete key and interpolation parity without raw-key aliases', () => {
    expect(Object.keys(chatFr).sort()).toEqual(Object.keys(chatEn).sort());

    for (const key of Object.keys(chatEn) as Array<keyof typeof chatEn>) {
      expect(interpolationTokens(chatFr[key]), key).toEqual(interpolationTokens(chatEn[key]));
      expect(chatEn[key].trim().length, key).toBeGreaterThan(0);
      expect(chatFr[key].trim().length, key).toBeGreaterThan(0);
      expect(chatFr[key], key).not.toMatch(/^chat\.copy\./u);
      expect(key, key).not.toMatch(/^chat\.copy\.chatCopy/u);
    }
  });

  it('documents every intentionally identical technical value', () => {
    const identical = Object.keys(chatEn)
      .filter((key) => chatEn[key as keyof typeof chatEn] === chatFr[key as keyof typeof chatFr])
      .map((key) => chatEn[key as keyof typeof chatEn]);

    expect(identical.filter((value) => !approvedFrenchIdentity.some((pattern) => pattern.test(value)))).toEqual([]);
  });

  it('uses reviewed French terminology for core IDE actions', () => {
    expect(chatFr['chat.copy.deployProject_9e37b103']).toBe('Déployer le projet');
    expect(chatFr['chat.copy.workspace_4ca0a75c']).toBe('Espace de travail');
    expect(chatFr['chat.copy.secrets_1e3732ae']).toBe('Variables secrètes');
    expect(chatFr['chat.copy.pause_781961bc']).toBe('Suspendre');
    expect(chatFr['chat.copy.exportProject_5eff3aab']).toBe('Exporter le projet');
    expect(chatFr['chat.copy.ideStatus_15238998']).toContain('IDE');
    expect(chatFr['chat.copy.deploySuccessDeployFail_2b41724e']).toBe('deploy.success,deploy.fail');
    expect(chatFr['chat.copy.workspaceBash_f04a2ba1']).toBe('~/workspace: bash');
    expect(chatFr['chat.copy.projectAssistant_2b677b08']).toBe('Assistant de projet');
    expect(chatEn['chat.copy.projectAssistant_2b677b08']).toBe('Project assistant');
  });

  it('leaves no residual English in the strengthened AST scan', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const source = readFileSync(new URL('../../../components/chat/BaseChat.tsx', import.meta.url), 'utf8');
    const result = scanSource(source, 'app/components/chat/BaseChat.tsx');
    const residualText = result.findings.map((finding) => finding.text);

    expect(result.parseErrors).toEqual([]);

    // The mobile header/dock labels are localized via t(); the whole file is clean.
    expect(residualText).toEqual([]);
    expect(source.match(/DO NOT MODIFY — mobile Terminal tab frozen/gu)).toHaveLength(2);
  });
});
