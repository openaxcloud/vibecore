import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import { requireBillingEnabled } from '~/lib/billing/require-billing-enabled.server';
import { json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { getPlanQuotaCopy } from '~/lib/i18n/catalogs/plan-quota';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

const QUOTA_EXCEEDED_CANONICAL_URL = 'https://e-code.ai/quota-exceeded';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getPlanQuotaCopy(language);
  const title = copy['quotaExceeded.meta.title'];
  const description = copy['quotaExceeded.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: QUOTA_EXCEEDED_CANONICAL_URL },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: QUOTA_EXCEEDED_CANONICAL_URL },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: `${QUOTA_EXCEEDED_CANONICAL_URL}?lang=en`,
    },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: `${QUOTA_EXCEEDED_CANONICAL_URL}?lang=fr`,
    },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: QUOTA_EXCEEDED_CANONICAL_URL },
  ];
};

export function loader({ request }: EnterpriseLoaderArgs) {
  // KILL-SWITCH FACTURATION : à OFF cette surface n'existe pas (404 sec).
  requireBillingEnabled();

  const localeResolution = resolveRequestLocale(request);

  return json({ language: localeResolution.language }, { headers: localeResponseHeaders(request, localeResolution) });
}

const QUOTA_ACTION_CLASS =
  'inline-flex min-h-11 w-full items-center justify-center whitespace-normal break-words rounded-md px-4 py-2 text-center text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus sm:w-auto';

export default function QuotaExceededPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getPlanQuotaCopy(language);

  return (
    <EnterpriseFormPage title={copy['quotaExceeded.page.title']} description={copy['quotaExceeded.page.description']}>
      <div className="min-w-0 space-y-4">
        <p className="break-words text-sm text-bolt-elements-textSecondary">{copy['quotaExceeded.guidance']}</p>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            to="/upgrade"
            className={`${QUOTA_ACTION_CLASS} bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:opacity-90`}
          >
            {copy['quotaExceeded.action.upgrade']}
          </Link>
          <Link
            to="/plan-comparison"
            className={`${QUOTA_ACTION_CLASS} border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:border-bolt-elements-focus`}
          >
            {copy['quotaExceeded.action.compare']}
          </Link>
        </div>
      </div>
    </EnterpriseFormPage>
  );
}
