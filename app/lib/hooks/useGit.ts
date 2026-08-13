import type { FileNode, RuntimeAdapter } from '@vibecore/runtime-contract';
import git, { type GitAuth, type PromiseFsClient } from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import Cookies from 'js-cookie';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'react-toastify';
import { encodeGitWriteContent } from './git-fs-encoding';
import { runtimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';

const lookupSavedPassword = (url: string) => {
  const domain = url.split('/')[2];
  const gitCreds = Cookies.get(`git:${domain}`);

  if (!gitCreds) {
    return null;
  }

  try {
    const { username, password } = JSON.parse(gitCreds || '{}');
    return { username, password };
  } catch (error) {
    console.log(`Failed to parse Git Cookie ${error}`);
    return null;
  }
};

const saveGitAuth = (url: string, auth: GitAuth) => {
  const domain = url.split('/')[2];

  /*
   * Harden the git PAT/credential cookie: HTTPS-only, strict same-site (never
   * sent on cross-site requests), and a bounded 7-day lifetime instead of the
   * long-lived insecure default.
   */
  Cookies.set(`git:${domain}`, JSON.stringify(auth), { secure: true, sameSite: 'strict', expires: 7 });
};

export function useGit() {
  const [ready, setReady] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeAdapter>();
  const [fs, setFs] = useState<PromiseFsClient>();
  const fileData = useRef<Record<string, { data: any; encoding?: string }>>({});
  useEffect(() => {
    runtimeAdapter
      .startWorkspace()
      .then(() => {
        fileData.current = {};
        setRuntime(runtimeAdapter);
        setFs(getFs(runtimeAdapter, fileData));
        setReady(true);
      })
      .catch((error) => {
        /*
         * Without this catch a failed workspace start is an unhandled rejection
         * and `ready` never flips, leaving every git operation hung forever.
         */
        console.error('Failed to start workspace for git operations', error);
      });
  }, []);

  const gitClone = useCallback(
    async (url: string, retryCount = 0) => {
      if (!runtime || !fs || !ready) {
        throw new Error('Runtime not initialized. Please try again later.');
      }

      fileData.current = {};

      let branch: string | undefined;
      let baseUrl = url;

      if (url.includes('#')) {
        [baseUrl, branch] = url.split('#');
      }

      /*
       * Skip Git initialization for now - let isomorphic-git handle it
       * This avoids potential issues with our manual initialization
       */

      const headers: {
        [x: string]: string;
      } = {
        'User-Agent': 'E-Code',
      };

      const auth = lookupSavedPassword(url);

      if (auth) {
        headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      }

      try {
        // Add a small delay before retrying to allow for network recovery
        if (retryCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
          console.log(`Retrying git clone (attempt ${retryCount + 1})...`);
        }

        await git.clone({
          fs,
          http,
          dir: runtime.workdir,
          url: baseUrl,
          depth: 1,
          singleBranch: true,
          ref: branch,
          corsProxy: '/api/git-proxy',
          headers,
          onProgress: (event) => {
            console.log('Git clone progress:', event);
          },
          onAuth: (baseUrl) => {
            let auth = lookupSavedPassword(baseUrl);

            if (auth) {
              console.log('Using saved authentication for', baseUrl);
              return auth;
            }

            console.log('Repository requires authentication:', baseUrl);

            if (confirm('This repository requires authentication. Would you like to enter your GitHub credentials?')) {
              auth = {
                username: prompt('Enter username') || '',
                password: prompt('Enter password or personal access token') || '',
              };
              return auth;
            } else {
              return { cancel: true };
            }
          },
          onAuthFailure: (baseUrl, _auth) => {
            console.error(`Authentication failed for ${baseUrl}`);
            toast.error(
              `Authentication failed for ${baseUrl.split('/')[2]}. Please check your credentials and try again.`,
            );
            throw new Error(
              `Authentication failed for ${baseUrl.split('/')[2]}. Please check your credentials and try again.`,
            );
          },
          onAuthSuccess: (baseUrl, auth) => {
            console.log(`Authentication successful for ${baseUrl}`);
            saveGitAuth(baseUrl, auth);
          },
        });

        const data: Record<string, { data: any; encoding?: string }> = {};

        for (const [key, value] of Object.entries(fileData.current)) {
          data[key] = value;
        }

        return { workdir: runtime.workdir, data };
      } catch (error) {
        console.error('Git clone error:', error);

        // Handle specific error types
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check for common error patterns
        if (errorMessage.includes('Authentication failed')) {
          toast.error(`Authentication failed. Please check your GitHub credentials and try again.`);
          throw error;
        } else if (
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('ECONNREFUSED')
        ) {
          toast.error(`Network error while connecting to repository. Please check your internet connection.`);

          // Retry for network errors, up to 3 times
          if (retryCount < 3) {
            return gitClone(url, retryCount + 1);
          }

          throw new Error(
            `Failed to connect to repository after multiple attempts. Please check your internet connection.`,
          );
        } else if (errorMessage.includes('404')) {
          toast.error(`Repository not found. Please check the URL and make sure the repository exists.`);
          throw new Error(`Repository not found. Please check the URL and make sure the repository exists.`);
        } else if (errorMessage.includes('401')) {
          toast.error(`Unauthorized access to repository. Please connect your GitHub account with proper permissions.`);
          throw new Error(
            `Unauthorized access to repository. Please connect your GitHub account with proper permissions.`,
          );
        } else {
          toast.error(`Failed to clone repository: ${errorMessage}`);
          throw error;
        }
      }
    },
    [runtime, fs, ready],
  );

  return { ready, gitClone };
}

const getFs = (
  runtime: RuntimeAdapter,
  record: MutableRefObject<Record<string, { data: any; encoding?: string }>>,
) => ({
  promises: {
    readFile: async (path: string, options: any) => {
      const relativePath = toRuntimePath(runtime, path);

      const { content, encoding } = await runtime.readFile(relativePath);

      /*
       * Reconstruct the real bytes. The runtime returns base64 for binary blobs
       * (which is exactly what git objects, packfiles and binary assets are) and
       * utf8 for text. Decoding base64-as-utf8 here would corrupt every binary
       * file git touches, so resolve to the true bytes first.
       */
      const bytes = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');

      /*
       * isomorphic-git asks for a utf8 string (options.encoding === 'utf8') or,
       * with no encoding, the raw bytes as a Uint8Array. Honor that contract.
       */
      const requested = typeof options === 'string' ? options : options?.encoding;

      if (requested === 'utf8' || requested === 'utf-8') {
        return bytes.toString('utf8');
      }

      return new Uint8Array(bytes);
    },
    writeFile: async (path: string, data: any, options: any = {}) => {
      const relativePath = toRuntimePath(runtime, path);

      if (record.current) {
        record.current[relativePath] = { data, encoding: options?.encoding };
      }

      try {
        /*
         * Persist binary working-tree files (Uint8Array from git checkout)
         * losslessly. Decoding arbitrary bytes via TextDecoder replaced every
         * invalid/multi-byte sequence with U+FFFD and corrupted images, fonts,
         * .pdf and packfiles; latin1 preserves the byte identity instead.
         */
        await runtime.writeFile(relativePath, encodeGitWriteContent(data));
      } catch (error) {
        throw error;
      }
    },
    mkdir: async (path: string, _options: any) => {
      const relativePath = toRuntimePath(runtime, path);

      try {
        await runtime.createDirectory(relativePath);
      } catch (error) {
        throw error;
      }
    },
    readdir: async (path: string, options: any) => {
      const relativePath = toRuntimePath(runtime, path);

      try {
        const result = await runtime.listFiles(relativePath);

        if (options?.withFileTypes) {
          return result.map(toDirent);
        }

        return result.map((node) => node.name);
      } catch (error) {
        throw error;
      }
    },
    rm: async (path: string, _options: any) => {
      const relativePath = toRuntimePath(runtime, path);

      try {
        await runtime.deleteFile(relativePath);
      } catch (error) {
        throw error;
      }
    },
    rmdir: async (path: string, _options: any) => {
      const relativePath = toRuntimePath(runtime, path);

      try {
        await runtime.deleteFile(relativePath);
      } catch (error) {
        throw error;
      }
    },
    unlink: async (path: string) => {
      try {
        return await runtime.deleteFile(toRuntimePath(runtime, path));
      } catch (error) {
        throw error;
      }
    },
    stat: async (path: string) => {
      try {
        const relativePath = toRuntimePath(runtime, path);
        const dirPath = pathUtils.dirname(relativePath);
        const fileName = pathUtils.basename(relativePath);

        // Special handling for .git/index file
        if (relativePath === '.git/index') {
          return {
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
            size: 12, // Size of our empty index
            mode: 0o100644, // Regular file
            mtimeMs: Date.now(),
            ctimeMs: Date.now(),
            birthtimeMs: Date.now(),
            atimeMs: Date.now(),
            uid: 1000,
            gid: 1000,
            dev: 1,
            ino: 1,
            nlink: 1,
            rdev: 0,
            blksize: 4096,
            blocks: 1,
            mtime: new Date(),
            ctime: new Date(),
            birthtime: new Date(),
            atime: new Date(),
          };
        }

        const resp = (await runtime.listFiles(dirPath)).map(toDirent);
        const fileInfo = resp.find((x) => x.name === fileName);

        if (!fileInfo) {
          const err = new Error(`ENOENT: no such file or directory, stat '${path}'`) as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          err.errno = -2;
          err.syscall = 'stat';
          err.path = path;
          throw err;
        }

        return {
          isFile: () => fileInfo.isFile(),
          isDirectory: () => fileInfo.isDirectory(),
          isSymbolicLink: () => false,
          size: fileInfo.isDirectory() ? 4096 : 1,
          mode: fileInfo.isDirectory() ? 0o040755 : 0o100644, // Directory or regular file
          mtimeMs: Date.now(),
          ctimeMs: Date.now(),
          birthtimeMs: Date.now(),
          atimeMs: Date.now(),
          uid: 1000,
          gid: 1000,
          dev: 1,
          ino: 1,
          nlink: 1,
          rdev: 0,
          blksize: 4096,
          blocks: 8,
          mtime: new Date(),
          ctime: new Date(),
          birthtime: new Date(),
          atime: new Date(),
        };
      } catch (error: any) {
        if (!error.code) {
          error.code = 'ENOENT';
          error.errno = -2;
          error.syscall = 'stat';
          error.path = path;
        }

        throw error;
      }
    },
    lstat: async (path: string) => {
      return await getFs(runtime, record).promises.stat(path);
    },
    readlink: async (path: string) => {
      throw new Error(`EINVAL: invalid argument, readlink '${path}'`);
    },
    symlink: async (target: string, path: string) => {
      /*
       * The runtime-backed git filesystem does not support symlinks yet,
       * so we throw an "operation not supported" error.
       */
      throw new Error(`EPERM: operation not permitted, symlink '${target}' -> '${path}'`);
    },

    chmod: async (_path: string, _mode: number) => {
      /*
       * Permission changes are not supported by the runtime-backed git filesystem yet,
       * but we can pretend they succeeded for compatibility.
       */
      return await Promise.resolve();
    },
  },
});

function toRuntimePath(runtime: RuntimeAdapter, filePath: string) {
  if (filePath === runtime.workdir) {
    return '.';
  }

  if (filePath.startsWith(`${runtime.workdir}/`)) {
    return filePath.slice(runtime.workdir.length + 1);
  }

  return filePath.replace(/^\/+/, '') || '.';
}

function toDirent(node: FileNode) {
  return {
    name: node.name,
    isFile: () => node.type === 'file',
    isDirectory: () => node.type === 'directory',
  };
}

const pathUtils = {
  dirname: (path: string) => {
    // Handle empty or just filename cases
    if (!path || !path.includes('/')) {
      return '.';
    }

    // Remove trailing slashes
    path = path.replace(/\/+$/, '');

    // Get directory part
    return path.split('/').slice(0, -1).join('/') || '/';
  },

  basename: (path: string, ext?: string) => {
    // Remove trailing slashes
    path = path.replace(/\/+$/, '');

    // Get the last part of the path
    const base = path.split('/').pop() || '';

    // If extension is provided, remove it from the result
    if (ext && base.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }

    return base;
  },
  relative: (from: string, to: string): string => {
    // Handle empty inputs
    if (!from || !to) {
      return '.';
    }

    // Normalize paths by removing trailing slashes and splitting
    const normalizePathParts = (p: string) => p.replace(/\/+$/, '').split('/').filter(Boolean);

    const fromParts = normalizePathParts(from);
    const toParts = normalizePathParts(to);

    // Find common parts at the start of both paths
    let commonLength = 0;

    const minLength = Math.min(fromParts.length, toParts.length);

    for (let i = 0; i < minLength; i++) {
      if (fromParts[i] !== toParts[i]) {
        break;
      }

      commonLength++;
    }

    // Calculate the number of "../" needed
    const upCount = fromParts.length - commonLength;

    // Get the remaining path parts we need to append
    const remainingPath = toParts.slice(commonLength);

    // Construct the relative path
    const relativeParts = [...Array(upCount).fill('..'), ...remainingPath];

    // Handle empty result case
    return relativeParts.length === 0 ? '.' : relativeParts.join('/');
  },
};
