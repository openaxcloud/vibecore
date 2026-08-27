import { Building2, ShieldCheck, Server, Network, Gauge, Headphones, CheckCircle, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
import { FieldError, FormErrorSummary, fieldErrorProps } from '~/components/ui/FieldError';
import {
  getMarketingExactCompanyCopy,
  marketingExactCompanyEn,
  type ContactSalesMailtoCopy,
  type ContactSalesValidationCopy,
  type EnterpriseFeatureId,
} from '~/lib/i18n/catalogs/marketing-exact-company';

export type ContactSalesLead = {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  message: string;
  pagePath: string;
};

type ContactSalesResponse = {
  ok?: boolean;
  success?: boolean;

  /** Reference number allocated by the API (from the stored lead's id). */
  reference?: string;
  fallbackMailto?: string;
  error?: string;
};

type ContactSalesField = 'name' | 'email' | 'company' | 'message';

const CONTACT_FIELD_PREFIX = 'contact';

const FIELD_IDS: Record<ContactSalesField, string> = {
  name: 'contact-name',
  email: 'contact-email',
  company: 'contact-company',
  message: `${CONTACT_FIELD_PREFIX}-message`,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEAM_SIZES = ['1–10', '11–50', '51–200', '201–500', '500+'] as const;

const FEATURE_ICONS: Record<EnterpriseFeatureId, LucideIcon> = {
  sso: ShieldCheck,
  quotas: Gauge,
  singleTenant: Server,
  vpc: Network,
  support: Headphones,
  procurement: Building2,
};

export function validateContactSalesField(
  field: ContactSalesField,
  value: string,
  copy: ContactSalesValidationCopy = marketingExactCompanyEn.exactContactSales.validation,
): string | undefined {
  const trimmed = value.trim();

  switch (field) {
    case 'name':
      return trimmed ? undefined : copy.nameRequired;
    case 'email': {
      if (!trimmed) {
        return copy.emailRequired;
      }

      return EMAIL_PATTERN.test(trimmed) ? undefined : copy.emailInvalid;
    }
    case 'company':
      return trimmed ? undefined : copy.companyRequired;
    case 'message':
      return trimmed ? undefined : copy.messageRequired;
    default:
      return undefined;
  }
}

export function buildContactSalesMailto(
  lead: ContactSalesLead,
  copy: ContactSalesMailtoCopy = marketingExactCompanyEn.exactContactSales.mailto,
) {
  const subject = `${copy.subject}${lead.company ? ` — ${lead.company}` : ''}`;

  const body = [
    lead.name ? `${copy.name}: ${lead.name}` : undefined,
    lead.email ? `${copy.email}: ${lead.email}` : undefined,
    lead.company ? `${copy.company}: ${lead.company}` : undefined,
    lead.teamSize ? `${copy.teamSize}: ${lead.teamSize}` : undefined,
    lead.pagePath ? `${copy.pagePath}: ${lead.pagePath}` : undefined,
    '',
    copy.message,
    lead.message,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return `mailto:sales@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitContactSalesLead(lead: ContactSalesLead, honeypot: string, fallbackError: string) {
  const response = await fetch('/api/contact/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ ...lead, website: honeypot }),
  });

  const data = (await response.json().catch(() => ({}))) as ContactSalesResponse;

  if (!response.ok) {
    if (data.fallbackMailto) {
      return { fallbackMailto: data.fallbackMailto };
    }

    throw new Error(fallbackError);
  }

  return data;
}

export default function ContactSales() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactCompanyCopy(i18n.resolvedLanguage ?? i18n.language).exactContactSales;
  const { toast } = useEcodeToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ContactSalesField, string>>>({});
  const [sent, setSent] = useState<{ reference?: string } | null>(null);

  const handleBlur = (field: ContactSalesField, value: string) => {
    setErrors((previous) => ({ ...previous, [field]: validateContactSalesField(field, value, copy.validation) }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

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

    /*
     * Re-validate everything on submit: per-field blur validation only covers
     * fields the user actually visited. Nothing leaves the browser until the
     * lead is well-formed, so the mailto fallback below never fires for a
     * simple typo either.
     */
    const validation: Partial<Record<ContactSalesField, string>> = {};

    for (const field of Object.keys(FIELD_IDS) as ContactSalesField[]) {
      validation[field] = validateContactSalesField(field, lead[field], copy.validation);
    }

    setErrors(validation);

    const firstInvalid = (Object.keys(FIELD_IDS) as ContactSalesField[]).find((field) => validation[field]);

    if (firstInvalid) {
      formElement.querySelector<HTMLElement>(`#${FIELD_IDS[firstInvalid]}`)?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitContactSalesLead(lead, String(formData.get('website') ?? ''), copy.errors.submit);

      if (result.fallbackMailto) {
        if (typeof window !== 'undefined') {
          window.location.href = result.fallbackMailto || buildContactSalesMailto(lead, copy.mailto);
        }

        toast({
          title: copy.toasts.title,
          description: copy.toasts.prepared,
        });
      } else {
        // The reference is the API-allocated id of the stored lead, never invented here.
        setSent({ reference: result.reference });
      }
    } catch {
      /*
       * The intake backend (/api/contact/sales → API /contact-sales) may still
       * reject or be unreachable. Rather than silently dropping the lead — the
       * original bug, where the native form did a GET navigation and lost
       * everything — fall back to a client-built mailto so the prospect can
       * still reach sales@e-code.ai with their message intact.
       */
      if (typeof window !== 'undefined') {
        window.location.href = buildContactSalesMailto(lead, copy.mailto);
      }

      toast({
        title: copy.toasts.title,
        description: copy.toasts.fallback,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const enterpriseFeatures = copy.features.items.map((feature) => ({
    ...feature,
    icon: FEATURE_ICONS[feature.id],
  }));

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
                {copy.hero.title}
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">{copy.hero.description}</p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                {copy.hero.badge}
              </Badge>
            </div>
          </div>
        </section>

        {/* Enterprise Features */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.features.title}</h2>

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
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.expectations.title}</h2>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {copy.expectations.items.map((step) => (
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
                {sent ? (
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4 py-8" role="status" data-testid="contact-sales-success">
                      <CheckCircle className="h-12 w-12 mx-auto text-primary" />
                      <h3 className="mkt-h3 font-semibold">{copy.success.title}</h3>
                      <p className="mkt-body text-muted-foreground">{copy.success.description}</p>
                      {sent.reference ? (
                        <p className="mkt-body">
                          {copy.success.referencePrefix}{' '}
                          <span className="font-mono font-semibold" data-testid="contact-sales-reference">
                            {sent.reference}
                          </span>{' '}
                          {copy.success.referenceSuffix}
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader>
                      <CardTitle>{copy.form.title}</CardTitle>
                      <CardDescription>{copy.form.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form className="space-y-6" onSubmit={handleSubmit} noValidate data-testid="form-contact-sales">
                        <FormErrorSummary
                          errors={(Object.keys(FIELD_IDS) as ContactSalesField[])
                            .filter((field) => errors[field])
                            .map((field) => ({ fieldId: FIELD_IDS[field], message: errors[field] as string }))}
                        />
                        <div className="grid sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label htmlFor="contact-name" className="mkt-small font-medium">
                              {copy.form.name}
                            </label>
                            <input
                              id="contact-name"
                              name="name"
                              type="text"
                              autoComplete="name"
                              placeholder={copy.form.namePlaceholder}
                              onBlur={(event) => handleBlur('name', event.currentTarget.value)}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                              {...fieldErrorProps('contact-name', errors.name)}
                            />
                            <FieldError fieldId="contact-name" error={errors.name} />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="contact-email" className="mkt-small font-medium">
                              {copy.form.email}
                            </label>
                            <input
                              id="contact-email"
                              name="email"
                              type="email"
                              autoComplete="email"
                              placeholder={copy.form.emailPlaceholder}
                              onBlur={(event) => handleBlur('email', event.currentTarget.value)}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                              {...fieldErrorProps('contact-email', errors.email)}
                            />
                            <FieldError fieldId="contact-email" error={errors.email} />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="contact-company" className="mkt-small font-medium">
                              {copy.form.company}
                            </label>
                            <input
                              id="contact-company"
                              name="company"
                              type="text"
                              autoComplete="organization"
                              placeholder={copy.form.companyPlaceholder}
                              onBlur={(event) => handleBlur('company', event.currentTarget.value)}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                              {...fieldErrorProps('contact-company', errors.company)}
                            />
                            <FieldError fieldId="contact-company" error={errors.company} />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="contact-team-size" className="mkt-small font-medium">
                              {copy.form.teamSize}
                            </label>
                            <select
                              id="contact-team-size"
                              name="teamSize"
                              defaultValue=""
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="" disabled>
                                {copy.form.teamSizePlaceholder}
                              </option>
                              {TEAM_SIZES.map((size) => (
                                <option key={size} value={size}>
                                  {size} {copy.form.developerSuffix}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="contact-message" className="mkt-small font-medium">
                            {copy.form.message}
                          </label>
                          <textarea
                            id="contact-message"
                            name="message"
                            rows={4}
                            placeholder={copy.form.messagePlaceholder}
                            onBlur={(event) => handleBlur('message', event.currentTarget.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
                            {...fieldErrorProps('contact-message', errors.message)}
                          />
                          <FieldError fieldId="contact-message" error={errors.message} />
                        </div>

                        {/* Honeypot: bots fill it, humans never see it (mirrors the newsletter mini-form). */}
                        <input
                          type="text"
                          name="website"
                          tabIndex={-1}
                          autoComplete="off"
                          aria-hidden="true"
                          className="pointer-events-none absolute h-0 w-0 opacity-0"
                        />

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] hover:opacity-90 transition-opacity disabled:opacity-60 disabled:pointer-events-none"
                          style={{ backgroundColor: 'var(--ecode-accent)' }}
                          data-testid="button-contact-sales-submit"
                        >
                          {isSubmitting ? (
                            <>{copy.form.submitting}</>
                          ) : (
                            <>
                              <Send className="h-4 w-4" />
                              {copy.form.submit}
                            </>
                          )}
                        </button>

                        <p className="mkt-small text-muted-foreground text-center">{copy.form.consent}</p>
                      </form>
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
