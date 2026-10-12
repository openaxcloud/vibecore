import { mkdir, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- NodeNext tests exercise the actual backend module.
import { GitCliProvider } from '../project-storage.js';

const child = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  execFile: child.execFile,
}));

afterEach(() => vi.clearAllMocks());

describe('Git import connects only to the validated DNS addresses', () => {
  it.each(['https://forge.example/repo.git', 'https://fixture:fixture@forge.example/repo.git'])(
    'pins DNS and retains the imported file for %s',
    async (repositoryUrl) => {
      child.execFile.mockImplementation((_command, args, _options, callback) => {
        if (args.includes('clone')) {
          const target = args.at(-1);
          mkdir(target, { recursive: true })
            .then(() => writeFile(`${target}/README.md`, '# Fixture\n'))
            .then(() => callback(null, '', ''));
        } else {
          callback(null, 'main\n', '');
        }
      });

      const resolveHost = vi.fn(async () => ['93.184.216.34', '2606:4700:4700::1111']);

      const result = await new GitCliProvider({ resolveHost }).importRepository({
        repositoryUrl,
      });
      expect(result.defaultBranch).toBe('main');
      expect(result.files.some((file) => file.path === 'README.md')).toBe(true);
      expect(resolveHost).toHaveBeenCalledTimes(1);

      const [command, args, options] = child.execFile.mock.calls.find((call) => call[1].includes('clone'))!;
      expect(command).toBe('git');
      expect(args).toEqual(
        expect.arrayContaining([
          'http.curloptResolve=forge.example:443:93.184.216.34,[2606:4700:4700::1111]',
          'http.followRedirects=false',
          'http.proxy=',
          'http.sslVerify=true',
          'protocol.file.allow=never',
        ]),
      );
      expect(options.env).toMatchObject({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
    },
  );

  it('does not invoke Git when DNS includes a private address', async () => {
    await expect(
      new GitCliProvider({ resolveHost: async () => ['93.184.216.34', '10.0.0.1'] }).importRepository({
        repositoryUrl: 'https://forge.example/repo.git',
      }),
    ).rejects.toMatchObject({ code: 'GIT_REMOTE_NOT_ALLOWED' });
    expect(child.execFile).not.toHaveBeenCalled();
  });
});
