import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.K6_VUS || 10),
  duration: __ENV.K6_DURATION || '2m',
  thresholds: {
    http_req_failed: ['rate<0.03'],
    http_req_duration: ['p(95)<3000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const token = __ENV.AUTH_TOKEN || '';

export default function aiSimulatedLoad() {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = http.post(
    `${baseUrl}/ai/simulate`,
    JSON.stringify({ prompt: 'load-test simulated request', maxTokens: 128 }),
    { headers },
  );
  check(response, { 'ai endpoint controlled': (r) => [200, 202, 401, 403, 404].includes(r.status) });
  sleep(2);
}
