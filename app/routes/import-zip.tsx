import { FileArchive } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatImportArchiveSize,
  formatImportRoutesCopy,
  getImportRoutesCopy,
  type ImportRoutesCopy,
} from '~/lib/i18n/catalogs/import-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

const IMPORT_ZIP_CANONICAL_URL = 'https://e-code.ai/import-zip';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getImportRoutesCopy(language);
  const title = copy['importRoutes.zip.meta.title'];
  const description = copy['importRoutes.zip.meta.description'];
  const french = language === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: IMPORT_ZIP_CANONICAL_URL },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: IMPORT_ZIP_CANONICAL_URL },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${IMPORT_ZIP_CANONICAL_URL}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${IMPORT_ZIP_CANONICAL_URL}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: IMPORT_ZIP_CANONICAL_URL },
  ];
};

/*
 * The archive is base64-encoded and uploaded inside a single JSON request body.
 * The API's body limit is 25 MB (API_BODY_LIMIT_BYTES; the ingress mirrors it at
 * 26m) and base64 inflates bytes by ~33%, so a raw .zip above ~18 MB would 413
 * before Fastify ever sees it. Reject it in the browser with a clear message
 * instead of firing a doomed multi-second upload.
 */
const MAX_ARCHIVE_BYTES = 18 * 1024 * 1024;

type ImportZipSource = 'bolt' | 'lovable' | 'base44' | 'previous-agent-export';
type ImportZipErrorCode = 'archiveRequired' | 'importFailed';
type ImportZipActionData = { errorCode: ImportZipErrorCode };

function base64FromArrayBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);

  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

/*
 * A Bolt / Lovable / Base44 / Previous-Agent export IS a bundle of files, so it
 * imports through the exact same proven zip pipeline (disposable staging +
 * secret scan). The `?source=` param only reframes the copy so the hub tile
 * lands on an honestly-labelled screen — the import path is identical.
 */
const IMPORT_ZIP_SOURCES = new Set<ImportZipSource>(['bolt', 'lovable', 'base44', 'previous-agent-export']);

function importSourceLabel(copy: ImportRoutesCopy, source: ImportZipSource | null): string | null {
  if (!source) {
    return null;
  }

  if (source === 'previous-agent-export') {
    return copy['importRoutes.zip.source.previousAgent'];
  }

  return source === 'bolt' ? 'Bolt' : source === 'lovable' ? 'Lovable' : 'Base44';
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  const requestedSource = new URL(request.url).searchParams.get('source');

  const source = IMPORT_ZIP_SOURCES.has(requestedSource as ImportZipSource)
    ? (requestedSource as ImportZipSource)
    : null;

  return json(
    { language: localeResolution.language, source },
    { headers: localeResponseHeaders(request, localeResolution) },
  );
}

export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);

  const actionError = (errorCode: ImportZipErrorCode, status: number) =>
    json<ImportZipActionData>({ errorCode }, { status, headers: localeResponseHeaders(request, localeResolution) });

  const formData = await request.formData();
  const archive = formData.get('archive');
  const name = String(formData.get('name') ?? '').trim() || undefined;

  if (!(archive instanceof File) || archive.size === 0) {
    return actionError('archiveRequired', 400);
  }

  try {
    const organization = await firstOrganization(request);
    const requestedSource = new URL(request.url).searchParams.get('source');

    const provider = IMPORT_ZIP_SOURCES.has(requestedSource as ImportZipSource)
      ? (requestedSource as ImportZipSource)
      : 'zip';
    const staged = await apiRequest<{ import: { importJobId: string } }>(request, `/orgs/${organization.id}/imports`, {
      method: 'POST',
      body: JSON.stringify({
        provider,
        sourceRef: name ?? archive.name,
        idempotencyKey: `zip:${organization.id}:${archive.name}:${archive.size}:${archive.lastModified}`,
        zipBase64: base64FromArrayBuffer(await archive.arrayBuffer()),
      }),
    });

    return redirect(`/import/preview/${encodeURIComponent(staged.import.importJobId)}`);
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    return actionError('importFailed', error instanceof Response ? error.status : 500);
  }
}

export default function ImportZipPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getImportRoutesCopy(language);
  const actionData = useActionData<typeof action>() as ImportZipActionData | undefined;
  const { source } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [sizeError, setSizeError] = useState<string | null>(null);
  const sourceLabel = importSourceLabel(copy, source);

  const importing = navigation.state === 'submitting';
  const canImport = Boolean(fileName) && !sizeError && !importing;
  const actionError = actionData?.errorCode ? copy[`importRoutes.zip.error.${actionData.errorCode}`] : null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    setFileName(file?.name ?? '');

    if (file && file.size > MAX_ARCHIVE_BYTES) {
      setSizeError(
        formatImportRoutesCopy(copy['importRoutes.zip.error.tooLarge'], {
          size: formatImportArchiveSize(file.size, language),
          limit: formatImportArchiveSize(MAX_ARCHIVE_BYTES, language),
        }),
      );
    } else {
      setSizeError(null);
    }
  };

  return (
    <AppShell
      title={
        sourceLabel
          ? formatImportRoutesCopy(copy['importRoutes.zip.page.sourceTitle'], { source: sourceLabel })
          : copy['importRoutes.zip.page.title']
      }
      description={
        sourceLabel
          ? formatImportRoutesCopy(copy['importRoutes.zip.page.sourceDescription'], { source: sourceLabel })
          : copy['importRoutes.zip.page.description']
      }
    >
      <Form
        className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
        method="post"
        encType="multipart/form-data"
        onSubmit={(event) => {
          if (!canImport) {
            event.preventDefault();
          }
        }}
      >
        <FileArchive className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {sizeError ? (
          <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
            {sizeError}
          </p>
        ) : actionError ? (
          <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
            {actionError}
          </p>
        ) : null}
        <div className="grid gap-2 text-sm font-medium">
          <span>{copy['importRoutes.zip.form.archive']}</span>
          {/* Custom themed file picker (English) so the native browser button/label
              (localised, e.g. "Choisir un fichier / aucun fichier") never renders and
              the control can't push its intrinsic width past the card at 390. */}
          <input
            ref={fileInputRef}
            className="hidden"
            name="archive"
            type="file"
            accept=".zip"
            onChange={handleFileChange}
          />
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1.5 sm:flex-nowrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-11 shrink-0 rounded bg-bolt-elements-background-depth-3 px-3 py-2 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-borderColor focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              {copy['importRoutes.zip.form.chooseFile']}
            </button>
            <span className="min-w-0 flex-[1_1_12rem] break-all text-sm text-bolt-elements-textSecondary">
              {fileName || copy['importRoutes.zip.form.noFile']}
            </span>
          </div>
          <p className="text-xs font-normal text-bolt-elements-textTertiary">
            {formatImportRoutesCopy(copy['importRoutes.zip.form.limit'], {
              size: formatImportArchiveSize(MAX_ARCHIVE_BYTES, language),
            })}
          </p>
        </div>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          {copy['importRoutes.zip.form.projectName']}
          <input
            className="min-h-11 w-full max-w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
            name="name"
            placeholder={copy['importRoutes.zip.form.projectPlaceholder']}
          />
        </label>
        <div className="mt-5">
          <Button
            type="submit"
            className="min-h-11 w-full whitespace-normal sm:w-auto"
            disabled={!canImport}
            aria-busy={importing}
          >
            {importing ? copy['importRoutes.zip.form.importing'] : copy['importRoutes.zip.form.submit']}
          </Button>
          {importing ? (
            <div
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
              role="progressbar"
              aria-label={copy['importRoutes.zip.form.progress']}
            >
              <div className="h-full w-full animate-pulse rounded-full bg-[var(--vc-ide-accent-action)]" />
            </div>
          ) : null}
        </div>
      </Form>
    </AppShell>
  );
}
