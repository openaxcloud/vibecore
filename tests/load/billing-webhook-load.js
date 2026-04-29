import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.K6_VUS || 5),
  duration: __ENV.K6_DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3001';

export default function billingWebhookLoad() {
  const body = JSON.stringify({
    id: `evt_load_${__VU}_${__ITER}`,
    type: 'invoice.payment_succeeded',
    data: { object: { id: `in_load_${__VU}_${__ITER}` } },
  });
  const response = http.post(`${baseUrl}/billing/webhook`, body, {
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': __ENV.STRIPE_TEST_SIGNATURE || 'invalid-load-test-signature',
    },
  });
  check(response, { 'webhook rejects invalid or accepts signed': (r) => [200, 202, 400, 401].includes(r.status) });
  sleep(1);
}
