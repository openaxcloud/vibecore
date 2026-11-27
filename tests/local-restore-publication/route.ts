import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { buildPreviewProxyApp } from '../../services/preview-proxy/src/app';

async function main() {
  const directory = process.env.RESTORE_TLS_DIR!;
  const port = Number(process.env.PREVIEW_DOMAIN!.split(':')[1]);
  const proxy = await buildPreviewProxyApp({
    workspaceManagerUrl: process.env.WORKSPACE_MANAGER_URL,
    proxySharedSecret: process.env.PREVIEW_PROXY_SHARED_SECRET,
    previewDomain: 'localhost',
  });
  const upstream = new URL(await proxy.listen({ host: '127.0.0.1', port: 0 }));
  createServer(
    {
      cert: readFileSync(directory + '/cert.pem'),
      key: readFileSync(directory + '/key.pem'),
    },
    (req, res) => {
      const host = req.headers.host?.split(':')[0];
      if (!host || !/^s-[a-z0-9]+\.localhost$/.test(host) || req.method !== 'GET') {
        res.writeHead(404).end();
        return;
      }
      const stream = request(
        { hostname: '127.0.0.1', port: upstream.port, path: req.url, headers: { host } },
        (reply) => {
          res.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(res);
        },
      );
      stream.on('error', () => res.writeHead(502).end());
      stream.end();
    },
  ).listen(port, '127.0.0.1');
}
main().catch(() => {
  process.exitCode = 1;
});
