import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col" data-testid="page-terms">
      <PublicNavbar />

      <main className="flex-1">
        <div className="container-responsive py-responsive">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-8" data-testid="heading-terms">
              Terms of Service
            </h1>

            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
              <section>
                <p className="text-[15px] text-muted-foreground">Last updated: {LEGAL_DATES.terms}</p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
                <p>
                  By accessing and using E-Code ("Service"), you accept and agree to be bound by the terms and provision
                  of this agreement. If you do not agree to abide by the above, please do not use this service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">2. Use License</h2>
                <p>
                  Permission is granted to temporarily use E-Code for personal, non-commercial transitory viewing only.
                  This is the grant of a license, not a transfer of title, and under this license you may not:
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>modify or copy the materials</li>
                  <li>use the materials for any commercial purpose or for any public display</li>
                  <li>attempt to reverse engineer any software contained on E-Code</li>
                  <li>remove any copyright or other proprietary notations from the materials</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">3. User Accounts</h2>
                <p>
                  When you create an account with us, you must provide information that is accurate, complete, and
                  current at all times. You are responsible for safeguarding the password and for all activities that
                  occur under your account.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">4. Prohibited Uses</h2>
                <p>You may not use our Service:</p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>For any unlawful purpose or to solicit others to perform unlawful acts</li>
                  <li>
                    To violate any international, federal, provincial, or state regulations, rules, laws, or local
                    ordinances
                  </li>
                  <li>
                    To infringe upon or violate our intellectual property rights or the intellectual property rights of
                    others
                  </li>
                  <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
                  <li>To submit false or misleading information</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">5. Content</h2>
                <p>
                  Our Service allows you to post, link, store, share and otherwise make available certain information,
                  text, graphics, videos, or other material ("Content"). You are responsible for Content that you post
                  on or through Service, including its legality, reliability, and appropriateness.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">6. Privacy Policy</h2>
                <p>
                  Your use of our Service is also governed by our Privacy Policy. Please review our Privacy Policy,
                  which also governs the Site and informs users of our data collection practices.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">7. Termination</h2>
                <p>
                  We may terminate or suspend your account and bar access to Service immediately, without prior notice
                  or liability, under our sole discretion, for any reason whatsoever and without limitation, including
                  but not limited to a breach of Terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">8. Disclaimer</h2>
                <p>
                  The information on this website is provided on an "as is" basis. To the fullest extent permitted by
                  law, E-Code:
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>excludes all representations and warranties relating to this website and its contents</li>
                  <li>
                    excludes all liability for damages arising out of or in connection with your use of this website
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">9. Contact Information</h2>
                <p>If you have any questions about these Terms, please contact us at:</p>
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
