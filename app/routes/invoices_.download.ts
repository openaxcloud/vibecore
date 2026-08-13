import JSZip from 'jszip';
import { apiRequest, firstOrganizationOrNull, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type Invoice = {
  id: string;
  number: string | null;
  invoicePdf: string | null;
};

/** Keep the zip bounded — Stripe lists newest first, 24 covers two years monthly. */
const MAX_INVOICES = 24;

/**
 * Resource route: GET /invoices/download streams a zip of the organization's
 * invoice PDFs. PDFs are fetched server-side from Stripe's signed URLs; a
 * failed download is skipped and listed in a MANIFEST.txt instead of failing
 * the whole archive.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: 'No organization found for your account.' }, { status: 400 });
  }

  const data = await apiRequest<{ invoices: Invoice[] }>(request, `/orgs/${organization.id}/billing/invoices`);
  const withPdf = (data.invoices ?? []).filter((invoice) => invoice.invoicePdf).slice(0, MAX_INVOICES);

  if (withPdf.length === 0) {
    throw json({ error: 'No downloadable invoices yet.' }, { status: 404 });
  }

  const zip = new JSZip();
  const skipped: string[] = [];

  await Promise.all(
    withPdf.map(async (invoice) => {
      const name = `${(invoice.number ?? invoice.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

      try {
        const response = await fetch(invoice.invoicePdf as string, { signal: AbortSignal.timeout(15_000) });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        zip.file(name, await response.arrayBuffer());
      } catch {
        skipped.push(name);
      }
    }),
  );

  if (skipped.length > 0) {
    zip.file('MANIFEST.txt', `Skipped (download failed):\n${skipped.join('\n')}\n`);
  }

  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(archive), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="invoices-${stamp}.zip"`,
      'cache-control': 'no-store',
    },
  });
}
