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

const FIELD_IDS: Record<ContactField, string> = {
  name: 'contact-name',
  email: 'contact-email',
  message: 'contact-message',
};

/** Routing topics offered by the form — mirrors the channel cards above it. */
export const CONTACT_TOPICS = ['General', 'Sales', 'Support', 'Press', 'Security'] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactField(field: ContactField, value: string): string | undefined {
  const trimmed = value.trim();

  switch (field) {
    case 'name':
      return trimmed ? undefined : 'Enter your name.';
    case 'email': {
      if (!trimmed) {
        return 'Enter your email.';
      }

      return EMAIL_PATTERN.test(trimmed) ? undefined : 'Enter a valid email address.';
    }
    case 'message':
      return trimmed ? undefined : 'Tell us briefly how we can help.';
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
export function buildContactMailto({ name, email, message, topic }: ContactMessage) {
  const trimmedName = name.trim();
  const subject = trimmedName ? `Message from ${trimmedName}` : 'Message via E-Code contact form';

  const body = [
    trimmedName ? `Name: ${trimmedName}` : undefined,
    email.trim() ? `Email: ${email.trim()}` : undefined,
    topic?.trim() ? `Topic: ${topic.trim()}` : undefined,
    '',
    message.trim(),
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return `mailto:hello@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitContactMessage(payload: ContactMessage & { pagePath: string }, honeypot: string) {
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

    throw new Error(data.error || 'Failed to send your message.');
  }

  return data;
}

export default function Contact() {
  const { toast } = useEcodeToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [sent, setSent] = useState<{ reference?: string } | null>(null);

  const handleBlur = (field: ContactField, value: string) => {
    setErrors((previous) => ({ ...previous, [field]: validateContactField(field, value) }));
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
      validation[field] = validateContactField(field, payload[field]);
    }

    setErrors(validation);

    const firstInvalid = (Object.keys(FIELD_IDS) as ContactField[]).find((field) => validation[field]);

    if (firstInvalid) {
      formElement.querySelector<HTMLElement>(`#${FIELD_IDS[firstInvalid]}`)?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitContactMessage({ ...payload, pagePath }, String(formData.get('website') ?? ''));

      if (result.fallbackMailto) {
        if (typeof window !== 'undefined') {
          window.location.href = result.fallbackMailto || buildContactMailto(payload);
        }

        toast({
          title: 'Opening your email client',
          description: "We've prepared your message for hello@e-code.ai so nothing gets lost.",
        });
      } else {
        // The reference is the API-allocated id of the stored message, never invented here.
        setSent({ reference: result.reference });
      }
    } catch (error) {
      /*
       * The intake backend (/api/contact/general → API /contact-sales) may
       * still reject or be unreachable. Rather than silently dropping the
       * message — the original bug, where the form only composed a mailto and
       * nothing was ever delivered to a backend — fall back to a client-built
       * mailto so the sender can still reach hello@e-code.ai with their
       * message intact.
       */
      if (typeof window !== 'undefined') {
        window.location.href = buildContactMailto(payload);
      }

      toast({
        title: 'Opening your email client',
        description:
          error instanceof Error
            ? `${error.message} We've prepared your message for hello@e-code.ai instead.`
            : "We couldn't reach the server, so we've prepared your message for hello@e-code.ai instead.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const channels: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    description: string;
    email: string;
  }[] = [
    {
      icon: BadgeDollarSign,
      title: 'Sales',
      description: 'Talk to our team about plans, pricing, and enterprise rollouts.',
      email: 'sales@e-code.ai',
    },
    {
      icon: Headset,
      title: 'Support',
      description: 'Get help with your projects, workspaces, and account.',
      email: 'support@e-code.ai',
    },
    {
      icon: Newspaper,
      title: 'Press',
      description: 'Media inquiries, brand assets, and company information.',
      email: 'press@e-code.ai',
    },
    {
      icon: ShieldCheck,
      title: 'Security',
      description: 'Report a vulnerability or ask about our security practices.',
      email: 'security@e-code.ai',
    },
  ];

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
                Get in Touch
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                Whether you have a question about features, pricing, security, or anything else, our team is ready to
                help.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                We typically reply within one business day
              </Badge>
            </div>
          </div>
        </section>

        {/* Contact Channels */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">How Can We Help?</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <Card key={channel.title}>
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
                        href={`mailto:${channel.email}`}
                        className="mkt-small font-medium text-[var(--ecode-accent)] hover:underline break-all"
                        data-testid={`link-contact-${channel.title.toLowerCase()}`}
                      >
                        {channel.email}
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
              <h2 className="mkt-h2 font-bold text-center mb-4">Send Us a Message</h2>
              <p className="mkt-body text-muted-foreground text-center mb-12">
                Fill out the form below and the right team will get back to you.
              </p>

              <Card>
                {sent ? (
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4 py-8" role="status" data-testid="contact-success">
                      <CheckCircle className="h-12 w-12 mx-auto text-primary" />
                      <h3 className="mkt-h3 font-semibold">Message received</h3>
                      <p className="mkt-body text-muted-foreground">
                        Thanks for reaching out — the right team will get back within 1 business day.
                      </p>
                      {sent.reference ? (
                        <p className="mkt-body">
                          Your reference number is{' '}
                          <span className="font-mono font-semibold" data-testid="contact-reference">
                            {sent.reference}
                          </span>{' '}
                          — quote it in any follow-up.
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader>
                      <CardTitle>Contact Form</CardTitle>
                      <CardDescription>Tell us a little about what you need.</CardDescription>
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
                              Name
                            </label>
                            <input
                              id="contact-name"
                              name="name"
                              type="text"
                              autoComplete="name"
                              placeholder="Ada Lovelace"
                              onBlur={(event) => handleBlur('name', event.currentTarget.value)}
                              className="flex h-10 w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                              data-testid="input-contact-name"
                              {...fieldErrorProps('contact-name', errors.name)}
                            />
                            <FieldError fieldId="contact-name" error={errors.name} />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="contact-email" className="mkt-small font-medium">
                              Email
                            </label>
                            <input
                              id="contact-email"
                              name="email"
                              type="email"
                              autoComplete="email"
                              placeholder="you@example.com"
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
                            Topic
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
                                {topic}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="contact-message" className="mkt-small font-medium">
                            Message
                          </label>
                          <textarea
                            id="contact-message"
                            name="message"
                            rows={6}
                            placeholder="How can we help you?"
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
                            <>Sending...</>
                          ) : (
                            <>
                              <Send className="h-4 w-4" />
                              Send Message
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
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4 text-[var(--ecode-accent)] bg-[var(--bolt-elements-background-depth-2,rgba(255,255,255,0.04))] ring-1 ring-[var(--ecode-border)]">
                  <Globe className="h-6 w-6" />
                </span>
                <h2 className="mkt-h2 font-bold mb-4">Remote-first, built in the open</h2>
                <p className="mkt-body text-muted-foreground mb-4">
                  E-Code is a remote-first company with team members around the world. There is no front desk to visit,
                  but there is always someone online. For partnership or general inquiries, reach out to{' '}
                  <a href="mailto:hello@e-code.ai" className="font-medium text-[var(--ecode-accent)] hover:underline">
                    hello@e-code.ai
                  </a>{' '}
                  and we will point you to the right person.
                </p>
                <p className="mkt-body text-muted-foreground">
                  Prefer to just start building? Spin up a project in your browser and talk to the AI agent directly.
                </p>
              </div>

              <figure className="rounded-xl overflow-hidden ring-1 ring-[var(--ecode-border)] shadow-lg bg-[var(--bolt-elements-background-depth-2,rgba(255,255,255,0.04))]">
                <img
                  src="/ecode-static/assets/product/dashboard.png"
                  alt="The E-Code dashboard where you create projects, open workspaces and manage your account"
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
              <h2 className="mkt-h2 font-bold mb-3">Start building with E-Code today</h2>
              <p className="mkt-body text-white/90 max-w-xl mx-auto mb-8">
                Describe what you want to build and the AI agent writes, runs, and deploys it — no setup required. No
                credit card to get started.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold text-[var(--ecode-accent)] bg-white min-h-[44px] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-accent)]"
                  data-testid="link-contact-cta-signup"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold text-white ring-1 ring-inset ring-white/60 min-h-[44px] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  data-testid="link-contact-cta-dashboard"
                >
                  Open dashboard
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
