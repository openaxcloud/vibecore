import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * Structural wiring guard: the route/model behavioral harnesses cover execution;
 * this test also requires all three orchestration entry points to use the enriched
 * message binding, regardless of preceding options or nested object size.
 */
const chat = readFileSync(join(__dirname, 'api.chat.ts'), 'utf8');
const streamText = readFileSync(join(__dirname, '..', 'lib', '.server', 'llm', 'stream-text.ts'), 'utf8');

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const AGENT_CALLS = ['createAgentPlan', 'executeAgentOrchestrationStream', 'executeAgentOrchestration'] as const;

const parseChat = (source: string) =>
  ts.createSourceFile('api.chat.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function namedCalls(source: ts.SourceFile, name: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
      calls.push(node);
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  return calls;
}

function assertEnrichedAgentMessages(text: string) {
  const source = parseChat(text);

  for (const name of AGENT_CALLS) {
    const calls = namedCalls(source, name);
    expect(calls, name).toHaveLength(1);

    const argument = calls[0].arguments[0];
    expect(argument && ts.isObjectLiteralExpression(argument), name).toBe(true);

    if (!argument || !ts.isObjectLiteralExpression(argument)) {
      throw new Error('Expected object argument');
    }

    const messages = argument.properties.filter(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        property.name.text === 'messages',
    );
    expect(messages, name).toHaveLength(1);

    const property = messages[0];
    expect(ts.isPropertyAssignment(property), name).toBe(true);

    if (!ts.isPropertyAssignment(property)) {
      throw new Error('Expected messages property');
    }

    expect(ts.isIdentifier(property.initializer), name).toBe(true);
    expect(property.initializer.getText(source), name).toBe('messagesForAgents');
  }
}

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
    expect(chat).toMatch(/const webReferenceRedis = explicitRun\s*\? null\s*: await getWebReferenceRateLimitRedis\(/u);
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
      /const \{ messagesForAgents, webReferenceContext, webReferenceContextForContinuation \} = explicitRun[\s\S]*?: await prepareWebReferenceForChat\(\{/u,
    );
    expect(chat).toContain('rateLimitKey: projectId,');
    expect(chat).toContain('nextProgressOrder: () => progressCounter++,');
  });

  it('le planificateur ET les deux exécuteurs de lanes reçoivent messagesForAgents (jamais processedMessages)', () => {
    assertEnrichedAgentMessages(chat);
  });

  it.each(AGENT_CALLS)('rejects a wrong message binding in %s', (name) => {
    const source = parseChat(chat);
    const call = namedCalls(source, name)[0];
    const argument = call.arguments[0];
    expect(ts.isObjectLiteralExpression(argument)).toBe(true);

    if (!ts.isObjectLiteralExpression(argument)) {
      throw new Error('Expected object argument');
    }

    const property = argument.properties.find(
      (entry) => ts.isPropertyAssignment(entry) && entry.name.getText(source) === 'messages',
    );
    expect(property && ts.isPropertyAssignment(property)).toBe(true);

    if (!property || !ts.isPropertyAssignment(property)) {
      throw new Error('Expected messages property');
    }

    const mutated =
      chat.slice(0, property.initializer.getStart(source)) + 'processedMessages' + chat.slice(property.initializer.end);
    expect(() => assertEnrichedAgentMessages(mutated)).toThrow();
  });

  it.each(AGENT_CALLS)('rejects a missing messages property or removed call in %s', (name) => {
    const source = parseChat(chat);
    const call = namedCalls(source, name)[0];
    const argument = call.arguments[0];

    // A nested lookalike must not satisfy the direct first-argument contract.
    const withoutMessages =
      chat.slice(0, argument.getStart(source)) +
      '{ nested: { messages: messagesForAgents } }' +
      chat.slice(argument.end);
    expect(() => assertEnrichedAgentMessages(withoutMessages)).toThrow();

    const withoutCall = chat.slice(0, call.getStart(source)) + 'undefined' + chat.slice(call.end);
    expect(() => assertEnrichedAgentMessages(withoutCall)).toThrow();
    expect(() => assertEnrichedAgentMessages(chat + `\n${name}({ messages: messagesForAgents });`)).toThrow();
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

    const start = chat.indexOf('tools: explicitRun');
    expect(start).toBeGreaterThan(0);

    const tools = chat.slice(start, start + 900);
    expect(tools).toMatch(/tools: explicitRun\s*\? \{\}/u);

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
