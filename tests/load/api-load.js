import { requireLocalLoadTarget } from './local-load-guard.js';
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  maxRedirects: 0,
  scenarios: {
    api_baseline: {
      executor: 'constant-vus',
      vus: Number(__ENV.K6_VUS || 20),
      duration: __ENV.K6_DURATION || '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

const baseUrl = requireLocalLoadTarget(__ENV, __ENV.BASE_URL || 'http://127.0.0.1:3001');

export default function apiLoad() {
  const health = http.get(`${baseUrl}/health`, { redirects: 0 });
  check(health, { 'health ok': (response) => response.status === 200 });

  const ready = http.get(`${baseUrl}/ready`, { redirects: 0 });
  check(ready, { 'ready ok': (response) => response.status === 200 });

  const metrics = http.get(`${baseUrl}/metrics`, { redirects: 0 });
  check(metrics, { 'metrics ok': (response) => response.status === 200 && response.body.includes('api_request_duration_seconds') });

  sleep(1);
}
