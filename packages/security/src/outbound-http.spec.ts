import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOutbound } from './outbound-http.js';

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:http', async (original) => ({
  ...(await original<typeof import('node:http')>()),
  request: transport.request,
}));
vi.mock('node:https', async (original) => ({
  ...(await original<typeof import('node:https')>()),
  request: transport.request,
}));

const policy = { allowedHostSuffixes: [], allowAnyPublicHost: true, resolveHost: vi.fn(async () => ['93.184.216.34']) };

afterEach(() => vi.clearAllMocks());

function respond(body = 'delivered', status = 200, rawHeaders = ['content-type', 'text/plain']) {
  transport.request.mockImplementation((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & {
      end: (body?: unknown) => void;
      destroy: (error: Error) => void;
    };
    request.end = () =>
      queueMicrotask(() => {
        const response = Readable.from([Buffer.from(body)]) as Readable & { statusCode: number; rawHeaders: string[] };
        response.statusCode = status;
        response.rawHeaders = rawHeaders;
        response.once('close', () => request.emit('close'));
        callback(response);
      });

    request.destroy = (error) => {
      request.emit('error', error);
      request.emit('close');
    };

    return request;
  });
}

describe('outbound HTTP binds the validated address to the socket', () => {
  it('keeps Host and TLS identity, resolves once, and passes only approved addresses to native lookup', async () => {
    respond();

    const response = await fetchOutbound('https://siem.example/ingest', policy, { method: 'POST', body: '{}' });
    expect(await response.text()).toBe('delivered');
    expect(policy.resolveHost).toHaveBeenCalledTimes(1);

    const [url, options] = transport.request.mock.calls[0];
    expect(url.hostname).toBe('siem.example');
    expect(options.headers.host).toBe('siem.example');
    expect(options.agent).toBe(false);

    const callback = vi.fn();
    options.lookup('siem.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    options.lookup('siem.example', { family: 4 }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, '93.184.216.34', 4);
    options.lookup('different.example', {}, callback);
    expect(callback.mock.lastCall?.[0]).toMatchObject({ code: 'HOST_NOT_ALLOWED' });
  });

  it.each(['127.0.0.1', '169.254.169.254', 'not-an-address', '::ffff:127.0.0.1'])(
    'refuses a DNS answer containing %s before opening any connection',
    async (address) => {
      await expect(
        fetchOutbound('https://siem.example/', { ...policy, resolveHost: async () => ['93.184.216.34', address] }),
      ).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
      expect(transport.request).not.toHaveBeenCalled();
    },
  );

  it('refuses credentials and a failed DNS lookup without transport fallback', async () => {
    await expect(fetchOutbound('https://name:fixture@siem.example/', policy)).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
    await expect(
      fetchOutbound('https://siem.example/', {
        ...policy,
        resolveHost: async () => {
          throw new Error('unavailable');
        },
      }),
    ).rejects.toMatchObject({ code: 'RESOLUTION_FAILED' });
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('returns redirects without following them and preserves repeated response cookies', async () => {
    respond('', 302, ['location', 'http://127.0.0.1/private', 'set-cookie', 'a=one', 'set-cookie', 'b=two']);

    const response = await fetchOutbound('https://siem.example/', policy);
    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()).toEqual(['a=one', 'b=two']);
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it('limits response bytes instead of accumulating an unbounded response', async () => {
    respond('too much');
    await expect(fetchOutbound('https://siem.example/', policy, { maxBytes: 2 })).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
  });
});
