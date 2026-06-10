import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

const MAX_BUFFERED_REPORTS = 200;

type BufferedPerformanceReport = {
  receivedAt: string;
  clientIp: string;
  payload: unknown;
};

const recentPerformanceReports: BufferedPerformanceReport[] = [];

function getClientIP(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function readPayload(request: Request) {
  const text = await request.text();

  if (!text) {
    return {};
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

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  if (url.searchParams.get('debug') === 'recent') {
    return json({ reports: recentPerformanceReports.slice(-20) }, { headers: { 'Cache-Control': 'no-store' } });
  }

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
