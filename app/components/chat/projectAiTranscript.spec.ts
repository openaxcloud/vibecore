import { describe, expect, it } from 'vitest';

import { projectAiMessagesToChatMessages } from './projectAiTranscript';

describe('project AI transcript normalization', () => {
  it('converts persisted project AI messages into chat messages', () => {
    expect(
      projectAiMessagesToChatMessages([
        { id: 'm1', role: 'user', content: 'Build the app' },
        { id: 'm2', role: 'assistant', content: 'Working on it.' },
      ]),
    ).toEqual([
      { id: 'm1', role: 'user', content: 'Build the app' },
      { id: 'm2', role: 'assistant', content: 'Working on it.' },
    ]);
  });

  it('drops unsupported roles and assigns stable fallback ids', () => {
    expect(
      projectAiMessagesToChatMessages([
        { role: 'user', content: 'Keep this' },
        { role: 'debug', content: 'Drop this' },
        { role: 'assistant' },
      ]),
    ).toEqual([
      { id: 'user:0', role: 'user', content: 'Keep this' },
      { id: 'assistant:2', role: 'assistant', content: '' },
    ]);
  });
});
