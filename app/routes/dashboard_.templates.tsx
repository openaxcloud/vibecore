import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { useActionData } from 'react-router';
import { AppShell, LinkButton, TemplateGallery, templates } from '~/components/dashboard/SaaSLayout';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  translateUserAreaMessage,
  userAreaEn,
  userAreaFr,
  type UserAreaTranslationKey,
} from '~/lib/i18n/catalogs/user-area';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? userAreaFr : userAreaEn)['workspaceTemplates.metaTitle'] },
];

type Project = { id: string; slug?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const { language } = resolveRequestLocale(request);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return { language };
}

export async function action({ request }: EnterpriseActionArgs) {
  const { language } = resolveRequestLocale(request);
  const body = formObject(await request.formData()) as { templateName?: string; name?: string };
  const selectedTemplate = templates.find((template) => template.id === body.templateName);

  if (!selectedTemplate) {
    return { errorKey: 'workspaceTemplates.unavailable' as const };
  }

  const slug = `${selectedTemplate.id}-${Date.now().toString(36)}`;

  try {
    const organization = await firstOrganization(request);

    const result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/from-template`, {
      method: 'POST',
      body: JSON.stringify({
        name: body.name?.trim() || selectedTemplate.name,
        slug,
        templateName: selectedTemplate.id,
        description: translateUserAreaMessage(language, 'workspaceTemplates.createdDescription', {
          template: translateUserAreaMessage(language, selectedTemplate.nameKey),
        }),
      }),
    });

    return redirect(
      projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
    );
  } catch (error) {
    /*
     * apiRequest throws a real 3xx redirect Response when the session expired or
     * MFA is required mid-action; those (and 5xx server errors) must be re-thrown
     * so the framework / error boundary handles them instead of the action
     * swallowing the redirect into a broken inline error. Routine 4xx failures —
     * project-quota / plan-limit / validation rejections — render inline.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      const errorKey =
        error.status === 402 || error.status === 429
          ? ('workspaceTemplates.quotaReached' as const)
          : error.status === 400 || error.status === 422
            ? ('workspaceTemplates.invalidRequest' as const)
            : error.status === 409
              ? ('workspaceTemplates.conflict' as const)
              : ('workspaceTemplates.createFailed' as const);

      return json({ errorKey }, { status: error.status });
    }

    throw error;
  }
}

export default function DashboardTemplatesPage() {
  const { t } = useTranslation();
  const actionData = useActionData<typeof action>() as { errorKey?: UserAreaTranslationKey } | undefined;

  return (
    <AppShell
      title={t('workspaceTemplates.title')}
      description={t('workspaceTemplates.description')}
      actions={
        <>
          <LinkButton to="/import/empty" variant="outline">
            {t('workspaceTemplates.emptyProject')}
          </LinkButton>
          <LinkButton to="/import" variant="outline">
            {t('workspaceTemplates.import')}
          </LinkButton>
        </>
      }
    >
      {actionData?.errorKey ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]"
        >
          {t(actionData.errorKey)}
        </p>
      ) : null}
      {/* BUG-USR-007: section landmark so heading order is h1→h2→h3 (template cards
          are h3); sr-only keeps the visual design unchanged. */}
      <h2 className="sr-only">{t('workspaceTemplates.listHeading')}</h2>
      <TemplateGallery mode="authenticated" />
    </AppShell>
  );
}
