import { LegalArticle, LegalSection } from '~/components/marketing/ecode-exact/pages/LegalArticle';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function DataDeletion() {
  return (
    <LegalArticle
      testId="page-data-deletion"
      title="Deleting Your Data"
      lastUpdated={LEGAL_DATES.dataDeletion}
      intro={
        <p>
          You own your content and can delete it at any time. This page explains how to delete individual projects, how
          to delete your entire account, what gets removed, and how to make a deletion request. For how we handle
          personal data generally, see our <a href="/privacy">Privacy Policy</a>.
        </p>
      }
    >
      <LegalSection title="1. Deleting a single project">
        <p>
          Open the project, go to its settings, and choose <strong>Delete project</strong>. This removes the project's
          files, deployments, and associated database. Deleting a project does not delete your account.
        </p>
      </LegalSection>

      <LegalSection title="2. Deleting your account">
        <p>To permanently delete your E-Code account and all associated content:</p>
        <ol className="list-decimal pl-6 mt-4 space-y-2">
          <li>
            Go to <strong>Settings → Account → Billing</strong>.
          </li>
          <li>
            Select <strong>Delete account</strong>, then <strong>Request account deletion</strong>.
          </li>
          <li>Confirm the request to start the deletion.</li>
        </ol>
      </LegalSection>

      <LegalSection title="3. What gets deleted">
        <p>Account deletion removes:</p>
        <ul className="list-disc pl-6 mt-4 space-y-2">
          <li>All Apps, templates, deployments, and stored files.</li>
          <li>Databases and object-storage buckets attached to your projects.</li>
          <li>Community posts and shared links you created.</li>
          <li>Personal information associated with the account, subject to the retention notes below.</li>
        </ul>
        <p>
          Deletion is <strong>irreversible</strong>. Export anything you want to keep before you confirm.
        </p>
      </LegalSection>

      <LegalSection title="4. Retention and exceptions">
        <p>
          After deletion, content is purged from active systems. Limited records may be retained only where required to
          comply with legal obligations, resolve disputes, prevent fraud or abuse, or complete billing and tax
          accounting. Residual copies in encrypted backups are removed on our standard backup-rotation schedule.
        </p>
      </LegalSection>

      <LegalSection title="5. Requesting deletion or a data export">
        <p>
          If you cannot access the in-product flow, you can request deletion or a copy of your data by emailing{' '}
          <a href="mailto:privacy@e-code.ai">privacy@e-code.ai</a> from the address on your account. We verify the
          request before acting on it.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
