import { Building2, ShieldCheck, Server, Network, Gauge, Headphones, CheckCircle, Send } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function ContactSales() {
  const enterpriseFeatures = [
    {
      icon: ShieldCheck,
      title: 'SSO & SAML',
      description: 'Connect Okta, Azure AD, or any SAML 2.0 identity provider with SCIM user provisioning',
    },
    {
      icon: Gauge,
      title: 'Custom Quotas',
      description: 'Tailored compute, workspace, and seat limits sized to how your teams actually build',
    },
    {
      icon: Server,
      title: 'Single-Tenant',
      description: 'Dedicated, isolated infrastructure for your organization with no shared workloads',
    },
    {
      icon: Network,
      title: 'VPC Peering',
      description: 'Private network connectivity so E-Code reaches your internal services securely',
    },
    {
      icon: Headphones,
      title: 'Dedicated Support',
      description: 'A named account team, priority response SLAs, and direct access to our engineers',
    },
    {
      icon: Building2,
      title: 'Procurement Ready',
      description: 'Security reviews, custom contracts, invoicing, and DPAs handled by our team',
    },
  ];

  const whatToExpect = [
    {
      title: 'Discovery call',
      description: 'A 30-minute conversation to understand your stack, security needs, and rollout goals',
    },
    {
      title: 'Tailored proposal',
      description: 'Quotas, deployment model, and pricing scoped to your team — no off-the-shelf tiers',
    },
    {
      title: 'Guided pilot',
      description: 'A hands-on trial with onboarding support so your developers can evaluate E-Code live',
    },
    {
      title: 'Rollout & onboarding',
      description: 'SSO wiring, workspace setup, and admin training to get every team productive fast',
    },
  ];

  const teamSizes = ['1–10', '11–50', '51–200', '201–500', '500+'];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-contact-sales">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-contact-sales">
                Talk to our sales team
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                E-Code Enterprise brings SSO/SAML, custom quotas, single-tenant deployments, VPC peering, and dedicated
                support to teams shipping software at scale.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Enterprise plan
              </Badge>
            </div>
          </div>
        </section>

        {/* Enterprise Features */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Built for Enterprise</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enterpriseFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4 text-primary" />
                      <h3 className="font-semibold mb-2">{feature.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* What to Expect */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">What to expect</h2>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {whatToExpect.map((step) => (
                <div key={step.title} className="flex gap-4">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-2">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Lead Form */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Contact sales</CardTitle>
                  <CardDescription>
                    Tell us about your team and we&apos;ll be in touch within one business day.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-6" data-testid="form-contact-sales">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label htmlFor="contact-name" className="text-[13px] font-medium">
                          Name
                        </label>
                        <input
                          id="contact-name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          placeholder="Ada Lovelace"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="contact-email" className="text-[13px] font-medium">
                          Work email
                        </label>
                        <input
                          id="contact-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@company.com"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="contact-company" className="text-[13px] font-medium">
                          Company
                        </label>
                        <input
                          id="contact-company"
                          name="company"
                          type="text"
                          autoComplete="organization"
                          placeholder="Acme Inc."
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="contact-team-size" className="text-[13px] font-medium">
                          Team size
                        </label>
                        <select
                          id="contact-team-size"
                          name="teamSize"
                          defaultValue=""
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="" disabled>
                            Select team size
                          </option>
                          {teamSizes.map((size) => (
                            <option key={size} value={size}>
                              {size} developers
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="contact-message" className="text-[13px] font-medium">
                        How can we help?
                      </label>
                      <textarea
                        id="contact-message"
                        name="message"
                        rows={4}
                        placeholder="Tell us about your use case, security requirements, or timeline."
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: 'var(--ecode-accent)' }}
                      data-testid="button-contact-sales-submit"
                    >
                      <Send className="h-4 w-4" />
                      Contact sales
                    </button>

                    <p className="text-[13px] text-muted-foreground text-center">
                      By submitting, you agree to be contacted about E-Code Enterprise. We&apos;ll never share your
                      details.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
