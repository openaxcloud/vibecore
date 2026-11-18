import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { optIn, exactProduct, readFixture, ownedRecipe, staticSurface as routeSurface } from './policy.mjs';
export function localOrigin(value) {
    const url = new URL(value);
    assert.equal(url.protocol, 'http:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.ok(url.port);
    assert.equal(url.origin, value);
    return url;
}
/** Only the missing runtime routes bypass the real web server's session-aware routes. */
/** Loopback transport only; does not start a stack, authorize a PVC mutation or mint auth. */
export async function startStaticGateway(web, api, env = process.env, port = 4317) {
    optIn(env);
    const targets = { web: localOrigin(web), api: localOrigin(api) };
    assert.notEqual(web, api);
    const server = createServer((incoming, response) => {
        try {
            const target = targets[routeSurface(incoming.url ?? '')];
            const upstream = request(options(incoming, target), (received) => {
                response.writeHead(received.statusCode ?? 502, received.headers);
                received.pipe(response);
            });
            upstream.on('error', () => {
                if (!response.headersSent) {
                    response.writeHead(502);
                }
                response.end();
            });
            incoming.on('aborted', () => upstream.destroy());
            incoming.pipe(upstream);
        }
        catch {
            response.writeHead(403).end();
        }
    });
    server.on('upgrade', (incoming, socket, head) => {
        try {
            const target = targets[routeSurface(incoming.url ?? '')];
            const upstream = request(options(incoming, target));
            upstream.on('upgrade', (received, remote, upstreamHead) => {
                socket.write(`HTTP/1.1 101 Switching Protocols\r\n${received.rawHeaders.reduce((lines, value, i, all) => (i % 2 ? lines : `${lines}${value}: ${all[i + 1]}\r\n`), '')}\r\n`);
                if (upstreamHead.length) {
                    socket.write(upstreamHead);
                }
                if (head.length) {
                    remote.write(head);
                }
                remote.on('error', () => socket.destroy());
                socket.on('error', () => remote.destroy());
                socket.on('close', () => remote.destroy());
                remote.on('close', () => socket.destroy());
                remote.pipe(socket).pipe(remote);
            });
            upstream.on('response', (received) => {
                received.resume();
                socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
            });
            upstream.on('error', () => socket.destroy());
            upstream.end();
        }
        catch {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
function options(incoming, target) {
    // Keep the browser Host/Origin/cookies/bearer intact for the real auth and preview guards.
    return {
        hostname: target.hostname,
        port: target.port,
        method: incoming.method,
        path: incoming.url,
        headers: incoming.headers,
    };
}
if (process.argv.includes('--serve')) void (async () => {
    optIn();
    exactProduct();
    const f = readFixture(process.env.VC_IDE_FIXTURE);
    ownedRecipe(f.recipe, f.web);
    const g = await startStaticGateway(process.env.VC_IDE_UPSTREAM_WEB, f.api);
    assert.equal(g.origin, f.web);
    console.log(JSON.stringify({ stage: 'static-gateway', status: 'ready' }));
    setTimeout(() => { g.server.closeAllConnections(); g.server.close(); process.exit(1); }, 20 * 60_000).unref();
})().catch(()=>{console.error(JSON.stringify({stage:'static-gateway',status:'failed'}));process.exit(1);});
