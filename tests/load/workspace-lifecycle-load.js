import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    workspace_lifecycle: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: Number(__ENV.K6_VUS || 10) },
        { duration: __ENV.K6_DURATION || '2m', target: Number(__ENV.K6_VUS || 10) },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const token = __ENV.AUTH_TOKEN || '';

export default function workspaceLifecycleLoad() {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const status = http.get(`${baseUrl}/api/runtime/status`, { headers });
  check(status, { 'workspace status reachable': (response) => [200, 401, 403, 404].includes(response.status) });
  sleep(1);
}
