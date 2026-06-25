import { Building2, ShieldCheck, Server, Network, Gauge, Headphones, CheckCircle, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useEcodeToast } from '~/components/marketing/ecode-exact/EcodeExactLandingControls';
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

export type ContactSalesLead = {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  message: string;
  pagePath: string;
};

type ContactSalesResponse = {
  success?: boolean;
  fallbackMailto?: string;
  error?: string;
};

export function buildContactSalesMailto(lead: ContactSalesLead) {
  const subject = `E-Code Enterprise inquiry${lead.company ? ` — ${lead.company}` : ''}`;

  const body = [
    lead.name ? `Name: ${lead.name}` : undefined,
    lead.email ? `Work email: ${lead.email}` : undefined,
    lead.company ? `Company: ${lead.company}` : undefined,
    lead.teamSize ? `Team size: ${lead.teamSize}` : undefined,
    lead.pagePath ? `Page path: ${lead.pagePath}` : undefined,
    '',
    'How can we help?',
    lead.message,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return `mailto:sales@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitContactSalesLead(lead: ContactSalesLead) {
  const response = await fetch('/api/contact/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(lead),
  });

  const data = (await response.json().catch(() => ({}))) as ContactSalesResponse;

  if (!response.ok) {
    if (data.fallbackMailto) {
      return { fallbackMailto: data.fallbackMailto };
    }

    throw new Error(data.error || 'Failed to submit your request.');
  }

  return data;
}

export default function ContactSales() {
  const { toast } = useEcodeToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const pagePath = typeof window !== 'undefined' ? window.location.pathname : '/contact-sales';

    const lead: ContactSalesLead = {
      name: String(formData.get('name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      company: String(formData.get('company') ?? '').trim(),
      teamSize: String(formData.get('teamSize') ?? '').trim(),
      message: String(formData.get('message') ?? '').trim(),
      pagePath,
    };

    try {
      const result = await submitContactSalesLead(lead);

      if (result.fallbackMailto) {
        if (typeof window !== 'undefined') {
          window.location.href = result.fallbackMailto || buildContactSalesMailto(lead);
        }

        toast({
          title: 'Opening email client',
          description: 'Your details were prepared for sales@e-code.ai.',
        });
      } else {
        toast({
          title: 'Request received',
          description: 'Thanks for reaching out. Our sales team will be in touch within one business day.',
        });
        formElement.reset();
      }
    } catch (error) {
      /*
       * No contact-sales intake backend is wired yet (the POST 404s in dev/prod),
       * and even once it exists it may reject or be unreachable. Rather than
       * silently dropping the lead — the original bug, where the native form did
       * a GET navigation and lost everything — fall back to a client-built mailto
       * so the prospect can still reach sales@e-code.ai with their message intact.
       */
      if (typeof window !== 'undefined') {
        window.location.href = buildContactSalesMailto(lead);
      }

      toast({
        title: 'Opening email client',
        description:
          error instanceof Error
            ? `${error.message} We've prepared your request for sales@e-code.ai instead.`
            : "We couldn't reach the server, so we've prepared your request for sales@e-code.ai instead.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-contact-sales">
                Talk to our sales team
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
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
            <h2 className="mkt-h2 font-bold text-center mb-12">Built for Enterprise</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enterpriseFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4 text-primary" />
                      <h3 className="mkt-h3 font-semibold mb-2">{feature.title}</h3>
                      <p className="mkt-body text-muted-foreground">{feature.description}</p>
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
            <h2 className="mkt-h2 font-bold text-center mb-12">What to expect</h2>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {whatToExpect.map((step) => (
                <div key={step.title} className="flex gap-4">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="mkt-h3 font-semibold mb-2">{step.title}</h3>
                    <p className="mkt-body text-muted-foreground">{step.description}</p>
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
                  <form className="space-y-6" onSubmit={handleSubmit} data-testid="form-contact-sales">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label htmlFor="contact-name" className="mkt-small font-medium">
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
                        <label htmlFor="contact-email" className="mkt-small font-medium">
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
                        <label htmlFor="contact-company" className="mkt-small font-medium">
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
                        <label htmlFor="contact-team-size" className="mkt-small font-medium">
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
                      <label htmlFor="contact-message" className="mkt-small font-medium">
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
                      disabled={isSubmitting}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] hover:opacity-90 transition-opacity disabled:opacity-60 disabled:pointer-events-none"
                      style={{ backgroundColor: 'var(--ecode-accent)' }}
                      data-testid="button-contact-sales-submit"
                    >
                      {isSubmitting ? (
                        <>Sending...</>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Contact sales
                        </>
                      )}
                    </button>

                    <p className="mkt-small text-muted-foreground text-center">
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
