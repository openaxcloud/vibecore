import { describe, expect, it } from 'vitest';

import { GitCliProvider, LocalProjectStorage } from '../project-storage.js';

/*
 * AUDX-006 — the git import path reached NO SSRF check at all.
 *
 * `git clone` is given a caller-supplied URL. Two distinct abuses:
 *
 *  - `http://169.254.169.254/...` — blind SSRF against cloud metadata from an
 *    in-cluster pod. The clone fails, but the REQUEST is made.
 *  - `file:///etc` — git treats it as a local repository, so this is a
 *    local-filesystem read wearing a repository's clothes. No network involved,
 *    which is why an address-only guard would miss it: the protocol check is
 *    what catches this one.
 *
 * These assert the REFUSAL, i.e. that git is never invoked at all.
 */
describe('AUDX-006 git clone destination guard', () => {
  const git = () => new GitCliProvider(new LocalProjectStorage());

  it('refuses a clone from the cloud metadata address', async () => {
    await expect(git().importRepository({ repositoryUrl: 'http://169.254.169.254/latest/' })).rejects.toMatchObject({
      code: 'GIT_REMOTE_NOT_ALLOWED',
    });
  });

  it('refuses a clone from a loopback address', async () => {
    await expect(git().importRepository({ repositoryUrl: 'http://127.0.0.1:8080/repo.git' })).rejects.toMatchObject({
      code: 'GIT_REMOTE_NOT_ALLOWED',
    });
  });

  it('refuses a clone from an RFC1918 address', async () => {
    await expect(git().importRepository({ repositoryUrl: 'http://10.1.2.3/repo.git' })).rejects.toMatchObject({
      code: 'GIT_REMOTE_NOT_ALLOWED',
    });
  });

  /* The protocol check, not the address check, is what stops this one. */
  it('refuses a file:// clone (a local read dressed as a repository)', async () => {
    await expect(git().importRepository({ repositoryUrl: 'file:///etc' })).rejects.toMatchObject({
      code: 'GIT_REMOTE_NOT_ALLOWED',
    });
  });

  it('refuses a malformed URL rather than handing it to git', async () => {
    await expect(git().importRepository({ repositoryUrl: 'not-a-url' })).rejects.toMatchObject({
      code: 'GIT_REMOTE_NOT_ALLOWED',
    });
  });
});
