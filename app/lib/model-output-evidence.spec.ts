import { describe, expect, it } from 'vitest';
import { latestModelOutput, latestTurnModelOutput } from './model-output-evidence';
import { projectAgentStopLabel } from './project-agent-layout';

const receipt = { type: 'modelOutput', provider: 'Synthetic', model: 'first', evidence: 'text-delta' };
describe('model output evidence (synthetic annotations)', () => {
  it('ignores selections, malformed and other-message receipts; takes the last relevant continuation', () => {
    expect(
      latestModelOutput([
        { type: 'basculeFournisseur' },
        { ...receipt, evidence: 'selection' },
        { ...receipt, model: '' },
      ]),
    ).toBeUndefined();
    expect(
      latestModelOutput(
        [
          receipt,
          { ...receipt, model: 'continuation', messageId: 'm' },
          { ...receipt, model: 'other', messageId: 'x' },
        ],
        'm',
      )?.model,
    ).toBe('continuation');
  });
  it('never reuses output from a previous turn after a new user prompt', () => {
    const previous = { role: 'assistant', id: 'old', annotations: [receipt] };
    expect(latestTurnModelOutput([previous, { role: 'user' }, { role: 'assistant', id: 'new' }])).toBeUndefined();
    expect(
      latestTurnModelOutput([previous, { role: 'user' }, { role: 'assistant', id: 'new', annotations: [receipt] }])
        ?.model,
    ).toBe('first');
  });
});

it.each(['fr', 'en'])('names Stop only from a received text receipt, otherwise neutral (%s)', (language) => {
  const selection = [
    {
      role: 'assistant',
      id: 'm',
      annotations: [{ type: 'basculeFournisseur', vers: { provider: 'Anthropic', model: 'claude' } }],
    },
  ];

  const neutral = latestTurnModelOutput(selection);
  expect(projectAgentStopLabel(neutral?.provider, neutral?.model, language)).toBe(
    language === 'fr' ? 'Arrêter l’agent' : 'Stop agent',
  );

  const observed = latestTurnModelOutput([
    {
      role: 'assistant',
      id: 'm',
      annotations: [{ ...receipt, provider: 'Anthropic', model: 'claude', messageId: 'm' }],
    },
  ]);
  expect(projectAgentStopLabel(observed?.provider, observed?.model, language)).toBe(
    language === 'fr' ? 'Arrêter Claude' : 'Stop Claude',
  );
});
