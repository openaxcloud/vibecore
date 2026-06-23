import { describe, it, expect } from 'vitest';
import {
  ECODE_BRAND,
  gitlabProjectDescription,
  gitlabInitialCommitMessage,
  gitlabUpdateCommitMessage,
} from './gitlabBrand';

describe('gitlab brand strings', () => {
  const all = [ECODE_BRAND, gitlabProjectDescription(), gitlabInitialCommitMessage(), gitlabUpdateCommitMessage()];

  it('uses the E-Code brand', () => {
    expect(ECODE_BRAND).toBe('E-Code');
    expect(gitlabProjectDescription()).toBe('Project created with E-Code');
    expect(gitlabInitialCommitMessage()).toBe('Initial commit from E-Code');
    expect(gitlabUpdateCommitMessage()).toBe('Update from E-Code');
  });

  it('never leaks the upstream codename into user-facing content', () => {
    for (const text of all) {
      expect(text.toLowerCase()).not.toContain('bolt');
    }
  });
});
