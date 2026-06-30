import { describe, expect, it } from 'vitest';
import { parseAgentPlan } from './create-agent-plan';

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
