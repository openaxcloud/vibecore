import { describe, expect, it, vi } from 'vitest';
import {
  buildAgentPlannerUsage,
  buildPlanLanguageRule,
  finalizeAgentPlannerResponse,
  parseAgentPlan,
} from './create-agent-plan';

describe('parseAgentPlan', () => {
  it('parses a clean JSON plan into tasks + a roster ordered by the role catalog', () => {
    const plan = parseAgentPlan(
      JSON.stringify({
        tasks: [
          { title: 'Build the UI', role: 'frontend' },
          { title: 'Design the schema', role: 'architect' },
        ],
      }),
    );

    expect(plan).toBeDefined();
    expect(plan!.tasks).toHaveLength(2);

    // roleIds are deduped + ordered by ECODE_AGENT_ROLES (architect before frontend).
    expect(plan!.roleIds).toEqual(['architect', 'frontend']);
  });

  it('extracts the JSON object even when wrapped in prose / code fences', () => {
    const plan = parseAgentPlan(
      'Here is the plan:\n```json\n{"tasks":[{"title":"Set up routes","role":"backend"}]}\n```\nDone.',
    );
    expect(plan?.tasks).toEqual([{ title: 'Set up routes', roleId: 'backend' }]);
    expect(plan?.roleIds).toEqual(['backend']);
  });

  it('accepts roleId as an alias for role', () => {
    const plan = parseAgentPlan('{"tasks":[{"title":"Write tests","roleId":"qa"}]}');
    expect(plan?.roleIds).toEqual(['qa']);
  });

  it('drops tasks with unknown roles and tasks missing a title', () => {
    const plan = parseAgentPlan(
      '{"tasks":[{"title":"Real","role":"frontend"},{"title":"Bad role","role":"marketing"},{"role":"backend"}]}',
    );
    expect(plan?.tasks).toEqual([{ title: 'Real', roleId: 'frontend' }]);
  });

  it('returns undefined when nothing usable can be recovered', () => {
    expect(parseAgentPlan('')).toBeUndefined();
    expect(parseAgentPlan('no json here')).toBeUndefined();
    expect(parseAgentPlan('{"tasks":[]}')).toBeUndefined();
    expect(parseAgentPlan('{"tasks":[{"title":"x","role":"nope"}]}')).toBeUndefined();
    expect(parseAgentPlan('{not valid json')).toBeUndefined();
  });
});

describe('planner usage contract', () => {
  it('preserves the actual provider/model and normalizes provider token counters', () => {
    expect(
      buildAgentPlannerUsage({
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: { promptTokens: 123.9, completionTokens: 45 },
      }),
    ).toEqual({
      callId: 'planner',
      kind: 'planner',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      inputTokens: 123,
      outputTokens: 45,
    });
  });

  it('never emits negative or non-finite token counts', () => {
    expect(
      buildAgentPlannerUsage({
        provider: 'openai',
        model: 'gpt-4.1',
        usage: { promptTokens: Number.NaN, completionTokens: -5 },
      }),
    ).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it('emits measured usage even when the paid planner response is invalid JSON', () => {
    const onUsage = vi.fn();

    const result = finalizeAgentPlannerResponse({
      text: 'not valid planner JSON',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      usage: { promptTokens: 91, completionTokens: 8 },
      roleCap: 2,
      onUsage,
    });

    expect(result).toBeUndefined();
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'planner', inputTokens: 91, outputTokens: 8 }),
    );
  });
});

/*
 * BUG-I18N-003 — le plan de l'agent s'affichait en ANGLAIS dans une interface
 * française, sur les 3 formats. À distinguer d'une traduction manquante : le
 * catalogue FR existe et sert de valeur par défaut ; ce qui s'affichait était du
 * texte PRODUIT par le modèle, et le prompt de planification ne lui imposait
 * aucune langue de sortie.
 */
describe('langue du plan', () => {
  it('impose le français quand l’interface est en français', () => {
    expect(buildPlanLanguageRule('fr')).toMatch(/task title in FRENCH/i);
  });

  it('rappelle que la langue de l’app demandée ne change pas celle du plan', () => {
    expect(buildPlanLanguageRule('fr')).toMatch(/language of the app being built does not change this/i);
  });

  it.each([['en'], [undefined], ['es']])('n’ajoute aucune consigne pour %s — comportement d’origine', (langue) => {
    expect(buildPlanLanguageRule(langue as string | undefined)).toBe('');
  });

  it('se termine par un saut de ligne pour ne pas coller à la règle suivante', () => {
    expect(buildPlanLanguageRule('fr').endsWith('\n')).toBe(true);
  });
});
