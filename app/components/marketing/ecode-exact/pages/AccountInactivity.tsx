import { LegalArticle, LegalSection } from '~/components/marketing/ecode-exact/pages/LegalArticle';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function AccountInactivity() {
  return (
    <LegalArticle
      testId="page-account-inactivity"
      title="Account Inactivity Policy"
      lastUpdated={LEGAL_DATES.accountInactivity}
      intro={
        <p>
          To keep the platform secure and to free unused resources, E-Code may remove free accounts that have been
          inactive for an extended period. This policy explains what counts as inactivity, the notice you receive, and
          how to keep your account active.
        </p>
      }
    >
      <LegalSection title="1. Inactivity period">
        <p>
          A <strong>free</strong> account with no sign-in activity for <strong>one (1) year</strong> is considered
          inactive and may be terminated. When an account is terminated for inactivity, its content — including E-Code
          Apps, deployments, and stored data — may be permanently deleted.
        </p>
      </LegalSection>

      <LegalSection title="2. Paid accounts are exempt">
        <p>
          Accounts with an active paid subscription (Core, Pro, or Enterprise) are <strong>not</strong> subject to the
          inactivity policy and will not be removed for inactivity while the subscription remains active.
        </p>
      </LegalSection>

      <LegalSection title="3. What counts as activity">
        <p>
          Signing in to E-Code resets the inactivity clock. Simply having published apps or stored data does not, on its
          own, count as activity.
        </p>
      </LegalSection>

      <LegalSection title="4. Notice and keeping your account">
        <p>
          Before any deletion for inactivity, we send advance notice to the email address on the account. To keep your
          account active, simply sign in. If you want to preserve a project you no longer use, export it or download
          your data before the inactivity period elapses. Deletion for inactivity is irreversible.
        </p>
        <p>
          For questions, contact <a href="mailto:support@e-code.ai">support@e-code.ai</a>.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
