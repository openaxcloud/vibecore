import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.K6_VUS || 25),
  duration: __ENV.K6_DURATION || '2m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800'],
  },
};

const previewUrl = __ENV.PREVIEW_URL || __ENV.BASE_URL || 'http://127.0.0.1:5173';

export default function previewLoad() {
  const response = http.get(previewUrl);
  check(response, { 'preview responds': (r) => r.status >= 200 && r.status < 500 });
  sleep(1);
}
