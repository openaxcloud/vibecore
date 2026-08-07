import { useTranslation } from 'react-i18next';

import { LocalizedPolicyArticle } from '~/components/marketing/ecode-exact/pages/LocalizedPolicyArticle';
import {
  getMarketingExactGuidesPoliciesCopy,
  type PolicyLinkId,
} from '~/lib/i18n/catalogs/marketing-exact-guides-policies';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function Enforcement() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const catalog = getMarketingExactGuidesPoliciesCopy(language);

  const links: Record<PolicyLinkId, string> = {
    privacy: '/privacy',
    privacyEmail: `mailto:${catalog.policyContacts.dataDeletionEmail}`,
    terms: '/terms',
    acceptableUse: '/acceptable-use',
    appealsEmail: `mailto:${catalog.policyContacts.appealsEmail}`,
    reportAbuse: '/report-abuse',
    abuseEmail: `mailto:${catalog.policyContacts.abuseEmail}`,
  };

  return (
    <LocalizedPolicyArticle
      copy={catalog.exactEnforcement}
      headingTestId="heading-enforcement"
      language={language}
      lastUpdated={formatLegalMonthYear(LEGAL_DATES.enforcement, language)}
      links={links}
      testId="page-enforcement"
    />
  );
}
