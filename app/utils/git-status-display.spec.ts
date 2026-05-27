import { describe, expect, it } from 'vitest';
import { describeGitFileStatus, getGitStatusLegendItems } from './git-status-display';

describe('git status display helpers', () => {
  it('renders Git porcelain untracked status as a readable U badge', () => {
    expect(describeGitFileStatus('??')).toMatchObject({
      key: 'untracked',
      rawCode: '??',
      displayCode: 'U',
      label: 'Untracked',
    });
  });

  it('keeps common status letters readable for non-expert users', () => {
    expect(describeGitFileStatus('M').displayCode).toBe('M');
    expect(describeGitFileStatus('A').displayCode).toBe('A');
    expect(describeGitFileStatus('D').displayCode).toBe('D');
    expect(describeGitFileStatus('R').displayCode).toBe('R');
  });

  it('exposes a short legend that includes untracked, modified and added files', () => {
    expect(getGitStatusLegendItems().map((item) => `${item.displayCode}:${item.label}`)).toEqual(
      expect.arrayContaining(['U:Untracked', 'M:Modified', 'A:Added']),
    );
  });
});
