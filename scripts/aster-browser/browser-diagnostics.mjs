import { constants, closeSync, fstatSync, ftruncateSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs';

export const browserStages = Object.freeze([
  'browser-runner', 'browser-fixture', 'browser-contexts', 'browser-register', 'browser-register-page',
  'browser-register-form', 'browser-login', 'browser-login-page', 'browser-login-form', 'browser-import',
  'browser-runtime-start', 'browser-preview', 'browser-pvc-restart', 'browser-positive-fence',
  'browser-witnesses', 'browser-reopen', 'browser-assertions', 'browser-close', 'browser-complete',
]);
export const browserStatuses = Object.freeze(['begin', 'completed', 'failed', 'test-timeout']);
const valid = (value) => Array.isArray(value) && value.length === 2 && browserStages.includes(value[0]) && browserStatuses.includes(value[1]);

// A separate bounded enum snapshot. Never parse/transmit Playwright stdout, errors, URLs or page data.
export function readBrowserCheckpoint(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024) return undefined;
    const value = JSON.parse(readFileSync(fd, 'utf8'));
    return valid(value) ? value : undefined;
  } catch { return undefined; }
  finally { if (fd !== undefined) { try { closeSync(fd); } catch {} } }
}
export function writeBrowserCheckpoint(stage, status = 'begin', path = process.env.ASTER_BROWSER_DIAGNOSTICS_FILE) {
  if (!path || !valid([stage, status])) return;
  let fd;
  try {
    const previous = readBrowserCheckpoint(path);
    // Retain the first failing phase while teardown/reporting continues.
    if (previous && ['failed', 'test-timeout'].includes(previous[1])) return;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024) return;
    fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) return;
    const line = JSON.stringify([stage, status]) + '\n';
    writeSync(fd, line, 0, 'utf8');
    ftruncateSync(fd, Buffer.byteLength(line));
  } catch { /* Failure stays failure even when diagnostic storage is unavailable. */ }
  finally { if (fd !== undefined) { try { closeSync(fd); } catch {} } }
}
export function failBrowserCheckpoint(status = 'failed', path = process.env.ASTER_BROWSER_DIAGNOSTICS_FILE) {
  const previous = readBrowserCheckpoint(path);
  writeBrowserCheckpoint(previous?.[0] ?? 'browser-runner', status, path);
}
export function relayBrowserCheckpoint(path, diagnostic) {
  const value = readBrowserCheckpoint(path);
  if (!value) { diagnostic.status('browser-checkpoint-unavailable'); return; }
  diagnostic.stage(value[0]);
  if (value[1] !== 'begin') diagnostic.status(value[1]);
}
