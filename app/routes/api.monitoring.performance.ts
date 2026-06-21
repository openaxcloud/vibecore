import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';

const MAX_BUFFERED_REPORTS = 200;

type BufferedPerformanceReport = {
  receivedAt: string;
  clientIp: string;
  payload: unknown;
};

const recentPerformanceReports: BufferedPerformanceReport[] = [];

function getClientIP(request: Request) {
  /*
   * x-real-ip is set by the ingress to the real peer (trustworthy). In
   * x-forwarded-for the RIGHTMOST entry is the one the trusted proxy appended;
   * the leftmost is client-spoofable. cf-connecting-ip is forgeable (no
   * Cloudflare in front of prod). See app/lib/security.ts getClientIP.
   */
  const realIP = request.headers.get('x-real-ip');

  if (realIP?.trim()) {
    return realIP.trim();
  }

  const parts =
    request.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? [];

  return parts.length > 0 ? parts[parts.length - 1] : 'unknown';
}

async function readPayload(request: Request) {
  const text = await request.text();

  if (!text) {
    return {};
  }

  /*
   * Cap the stored payload size; an oversized body is recorded truncated
   * (matching the parse-failure branch) rather than parsed and held whole.
   */
  if (text.length > 20_000) {
    return { raw: text.slice(0, 20_000), truncated: true };
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 20_000) };
  }
}

function rememberReport(report: BufferedPerformanceReport) {
  recentPerformanceReports.push(report);

  if (recentPerformanceReports.length > MAX_BUFFERED_REPORTS) {
    recentPerformanceReports.splice(0, recentPerformanceReports.length - MAX_BUFFERED_REPORTS);
  }
}

export async function loader(_args: LoaderFunctionArgs) {
  /*
   * The `?debug=recent` dump exposed other users' client IPs and submitted
   * payloads to ANY unauthenticated caller. Removed — the buffer is retained only
   * for in-process inspection via the __testing export, never served over HTTP.
   */
  return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  rememberReport({
    clientIp: getClientIP(request),
    receivedAt: new Date().toISOString(),
    payload: await readPayload(request),
  });

  return json({ ok: true, accepted: true }, { status: 202 });
}

export const __testing = {
  recentPerformanceReports,
};
