import { json } from '@remix-run/cloudflare';

export async function action() {
  return json({ ok: true });
}
