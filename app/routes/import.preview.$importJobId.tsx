import { FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatImportHubCopy, getImportHubCopy, type ImportHubCopy } from '~/lib/i18n/catalogs/import-hub';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { getImportHubProvider } from '~/lib/import-hub';
import { isReauthRedirect } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

/*
 * TPL-02.3 — the per-connector PREVIEW screen.
 *
 * The import backend already stages into a disposable area, scans it read-only
 * and refuses to commit while a finding is undecided. What was missing was the
 * surface that lets a human SEE that before anything is written. This route is
 * that surface, and it is deliberately the only step between staging and the
 * atomic commit.
 *
 * Two properties matter and are load-bearing here:
 *   - it NEVER shows file content, only paths and sizes, so the preview cannot
 *     become a second way to read the secret the scanner just flagged (finding
 *     previews are already redacted server-side);
 *   - it NEVER reports an import that did not happen — the project appears only
 *     after the commit returns 201.
 */

type PreviewFinding = {
  path: string;
  line: number;
  kind: 'env-secret' | 'private-key' | 'provider-token' | 'high-entropy';
  preview: string;
};

/*
 * Forme RÉELLE de `GET /orgs/:orgId/imports/:importJobId` : la route étale la
 * ligne de job et place l'aperçu dans un sous-objet `preview`, qui vaut `null`
 * dès que la copie jetable est disposée (commit, annulation, expiration,
 * rollback). Lire l'aperçu à plat sur `import` renvoyait `undefined` et faisait
 * planter l'écran sur `.length` — attrapé en live le 2026-08-13.
 */
type PreviewPayload = {
  import: {
    id: string;
    state: string;
    provider: string;
    sourceRef?: string | null;
    preview: {
      findings: PreviewFinding[];
      stagedFileCount: number;
      stagedFiles: Array<{ path: string; sizeBytes: number }>;
      requiresConsent: boolean;
    } | null;
  };
};

type ImportPreviewErrorCode = 'unresolved' | 'stagingGone' | 'commitFailed';
type ImportPreviewActionData = { errorCode: ImportPreviewErrorCode };

/** Stable form field name for one finding's decision. */
export function consentFieldName(finding: { path: string; line: number }): string {
  return `consent:${finding.path}:${finding.line}`;
}

/**
 * Rebuild the API's consent map from the submitted form. The API keys consent
 * by `path:line` (findingKey), so the field name carries both and the shape is
 * reconstructed without a second round-trip. Anything that is not an explicit
 * `keep`/`redact` is dropped rather than guessed — an undecided finding must
 * keep blocking the commit, which is exactly what the server gate enforces.
 */
export function consentFromForm(body: Record<string, unknown>): Record<string, 'keep' | 'redact'> {
  const consent: Record<string, 'keep' | 'redact'> = {};

  for (const [field, value] of Object.entries(body)) {
    if (!field.startsWith('consent:')) {
      continue;
    }

    if (value === 'keep' || value === 'redact') {
      consent[field.slice('consent:'.length)] = value;
    }
  }

  return consent;
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getImportHubCopy(data?.language ?? rootData?.language);

  return [{ title: copy['importHub.preview.metaTitle'] }];
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  const importJobId = params.importJobId ?? '';

  /*
   * A staging that is gone (expired, cancelled, already committed) is NOT an
   * empty preview — rendering "0 file" there would read as "nothing to import"
   * instead of "this is over". Send the user back to the hub with the reason.
   */
  let payload: PreviewPayload;

  try {
    payload = await apiRequest<PreviewPayload>(request, `/orgs/${organization.id}/imports/${importJobId}`);
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    throw new Response(null, { status: error instanceof Response ? error.status : 404 });
  }

  /*
   * `preview: null` = la copie jetable a été disposée. Il n'y a plus rien à
   * décider, et afficher « 0 fichier » se lirait comme « un import vide » :
   * on renvoie l'utilisateur au hub avec la raison.
   */
  if (!payload.import.preview) {
    return redirect('/import?staging=gone');
  }

  return json(
    {
      language: localeResolution.language,
      organizationSlug: organization.slug,
      state: payload.import.state,
      sourceRef: payload.import.sourceRef ?? null,
      preview: payload.import.preview,
      providerLabel:
        getImportHubProvider(payload.import.provider, localeResolution.language)?.label ?? payload.import.provider,
    },
    { headers: localeResponseHeaders(request, localeResolution) },
  );
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const importJobId = params.importJobId ?? '';

  const actionError = (errorCode: ImportPreviewErrorCode, status: number) =>
    json<ImportPreviewActionData>({ errorCode }, { status, headers: localeResponseHeaders(request, localeResolution) });

  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  const body = formObject(await request.formData());

  if (body.intent === 'cancel') {
    await apiRequest(request, `/orgs/${organization.id}/imports/${importJobId}/cancel`, { method: 'POST' }).catch(
      () => undefined,
    );

    return redirect('/import');
  }

  try {
    const result = await apiRequest<{ project: { id: string; slug?: string } }>(
      request,
      `/orgs/${organization.id}/imports/${importJobId}/commit`,
      { method: 'POST', body: JSON.stringify({ consent: consentFromForm(body) }) },
    );

    return redirect(
      projectIdePath({
        id: result.project.id,
        slug: result.project.slug,
        organizationSlug: organization.slug,
      }),
    );
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    const status = error instanceof Response ? error.status : 500;

    /*
     * 409 covers both "a finding is still undecided" and "the staging is gone".
     * They are different stories for the user — one is fixable in place, the
     * other means starting over — so they are surfaced separately.
     */
    if (status === 409) {
      const code = (error as Response & { code?: string }).code;
      return actionError(code === 'IMPORT_STAGING_GONE' ? 'stagingGone' : 'unresolved', status);
    }

    return actionError('commitFailed', status);
  }
}

function FindingRow({ finding, copy }: { finding: PreviewFinding; copy: ImportHubCopy }) {
  const field = consentFieldName(finding);

  return (
    <li className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <p className="break-words text-sm font-medium">{copy[`importHub.preview.findingKind.${finding.kind}`]}</p>
      <p className="mt-1 break-words text-xs text-bolt-elements-textTertiary">
        {formatImportHubCopy(copy['importHub.preview.findingLocation'], {
          path: finding.path,
          line: finding.line,
        })}
      </p>
      {/* Already redacted server-side — this is a preview, never the raw value. */}
      <code className="mt-2 block max-w-full overflow-x-auto whitespace-pre rounded bg-bolt-elements-background-depth-2 px-2 py-1 text-xs">
        {finding.preview}
      </code>
      <fieldset className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="radio" name={field} value="redact" defaultChecked />
          {copy['importHub.preview.decision.redact']}
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="radio" name={field} value="keep" />
          {copy['importHub.preview.decision.keep']}
        </label>
      </fieldset>
    </li>
  );
}

export default function ImportPreviewPage() {
  const { preview, providerLabel, sourceRef } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const copy = getImportHubCopy(i18n.resolvedLanguage ?? i18n.language);
  const actionData = useActionData<typeof action>() as ImportPreviewActionData | undefined;
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';
  const hasFindings = preview.findings.length > 0;

  return (
    <AppShell title={copy['importHub.preview.title']} description={copy['importHub.preview.description']}>
      <Form
        method="post"
        className="min-w-0 w-full max-w-full overflow-x-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
      >
        {actionData?.errorCode ? (
          <p role="alert" className="mb-4 break-words text-sm text-[var(--status-error-text)]">
            {copy[`importHub.preview.error.${actionData.errorCode}`]}
          </p>
        ) : null}

        <p className="break-words text-sm text-bolt-elements-textSecondary">
          <span className="font-medium">{copy['importHub.preview.source']}</span> — {providerLabel}
          {sourceRef ? ` · ${formatImportHubCopy(copy['importHub.preview.sourceRef'], { ref: sourceRef })}` : ''}
        </p>

        <h2 className="mt-5 flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          {formatImportHubCopy(copy['importHub.preview.filesHeading'], { count: preview.stagedFileCount })}
        </h2>
        {preview.stagedFiles.length === 0 ? (
          <p className="mt-2 text-sm text-bolt-elements-textTertiary">{copy['importHub.preview.filesEmpty']}</p>
        ) : (
          <ul className="mt-2 max-h-72 overflow-y-auto rounded-md border border-bolt-elements-borderColor">
            {preview.stagedFiles.map((file) => (
              <li
                key={file.path}
                className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-b border-bolt-elements-borderColor px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 break-all text-sm">{file.path}</span>
                <span className="shrink-0 text-xs text-bolt-elements-textTertiary">
                  {formatImportHubCopy(copy['importHub.preview.fileSize'], { bytes: file.sizeBytes })}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold">
          {hasFindings ? (
            <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--status-error-text)]" aria-hidden />
          ) : (
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {copy['importHub.preview.scanHeading']}
        </h2>
        {hasFindings ? (
          <>
            <p role="status" className="mt-2 break-words text-sm text-bolt-elements-textSecondary">
              {formatImportHubCopy(copy['importHub.preview.scanFound'], { count: preview.findings.length })}
            </p>
            <ul className="mt-3 grid gap-3">
              {preview.findings.map((finding) => (
                <FindingRow key={consentFieldName(finding)} finding={finding} copy={copy} />
              ))}
            </ul>
            <p className="mt-2 text-xs text-bolt-elements-textTertiary">{copy['importHub.preview.redactedNote']}</p>
          </>
        ) : (
          <p role="status" className="mt-2 break-words text-sm text-bolt-elements-textSecondary">
            {copy['importHub.preview.scanClean']}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="submit"
            name="intent"
            value="commit"
            className="min-h-11 w-full whitespace-normal sm:w-auto"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? copy['importHub.preview.submitting'] : copy['importHub.preview.submit']}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="cancel"
            variant="secondary"
            className="min-h-11 w-full whitespace-normal sm:w-auto"
            disabled={submitting}
          >
            {copy['importHub.preview.cancel']}
          </Button>
        </div>
      </Form>
    </AppShell>
  );
}
