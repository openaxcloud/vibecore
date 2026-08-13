import { FileText } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Card, CardContent } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function CommercialAgreement() {
  return (
    <div className="min-h-screen flex flex-col" data-testid="page-commercial-agreement">
      <PublicNavbar />

      <main className="flex-1">
        <div className="container-responsive py-responsive">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold" data-testid="heading-commercial-agreement">
                Commercial Agreement
              </h1>
            </div>
            <p className="text-[15px] text-muted-foreground mb-8">Last updated: {LEGAL_DATES.commercialAgreement}</p>

            <Card className="mb-8">
              <CardContent className="pt-6">
                <p className="text-[15px] text-muted-foreground">
                  This Commercial Agreement (the "Agreement") governs your purchase and use of paid plans,
                  subscriptions, and enterprise services offered by E-Code (operated by Snatch Group Limited, "E-Code",
                  "we", "us"). It supplements our Terms of Service and applies whenever you subscribe to a paid plan or
                  sign an order form referencing this Agreement. Capitalized terms not defined here have the meaning
                  given in the Terms of Service.
                </p>
              </CardContent>
            </Card>

            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">1. Scope</h2>
                <p>
                  This Agreement covers E-Code's cloud development platform, AI agents, workspaces, deployment services,
                  and related support (collectively, the "Services") that you access under a paid plan. The specific
                  Services, usage limits, and pricing applicable to you are set out in your selected plan or in a
                  separately executed order form. Where an order form conflicts with this Agreement, the order form
                  controls for the affected subject matter.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">2. Subscription &amp; Fees</h2>
                <p>
                  Subscriptions are offered on a recurring basis (monthly or annual) and renew automatically at the end
                  of each billing cycle unless cancelled before the renewal date. Fees are based on the plan tier you
                  select and any metered usage, including additional seats, compute, storage, and AI usage beyond your
                  plan's included allowances.
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>Plan prices and included allowances are published on our pricing page or in your order form.</li>
                  <li>Metered overages are charged at the rates in effect for your plan at the time of use.</li>
                  <li>We may change list prices with at least 30 days' notice, effective on your next renewal.</li>
                  <li>
                    All fees are exclusive of taxes, which you are responsible for unless you provide a valid exemption.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">3. Payment Terms</h2>
                <p>
                  Fees are due in advance for each billing cycle and are charged to your designated payment method
                  through our payment processor. For invoiced enterprise accounts, payment is due within 30 days of the
                  invoice date unless otherwise agreed in writing.
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>Recurring charges are processed automatically on each renewal date.</li>
                  <li>Failed payments may result in suspension of paid features until the balance is settled.</li>
                  <li>
                    Except where required by law, fees are non-refundable and unused allowances do not carry over.
                  </li>
                  <li>
                    Past-due invoices may accrue interest at the lower of 1.5% per month or the maximum allowed by law.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">4. Service Levels</h2>
                <p>
                  We aim to make the Services available with a target monthly uptime of 99.9%, excluding scheduled
                  maintenance and events outside our reasonable control. Enterprise plans may include a separate service
                  level agreement with defined response times and service credits. Service credits, where applicable,
                  are your sole and exclusive remedy for availability shortfalls. We provide support through the
                  channels and during the hours described for your plan tier.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">5. Data Processing</h2>
                <p>
                  We process your code, project content, and personal data only as necessary to provide the Services and
                  in accordance with our Privacy Policy. Where we act as a processor of personal data on your behalf,
                  our Data Processing Addendum governs that processing and is incorporated into this Agreement by
                  reference.
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>You retain ownership of all code and data you create or upload to the Services.</li>
                  <li>We apply encryption in transit and at rest and maintain industry-standard security controls.</li>
                  <li>We do not use your private project content to train shared models without your consent.</li>
                  <li>You can export your projects and data in standard formats at any time during the term.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">6. Confidentiality</h2>
                <p>
                  Each party may receive confidential information from the other in connection with this Agreement. The
                  receiving party will use such information only to perform under this Agreement, protect it with at
                  least the same care it uses for its own confidential information, and not disclose it to third parties
                  except to personnel and contractors bound by similar obligations. Confidentiality obligations do not
                  apply to information that is public through no fault of the receiving party, independently developed,
                  or rightfully obtained from another source.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">7. Liability</h2>
                <p>
                  To the maximum extent permitted by law, neither party is liable for indirect, incidental, special,
                  consequential, or punitive damages, or for lost profits, revenue, or data, arising out of or relating
                  to this Agreement. Except for liability arising from a party's breach of confidentiality, indemnity
                  obligations, or amounts owed under this Agreement, each party's total aggregate liability is limited
                  to the fees paid or payable by you for the Services in the 12 months preceding the event giving rise
                  to the claim. The Services are otherwise provided on an "as is" and "as available" basis.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">8. Term &amp; Termination</h2>
                <p>
                  This Agreement begins when you subscribe to a paid plan and continues for the duration of your
                  subscription, including renewals. Either party may terminate for material breach if the breach remains
                  uncured 30 days after written notice.
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li>
                    You may cancel renewal at any time; cancellation takes effect at the end of the current cycle.
                  </li>
                  <li>We may suspend or terminate access for non-payment or violation of the Terms of Service.</li>
                  <li>Upon termination, your right to use the Services ends and accrued fees become payable.</li>
                  <li>We retain your data for a limited period after termination to allow export before deletion.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">9. Governing Law</h2>
                <p>
                  This Agreement is governed by the laws of the State of Israel, without regard to its conflict-of-laws
                  rules. The competent courts located in Tel Aviv, Israel will have exclusive jurisdiction over any
                  dispute arising out of or relating to this Agreement, except that either party may seek injunctive
                  relief in any court of competent jurisdiction to protect its intellectual property or confidential
                  information.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mt-8 mb-4">10. Contact</h2>
                <p>For questions about this Commercial Agreement, please contact us at:</p>
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p>E-Code — Snatch Group Limited</p>
                  <p>Email: legal@e-code.ai</p>
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
