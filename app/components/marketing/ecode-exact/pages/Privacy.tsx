import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col" data-testid="page-privacy">
      <PublicNavbar />

      <main className="flex-1">
        <div className="container-responsive py-responsive">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-8" data-testid="heading-privacy">
              Privacy Policy
            </h1>

            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
              <section>
                <p className="text-[15px] text-muted-foreground">Last updated: {LEGAL_DATES.privacy}</p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">Information We Collect</h2>
                <p>
                  We collect information you provide directly to us, such as when you create an account, use our
                  services, or contact us for support.
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>Account information (name, email, password)</li>
                  <li>Profile information (avatar, bio, location)</li>
                  <li>Content you create (code, comments, posts)</li>
                  <li>Communication data (support tickets, feedback)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">How We Use Your Information</h2>
                <p>We use the information we collect to:</p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>Provide, maintain, and improve our services</li>
                  <li>Process transactions and send related information</li>
                  <li>Send technical notices and support messages</li>
                  <li>Respond to your comments and questions</li>
                  <li>Monitor and analyze trends and usage</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">Information Sharing</h2>
                <p>
                  We do not sell, trade, or rent your personal information to third parties. We may share your
                  information in certain situations:
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>With your consent</li>
                  <li>To comply with legal obligations</li>
                  <li>To protect our rights and safety</li>
                  <li>With service providers who assist our operations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">Data Security</h2>
                <p>
                  We implement appropriate technical and organizational measures to protect your personal information
                  against unauthorized access, alteration, disclosure, or destruction.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">Your Rights</h2>
                <p>You have the right to:</p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>Access your personal information</li>
                  <li>Correct inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Object to data processing</li>
                  <li>Data portability</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">Contact Us</h2>
                <p>If you have questions about this Privacy Policy, please contact us at:</p>
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p>E-Code.AI (Snatch Group Limited)</p>
                  <p>Email: privacy@e-code.ai</p>
                  <p>Address: Abba Eban 8 Blvd, 46120 Herzliya Pituach, Israel</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
