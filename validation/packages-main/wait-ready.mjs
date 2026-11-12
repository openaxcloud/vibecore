import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const targets = process.argv.slice(2);

if (!targets.length || targets.some((x) => !/^(tcp|http):\/\/127\.0\.0\.1:\d+(\/health)?$/.test(x))) {
  throw new Error('Only fixed local readiness endpoints allowed');
}

for (const target of targets) {
  const url = new URL(target);
  const until = performance.now() + 180000;

  let ready = false;

  while (performance.now() < until && !ready) {
    if (url.protocol === 'tcp:') {
      ready = await new Promise((resolve) => {
        const socket = net.connect({ host: url.hostname, port: Number(url.port) });

        let done = false;

        const finish = (ok) => {
          if (done) {
            return;
          }

          done = true;
          socket.destroy();
          resolve(ok);
        };
        socket.setTimeout(2000, () => finish(false));
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
      });
    } else {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        ready = response.ok;
        await response.body?.cancel();
      } catch {}
    }

    if (!ready) {
      await delay(1000);
    }
  }

  if (!ready) {
    throw new Error('Local service readiness deadline');
  }
}
