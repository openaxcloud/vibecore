import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armDeadline, decodeBody, FETCH_HEADERS, safeFetch } from './safe-fetch';

/*
 * BUG-AGENT-WEBCLONE-001 — the hard deadline. Node's request `timeout` is an
 * idle timer: a server trickling one byte every few seconds never trips it, so
 * a chat request could hang for as long as the byte cap allowed. armDeadline is
 * the wall-clock guard; the network path itself cannot be exercised here (the
 * SSRF guard rejects loopback), so the guard is pinned in isolation plus the
 * pre-flight checks safeFetch does before any socket is opened.
 */

describe('armDeadline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /*
   * Les erreurs internes ne portent AUCUN message : l'appelant lit `name`/`code`
   * et le traduit (describeWebReferenceError). Un message anglais en dur ici est
   * de la copie visible que le scanner i18n de la CI refuse — mesuré le 08/09 :
   * `new Error('aborted')` a fait échouer Production CI (i18n:scan:source,
   * « new-file-debt baseline=0 current=1 ») et donc la barrière de release.
   */
  it('les erreurs internes portent un name, jamais un message en dur', () => {
    const destroy = vi.fn();
    const controller = new AbortController();

    armDeadline({ destroy }, Date.now() + 500, controller.signal);
    controller.abort();

    const abortError = destroy.mock.calls[0][0] as Error;

    expect(abortError.name).toBe('AbortError');
    expect(abortError.message).toBe('');

    const other = vi.fn();
    armDeadline({ destroy: other }, Date.now() + 1, undefined);
    vi.advanceTimersByTime(2);

    const deadlineError = other.mock.calls[0][0] as Error;

    expect(deadlineError.name).toBe('DeadlineError');
    expect(deadlineError.message).toBe('');
  });

  it('destroys the request with a DeadlineError when the wall clock passes the deadline', () => {
    const destroy = vi.fn();
    const disarm = armDeadline({ destroy }, Date.now() + 500, undefined);

    vi.advanceTimersByTime(499);
    expect(destroy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect((destroy.mock.calls[0][0] as Error).name).toBe('DeadlineError');

    disarm();
  });

  it('a deadline already in the past fires immediately (0 ms timer)', () => {
    const destroy = vi.fn();
    armDeadline({ destroy }, Date.now() - 1, undefined);

    vi.advanceTimersByTime(0);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys on caller abort and never fires after disarm', () => {
    const destroy = vi.fn();
    const controller = new AbortController();
    const disarm = armDeadline({ destroy }, Date.now() + 10_000, controller.signal);

    controller.abort();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect((destroy.mock.calls[0][0] as Error).name).toBe('AbortError');

    disarm();
    vi.advanceTimersByTime(20_000);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('an already-aborted signal destroys synchronously', () => {
    const destroy = vi.fn();
    const controller = new AbortController();
    controller.abort();

    armDeadline({ destroy }, Date.now() + 10_000, controller.signal);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('disarm clears the timer', () => {
    const destroy = vi.fn();
    const disarm = armDeadline({ destroy }, Date.now() + 100, undefined);

    disarm();
    vi.advanceTimersByTime(1_000);
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe('decodeBody', () => {
  const latin1 = Buffer.from("<html><head><title>Éclairage à l'été</title></head></html>", 'latin1');

  it('honours the Content-Type charset', () => {
    expect(decodeBody(latin1, 'text/html; charset=iso-8859-1')).toContain("Éclairage à l'été");
    expect(decodeBody(latin1, 'text/html; charset=windows-1252')).toContain("Éclairage à l'été");
  });

  it('sniffs <meta charset> when the header is silent, and falls back to UTF-8', () => {
    const withMeta = Buffer.concat([Buffer.from('<meta charset="windows-1252">', 'latin1'), latin1]);

    expect(decodeBody(withMeta, 'text/html')).toContain("Éclairage à l'été");

    const httpEquiv = Buffer.concat([
      Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">', 'latin1'),
      latin1,
    ]);

    expect(decodeBody(httpEquiv, '')).toContain("Éclairage à l'été");

    const utf8 = Buffer.from('<title>Éclairage</title>', 'utf8');

    expect(decodeBody(utf8, 'text/html')).toBe('<title>Éclairage</title>');
    expect(decodeBody(utf8, 'text/html; charset=no-such-charset')).toBe('<title>Éclairage</title>');
  });
});

describe('safeFetch pre-flight', () => {
  it('keeps the original widget Accept header (fingerprinted by some WAFs)', () => {
    expect(FETCH_HEADERS.Accept).toBe('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  });

  it('refuses before opening a socket: bad scheme, private host, spent deadline, aborted signal', async () => {
    expect(await safeFetch('ftp://example.com/', 'en')).toEqual({ ok: false, status: 400, code: 'URL_NOT_ALLOWED' });
    expect(await safeFetch('https://127.0.0.1/', 'en')).toEqual({ ok: false, status: 400, code: 'URL_NOT_ALLOWED' });
    expect(await safeFetch('https://example.com/', 'en', { deadlineMs: 0 })).toEqual({
      ok: false,
      status: 504,
      code: 'TIMEOUT',
    });

    const controller = new AbortController();
    controller.abort();
    expect(await safeFetch('https://example.com/', 'en', { signal: controller.signal })).toEqual({
      ok: false,
      status: 504,
      code: 'TIMEOUT',
    });
  });
});
