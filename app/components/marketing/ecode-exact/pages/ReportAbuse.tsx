import { Shield, AlertTriangle, Send, FileText, ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useEcodeToast } from '~/components/marketing/ecode-exact/EcodeExactLandingControls';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Button } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Input } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Label } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Textarea } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { RadioGroup, RadioGroupItem } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Checkbox } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactReportAbuseCopy,
  marketingExactReportAbuseEn,
  type AbuseViolationId,
  type MarketingExactReportAbuseCopy,
} from '~/lib/i18n/catalogs/marketing-exact-report-abuse';

const ABUSE_FORM_PLACEHOLDERS = {
  url: 'https://e-code.ai/...',
  username: '@username',
  email: 'your@email.com',
} as const;

const ABUSE_EMAIL = 'abuse@e-code.ai';

const VIOLATION_COLORS: Record<AbuseViolationId, string> = {
  illegal: 'text-red-500',
  code: 'text-orange-500',
  harassment: 'text-yellow-500',
  spam: 'text-teal-500',
  privacy: 'text-blue-500',
  inappropriate: 'text-green-500',
};

type AbuseReportPayload = {
  reportType: string;
  targetUrl: string;
  description: string;
  reporterEmail?: string;
  username?: string;
  pagePath: string;
};

type AbuseReportResponse = {
  success?: boolean;
  fallbackMailto?: string;
  error?: string;
};

export function buildAbuseMailto(
  payload: AbuseReportPayload,
  copy: MarketingExactReportAbuseCopy['exactReportAbuse']['mailto'] = marketingExactReportAbuseEn.exactReportAbuse
    .mailto,
) {
  const subject = `${copy.subject}: ${payload.reportType}`;

  const body = [
    `${copy.reportType}: ${payload.reportType}`,
    `${copy.targetUrl}: ${payload.targetUrl}`,
    payload.username ? `${copy.username}: ${payload.username}` : undefined,
    payload.reporterEmail ? `${copy.reporterEmail}: ${payload.reporterEmail}` : undefined,
    `${copy.pagePath}: ${payload.pagePath}`,
    '',
    `${copy.description}:`,
    payload.description,
  ]
    .filter(Boolean)
    .join('\n');

  return `mailto:abuse@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitAbuseReport(payload: AbuseReportPayload, fallbackError: string) {
  const response = await fetch('/api/report/abuse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as AbuseReportResponse;

  if (!response.ok) {
    if (data.fallbackMailto) {
      return { fallbackMailto: data.fallbackMailto };
    }

    throw new Error(data.error || fallbackError);
  }

  return data;
}

export default function ReportAbuse() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactReportAbuseCopy(i18n.resolvedLanguage ?? i18n.language).exactReportAbuse;
  const { toast } = useEcodeToast();
  const [reportType, setReportType] = useState('code');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const pagePath = typeof window !== 'undefined' ? window.location.pathname : '/report-abuse';

    const payload: AbuseReportPayload = {
      reportType,
      targetUrl: String(formData.get('url') ?? ''),
      description: String(formData.get('description') ?? ''),
      reporterEmail: String(formData.get('email') ?? ''),
      username: String(formData.get('username') ?? ''),
      pagePath,
    };

    try {
      const result = await submitAbuseReport(payload, copy.errors.submit);

      if (result.fallbackMailto) {
        window.location.href = result.fallbackMailto || buildAbuseMailto(payload, copy.mailto);
        toast({
          title: copy.toasts.openingTitle,
          description: copy.toasts.openingDescription,
        });
      } else {
        toast({
          title: copy.toasts.submittedTitle,
          description: copy.toasts.submittedDescription,
        });
      }

      formElement.reset();
      setReportType('code');
    } catch {
      /*
       * The server rejects some reports without supplying a fallbackMailto
       * (spam-flagged reports, Zod validation errors, and GitHub failures all
       * return errors with no mailto). Rather than silently losing the user's
       * typed report behind a generic toast, fall back to a client-built
       * mailto so they can still send it to abuse@e-code.ai.
       */
      if (typeof window !== 'undefined') {
        window.location.href = buildAbuseMailto(payload, copy.mailto);
      }

      toast({
        title: copy.toasts.openingTitle,
        description: copy.toasts.fallbackDescription,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-report-abuse">
      <PublicNavbar />

      <section className="py-responsive">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5" />
              <span className="text-[13px] text-muted-foreground">{copy.eyebrow}</span>
            </div>

            <h1 className="text-responsive-2xl font-bold tracking-tight mb-4" data-testid="heading-report-abuse">
              {copy.title}
            </h1>

            <p className="text-responsive-base text-muted-foreground mb-8">{copy.description}</p>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>{copy.violationsIntro.title}</CardTitle>
                <CardDescription>{copy.violationsIntro.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {copy.violations.map((violation) => (
                    <div key={violation.id}>
                      <h3 className="font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className={`h-4 w-4 ${VIOLATION_COLORS[violation.id]}`} />
                        {violation.title}
                      </h3>
                      <p className="text-[13px] text-muted-foreground">{violation.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{copy.form.title}</CardTitle>
                <CardDescription>{copy.form.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label>{copy.form.typeLabel}</Label>
                    <RadioGroup value={reportType} onValueChange={setReportType} className="mt-2">
                      {copy.form.types.map((type) => (
                        <div key={type.id} className="flex items-center space-x-2">
                          <RadioGroupItem value={type.id} id={type.id} />
                          <Label htmlFor={type.id} className="font-normal">
                            {type.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div>
                    <Label htmlFor="url">{copy.form.urlLabel}</Label>
                    <Input
                      id="url"
                      name="url"
                      type="url"
                      placeholder={ABUSE_FORM_PLACEHOLDERS.url}
                      required
                      className="mt-2 min-h-[44px]"
                      data-testid="input-abuse-url"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">{copy.form.urlHelp}</p>
                  </div>

                  <div>
                    <Label htmlFor="username">{copy.form.usernameLabel}</Label>
                    <Input
                      id="username"
                      name="username"
                      placeholder={ABUSE_FORM_PLACEHOLDERS.username}
                      className="mt-2 min-h-[44px]"
                      data-testid="input-abuse-username"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">{copy.form.descriptionLabel}</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder={copy.form.descriptionPlaceholder}
                      rows={6}
                      required
                      className="mt-2"
                      data-testid="input-abuse-description"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">{copy.form.emailLabel}</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder={ABUSE_FORM_PLACEHOLDERS.email}
                      className="mt-2 min-h-[44px]"
                      data-testid="input-abuse-email"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">{copy.form.emailHelp}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox id="terms" required data-testid="checkbox-abuse-terms" />
                    <Label htmlFor="terms" className="text-[13px] font-normal">
                      {copy.form.confirmation}
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto min-h-[44px]"
                    data-testid="button-abuse-submit"
                  >
                    {isSubmitting ? (
                      <>{copy.form.submitting}</>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        {copy.form.submit}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-[15px]">{copy.dmca.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] text-muted-foreground mb-4">{copy.dmca.description}</p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full min-h-[44px]"
                    data-testid="button-abuse-dmca"
                  >
                    <a href="/acceptable-use">
                      <FileText className="h-4 w-4 mr-2" />
                      {copy.dmca.action}
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-[15px]">{copy.emergency.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] text-muted-foreground mb-4">{copy.emergency.description}</p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full min-h-[44px]"
                    data-testid="button-abuse-emergency"
                  >
                    <a href="mailto:abuse@e-code.ai">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {ABUSE_EMAIL}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">{copy.process.title}</h3>
              <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-5">
                {copy.process.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>

            <div className="mt-6 text-center">
              <p className="text-[13px] text-muted-foreground">
                {copy.warning}
                <br />
                {copy.moreInformation}{' '}
                <a href="/terms" className="text-primary hover:underline">
                  {copy.terms}
                </a>{' '}
                {copy.and}{' '}
                <a href="/acceptable-use" className="text-primary hover:underline">
                  {copy.guidelines}
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
