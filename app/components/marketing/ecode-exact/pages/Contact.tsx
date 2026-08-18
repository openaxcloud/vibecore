import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle,
  Globe,
  Headset,
  Mail,
  Newspaper,
  Rocket,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useState, type ComponentType, type FormEvent } from 'react';
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
  getMarketingExactAboutContactCopy,
  marketingExactAboutContactEn,
  type ContactChannelId,
  type ContactMailtoCopy,
  type ContactTopic,
  type ContactValidationCopy,
} from '~/lib/i18n/catalogs/marketing-exact-about-contact';

export type ContactMessage = {
  name: string;
  email: string;
  message: string;

  /** Which team the message is for ("General", "Support", ...). */
  topic?: string;
};

type ContactResponse = {
  ok?: boolean;

  /** Reference number allocated by the API (from the stored lead's id). */
  reference?: string;
  fallbackMailto?: string;
  error?: string;
};

type ContactField = 'name' | 'email' | 'message';

const CONTACT_FIELD_PREFIX = 'contact';
const GENERAL_CONTACT_EMAIL = 'hello@e-code.ai';

const FIELD_IDS: Record<ContactField, string> = {
  name: 'contact-name',
  email: 'contact-email',
  message: `${CONTACT_FIELD_PREFIX}-message`,
};

/** Routing topics offered by the form — mirrors the channel cards above it. */
export const CONTACT_TOPICS = [
  'General',
  'Sales',
  'Support',
  'Press',
  'Security',
] as const satisfies readonly ContactTopic[];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CHANNEL_MEDIA: Record<ContactChannelId, { icon: ComponentType<{ className?: string }>; address: string }> = {
  sales: { icon: BadgeDollarSign, address: 'sales@e-code.ai' },
  support: { icon: Headset, address: 'support@e-code.ai' },
  press: { icon: Newspaper, address: 'press@e-code.ai' },
  security: { icon: ShieldCheck, address: 'security@e-code.ai' },
};

export function validateContactField(
  field: ContactField,
  value: string,
  copy: ContactValidationCopy = marketingExactAboutContactEn.exactContact.validation,
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
    case 'message':
      return trimmed ? undefined : copy.messageRequired;
    default:
      return undefined;
  }
}

/**
 * Fallback path when the intake backend (/api/contact/general → API
 * /contact-sales) rejects or is unreachable: rather than silently dropping the
 * user's message — the original bug, where the form was inert and only ever
 * composed email — we compose a mailto: to hello@e-code.ai so the typed
 * message is never lost. The `Reply-To` is carried in the body since mailto:
 * cannot set arbitrary headers reliably across clients.
 */
export function buildContactMailto(
  { name, email, message, topic }: ContactMessage,
  copy: ContactMailtoCopy = marketingExactAboutContactEn.exactContact.mailto,
) {
  const trimmedName = name.trim();
  const subject = trimmedName ? `${copy.subjectFrom} ${trimmedName}` : copy.subjectDefault;
  const knownTopic = CONTACT_TOPICS.find((candidate) => candidate === topic?.trim());
  const localizedTopic = knownTopic ? copy.topicLabels[knownTopic] : topic?.trim();

  const body = [
    trimmedName ? `${copy.name}: ${trimmedName}` : undefined,
    email.trim() ? `${copy.email}: ${email.trim()}` : undefined,
    localizedTopic ? `${copy.topic}: ${localizedTopic}` : undefined,
    '',
    message.trim(),
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return `mailto:hello@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitContactMessage(
  payload: ContactMessage & { pagePath: string },
  honeypot: string,
  fallbackError: string,
) {
  const response = await fetch('/api/contact/general', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ ...payload, website: honeypot }),
  });

  const data = (await response.json().catch(() => ({}))) as ContactResponse;

  if (!response.ok) {
    if (data.fallbackMailto) {
      return { fallbackMailto: data.fallbackMailto };
    }

    throw new Error(fallbackError);
  }

  return data;
}

export default function Contact() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactAboutContactCopy(i18n.resolvedLanguage ?? i18n.language).exactContact;
  const { toast } = useEcodeToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [sent, setSent] = useState<{ reference?: string } | null>(null);

  const handleBlur = (field: ContactField, value: string) => {
    setErrors((previous) => ({ ...previous, [field]: validateContactField(field, value, copy.validation) }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const pagePath = typeof window !== 'undefined' ? window.location.pathname : '/contact';

    const payload: ContactMessage = {
      name: String(formData.get('name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      message: String(formData.get('message') ?? '').trim(),
      topic: String(formData.get('topic') ?? '').trim() || 'General',
    };

    /*
     * Re-validate everything on submit: per-field blur validation only covers
     * fields the user actually visited. Nothing leaves the browser until the
     * message is well-formed, so the mailto fallback below never fires for a
     * simple typo either.
     */
    const validation: Partial<Record<ContactField, string>> = {};

    for (const field of Object.keys(FIELD_IDS) as ContactField[]) {
      validation[field] = validateContactField(field, payload[field], copy.validation);
    }

    setErrors(validation);

    const firstInvalid = (Object.keys(FIELD_IDS) as ContactField[]).find((field) => validation[field]);

    if (firstInvalid) {
      formElement.querySelector<HTMLElement>(`#${FIELD_IDS[firstInvalid]}`)?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitContactMessage(
        { ...payload, pagePath },
        String(formData.get('website') ?? ''),
        copy.errors.submit,
      );

      if (result.fallbackMailto) {
        if (typeof window !== 'undefined') {
          window.location.href = result.fallbackMailto || buildContactMailto(payload, copy.mailto);
        }

        toast({
          title: copy.toasts.title,
          description: copy.toasts.prepared,
        });
      } else {
        // The reference is the API-allocated id of the stored message, never invented here.
        setSent({ reference: result.reference });
      }
    } catch {
      /*
       * The intake backend (/api/contact/general → API /contact-sales) may
       * still reject or be unreachable. Rather than silently dropping the
       * message — the original bug, where the form only composed a mailto and
       * nothing was ever delivered to a backend — fall back to a client-built
       * mailto so the sender can still reach hello@e-code.ai with their
       * message intact.
       */
      if (typeof window !== 'undefined') {
        window.location.href = buildContactMailto(payload, copy.mailto);
      }

      toast({
        title: copy.toasts.title,
        description: copy.toasts.fallback,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const channels = copy.channels.items.map((channel) => ({ ...channel, ...CHANNEL_MEDIA[channel.id] }));

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-contact">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <span
                className="inline-flex h-14 w-14 items-center justify-center rounded-xl mb-5 text-white shadow-sm"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
              >
                <Mail className="h-7 w-7" />
              </span>
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-contact">
                {copy.hero.title}
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">{copy.hero.description}</p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                {copy.hero.responseTime}
              </Badge>
            </div>
          </div>
        </section>

        {/* Contact Channels */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.channels.title}</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <Card key={channel.id}>
                    <CardContent className="pt-6 text-center">
                      <span
                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4 text-white shadow-sm"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-2">{channel.title}</h3>
                      <p className="mkt-body text-muted-foreground mb-4">{channel.description}</p>
                      <a
                        href={`mailto:${channel.address}`}
                        className="mkt-small font-medium text-[var(--ecode-accent-text)] hover:underline break-all"
                        data-testid={`link-contact-${channel.id}`}
                      >
                        {channel.address}
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact Form */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-2xl mx-auto">
              <h2 className="mkt-h2 font-bold text-center mb-4">{copy.formSection.title}</h2>
              <p className="mkt-body text-muted-foreground text-center mb-12">{copy.formSection.description}</p>

              <Card>
                {sent ? (
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4 py-8" role="status" data-testid="contact-success">
                      <CheckCircle className="h-12 w-12 mx-auto text-primary" />
                      <h3 className="mkt-h3 font-semibold">{copy.success.title}</h3>
                      <p className="mkt-body text-muted-foreground">{copy.success.description}</p>
                      {sent.reference ? (
                        <p className="mkt-body">
                          {copy.success.referencePrefix}{' '}
                          <span className="font-mono font-semibold" data-testid="contact-reference">
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
                      <form className="space-y-6" data-testid="form-contact" onSubmit={handleSubmit} noValidate>
                        <FormErrorSummary
                          errors={(Object.keys(FIELD_IDS) as ContactField[])
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
                              className="flex h-10 w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                              data-testid="input-contact-name"
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
                              className="flex h-10 w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                              data-testid="input-contact-email"
                              {...fieldErrorProps('contact-email', errors.email)}
                            />
                            <FieldError fieldId="contact-email" error={errors.email} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="contact-topic" className="mkt-small font-medium">
                            {copy.form.topic}
                          </label>
                          <select
                            id="contact-topic"
                            name="topic"
                            defaultValue="General"
                            className="flex h-10 w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                            data-testid="select-contact-topic"
                          >
                            {CONTACT_TOPICS.map((topic) => (
                              <option key={topic} value={topic}>
                                {copy.form.topicLabels[topic]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="contact-message" className="mkt-small font-medium">
                            {copy.form.message}
                          </label>
                          <textarea
                            id="contact-message"
                            name="message"
                            rows={6}
                            placeholder={copy.form.messagePlaceholder}
                            onBlur={(event) => handleBlur('message', event.currentTarget.value)}
                            className="flex min-h-[120px] w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                            data-testid="textarea-contact-message"
                            {...fieldErrorProps('contact-message', errors.message)}
                          />
                          <FieldError fieldId="contact-message" error={errors.message} />
                        </div>

                        {/* Honeypot: bots fill it, humans never see it (mirrors the contact-sales form). */}
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
                          className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-md text-sm font-medium text-white min-h-[44px] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
                          style={{ backgroundColor: 'var(--ecode-accent)' }}
                          data-testid="button-contact-submit"
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
                      </form>
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          </div>
        </section>

        {/* Remote-first */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4 text-[var(--ecode-accent-text)] bg-[var(--bolt-elements-background-depth-2,rgba(255,255,255,0.04))] ring-1 ring-[var(--ecode-border)]">
                  <Globe className="h-6 w-6" />
                </span>
                <h2 className="mkt-h2 font-bold mb-4">{copy.remote.title}</h2>
                <p className="mkt-body text-muted-foreground mb-4">
                  {copy.remote.firstBeforeEmail}{' '}
                  <a
                    href="mailto:hello@e-code.ai"
                    className="font-medium text-[var(--ecode-accent-text)] hover:underline"
                  >
                    {GENERAL_CONTACT_EMAIL}
                  </a>{' '}
                  {copy.remote.firstAfterEmail}
                </p>
                <p className="mkt-body text-muted-foreground">{copy.remote.second}</p>
              </div>

              <figure className="rounded-xl overflow-hidden ring-1 ring-[var(--ecode-border)] shadow-lg bg-[var(--bolt-elements-background-depth-2,rgba(255,255,255,0.04))]">
                <img
                  src="/ecode-static/assets/product/dashboard.png"
                  alt={copy.remote.imageAlt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-contact-dashboard"
                />
              </figure>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div
              className="relative overflow-hidden rounded-2xl px-8 py-14 text-center text-white"
              style={{ background: 'linear-gradient(135deg, var(--ecode-accent), #F99D25)' }}
            >
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-xl mb-5 bg-white/15 backdrop-blur-sm">
                <Rocket className="h-7 w-7" />
              </span>
              <h2 className="mkt-h2 font-bold mb-3">{copy.cta.title}</h2>
              <p className="mkt-body text-white/90 max-w-xl mx-auto mb-8">{copy.cta.description}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold text-[var(--ecode-accent-text)] bg-white min-h-[44px] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-accent)]"
                  data-testid="link-contact-cta-signup"
                >
                  {copy.cta.primary}
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold text-white ring-1 ring-inset ring-white/60 min-h-[44px] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  data-testid="link-contact-cta-dashboard"
                >
                  {copy.cta.secondary}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
