import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-AGENT-WEBCLONE-001 — câblage dans api.chat.ts et stream-text.ts.
 *
 * Ni l'une ni l'autre n'a de harnais (route de 2 100 lignes, streamText jamais
 * appelé en test). Précédent du dépôt : arborescence-cablage.spec.ts lit la
 * source et épingle le point d'appel. Mesuré par le relecteur « tests » :
 * retirer `messages: messagesForAgents` et `webReferenceContext` laissait
 * 161 tests verts — c'est exactement ce que ce spec rend rouge.
 */
const chat = readFileSync(join(__dirname, 'api.chat.ts'), 'utf8');
const streamText = readFileSync(join(__dirname, '..', 'lib', '.server', 'llm', 'stream-text.ts'), 'utf8');

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('api.chat.ts — la référence web atteint le modèle, le planificateur et les lanes', () => {
  it('le plafond est PARTAGÉ entre replicas, et UN SEUL client sert les DEUX chemins de lecture', () => {
    expect(chat).toContain(
      "import { getWebReferenceRateLimitRedis } from '~/lib/.server/web/rate-limit-redis.server';",
    );

    /*
     * Le client est résolu UNE fois et réutilisé : la référence automatique et
     * l'outil `fetch_web_page` doivent partager la même clé Redis, donc un seul
     * budget par projet. Deux résolutions séparées passeraient ce test à l'œil
     * nu tout en ouvrant deux budgets — d'où le compte exact.
     */
    expect(chat).toContain('const webReferenceRedis = await getWebReferenceRateLimitRedis(');
    expect(count(chat, 'await getWebReferenceRateLimitRedis(')).toBe(1);

    // Chemin 1 — la référence automatique.
    expect(chat).toContain('rateLimitRedis: webReferenceRedis,');
    expect(count(chat, 'rateLimitRedis:')).toBe(1);

    // Chemin 2 — l'outil appelable par le modèle.
    expect(chat).toContain('redis: webReferenceRedis,');
  });

  it('lit le site via prepareWebReferenceForChat, sur le chemin quota (projectId comme clé)', () => {
    expect(chat).toContain("import { prepareWebReferenceForChat } from '~/lib/.server/web/chat-web-reference';");
    expect(chat).toMatch(
      /const \{ messagesForAgents, webReferenceContext, webReferenceContextForContinuation \} =\s*await prepareWebReferenceForChat\(\{/u,
    );
    expect(chat).toContain('rateLimitKey: projectId,');
    expect(chat).toContain('nextProgressOrder: () => progressCounter++,');
  });

  it('le planificateur ET les deux exécuteurs de lanes reçoivent messagesForAgents (jamais processedMessages)', () => {
    const planner = chat.slice(chat.indexOf('await createAgentPlan({'), chat.indexOf('await createAgentPlan({') + 200);

    const streamExec = chat.slice(
      chat.indexOf('await executeAgentOrchestrationStream({'),
      chat.indexOf('await executeAgentOrchestrationStream({') + 400,
    );
    const aggregateExec = chat.slice(
      chat.indexOf('await executeAgentOrchestration({'),
      chat.indexOf('await executeAgentOrchestration({') + 400,
    );

    for (const call of [planner, streamExec, aggregateExec]) {
      expect(call).toContain('messages: messagesForAgents,');
      expect(call).not.toContain('messages: processedMessages,');
    }
  });

  it('la génération initiale reçoit le bloc complet, la continuation le bloc condensé', () => {
    expect(count(chat, '\n          webReferenceContext,\n')).toBe(1);
    expect(count(chat, 'webReferenceContext: webReferenceContextForContinuation,')).toBe(1);

    const continuation = chat.indexOf('webReferenceContext: webReferenceContextForContinuation,');
    const initial = chat.indexOf('\n          webReferenceContext,\n');

    // La continuation (dans la boucle de segments) précède l'appel initial dans le fichier.
    expect(continuation).toBeGreaterThan(0);
    expect(initial).toBeGreaterThan(continuation);
  });
});

describe('api.chat.ts — outil fetch_web_page (RP-WEB-03, derrière drapeau)', () => {
  it('fusionne webFetchToolSet aux outils MCP, avec projectId comme clé de limitation', () => {
    expect(chat).toContain("import { webFetchToolSet } from '~/lib/.server/web/web-fetch-tool';");

    const tools = chat.slice(chat.indexOf('tools: {'), chat.indexOf('tools: {') + 700);

    expect(tools).toContain('...mcpService.toolsWithoutExecute,');
    expect(tools).toContain('...webFetchToolSet({');
    expect(tools).toContain('rateLimitKey: projectId,');

    /*
     * Sans ce client, l'outil retombait sur le compteur EN MÉMOIRE du pod :
     * mesuré, zéro appel à Redis. Un projet disposait alors de 12 lectures
     * automatiques PLUS 12 lectures par outil, chacune multipliée par le nombre
     * de replicas.
     */
    expect(tools).toContain('redis: webReferenceRedis,');
  });
});

describe('stream-text.ts — mode runtime et bloc <web_reference>', () => {
  it('résout le runtime réel et le passe au prompt de build ET au prompt discuss', () => {
    expect(streamText).toContain('const promptRuntimeMode = resolvePromptRuntimeMode(');
    expect(streamText).toContain('runtimeMode: promptRuntimeMode,');
    expect(streamText).toContain('discussPrompt(promptRuntimeMode)');
  });

  it('porte le bloc dans le message de contexte traînant, entre le tampon de contexte et les lanes', () => {
    const contextPush = streamText.indexOf('volatileTailBlocks.push(contextBufferBlock);');
    const webPush = streamText.indexOf('volatileTailBlocks.push(webReferenceContext);');
    const orchestrationPush = streamText.indexOf('volatileTailBlocks.push(orchestrationTailBlock);');

    expect(contextPush).toBeGreaterThan(0);
    expect(webPush).toBeGreaterThan(contextPush);
    expect(orchestrationPush).toBeGreaterThan(webPush);
    expect(streamText).toContain('webReferenceContext?: string;');
  });
});
