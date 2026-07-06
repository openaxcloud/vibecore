import { LegalArticle, LegalSection } from '~/components/marketing/ecode-exact/pages/LegalArticle';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function Enforcement() {
  return (
    <LegalArticle
      testId="page-enforcement"
      title="Enforcement Policy"
      lastUpdated={LEGAL_DATES.enforcement}
      intro={
        <p>
          This policy explains how E-Code responds when an account violates our <a href="/terms">Terms of Service</a>,{' '}
          <a href="/acceptable-use">Acceptable Use Policy</a>, or community standards. Enforcement is outcome-based and
          proportionate to the severity and recurrence of the violation — we do not operate a fixed numeric "strike
          count."
        </p>
      }
    >
      <LegalSection title="1. Enforcement actions">
        <p>Depending on severity, our Trust &amp; Safety team may take one or more of the following actions:</p>
        <ul className="list-disc pl-6 mt-4 space-y-2">
          <li>
            <strong>Warning.</strong> A notice that specific content or behavior violated our policies. We may unpublish
            or restrict the offending app while you correct the issue. Your workspace stays usable.
          </li>
          <li>
            <strong>Community restriction.</strong> You lose the ability to publish, share, or post apps publicly, but
            you can still use the IDE and your private projects.
          </li>
          <li>
            <strong>Account suspension.</strong> Sign-in is blocked and published apps are taken down. For severe or
            repeated violations, the account and its content may be permanently deleted.
          </li>
        </ul>
        <p>
          Egregious violations — such as hosting malware, CSAM, or active attacks — can result in immediate suspension
          without a prior warning.
        </p>
      </LegalSection>

      <LegalSection title="2. Factors we weigh">
        <ul className="list-disc pl-6 mt-4 space-y-2">
          <li>Severity and real-world harm of the violation.</li>
          <li>Whether the behavior is repeated or part of a pattern.</li>
          <li>Whether it appears intentional or the result of a mistake.</li>
          <li>Your response and willingness to remediate.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Appeals">
        <p>
          If you believe an enforcement action was made in error, you may appeal by emailing{' '}
          <a href="mailto:appeals@e-code.ai">appeals@e-code.ai</a>. Include your username, the action taken, and a clear
          explanation of why it should be reconsidered. We review appeals and respond with our decision.
        </p>
      </LegalSection>

      <LegalSection title="4. Reporting violations">
        <p>
          To report content or behavior that violates our policies, use <a href="/report-abuse">Report Abuse</a> or
          email <a href="mailto:abuse@e-code.ai">abuse@e-code.ai</a>. Copyright complaints are handled through our DMCA
          process.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
