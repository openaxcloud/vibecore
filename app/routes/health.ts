/*
 * Liveness / readiness probe used by Kubernetes and the Docker HEALTHCHECK.
 * Kept minimal on purpose: respond synchronously without touching the database
 * or any downstream services so the probe reflects only whether the Node
 * process can accept and respond to requests.
 */
export const loader = () =>
  new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
