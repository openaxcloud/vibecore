import { Shield, AlertTriangle, Send, FileText, ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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

export function buildAbuseMailto(payload: AbuseReportPayload) {
  const subject = `E-Code abuse report: ${payload.reportType}`;

  const body = [
    `Report type: ${payload.reportType}`,
    `Target URL: ${payload.targetUrl}`,
    payload.username ? `Username: ${payload.username}` : undefined,
    payload.reporterEmail ? `Reporter email: ${payload.reporterEmail}` : undefined,
    `Page path: ${payload.pagePath}`,
    '',
    'Description:',
    payload.description,
  ]
    .filter(Boolean)
    .join('\n');

  return `mailto:abuse@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitAbuseReport(payload: AbuseReportPayload) {
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

    throw new Error(data.error || 'Failed to submit abuse report.');
  }

  return data;
}

export default function ReportAbuse() {
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
      const result = await submitAbuseReport(payload);

      if (result.fallbackMailto) {
        window.location.href = result.fallbackMailto || buildAbuseMailto(payload);
        toast({
          title: 'Opening email client',
          description: 'Your report details were prepared for abuse@e-code.ai.',
        });
      } else {
        toast({
          title: 'Report submitted',
          description: "Thank you for helping keep E-Code safe. We'll review your report and take appropriate action.",
        });
      }

      formElement.reset();
      setReportType('code');
    } catch (error) {
      /*
       * The server rejects some reports without supplying a fallbackMailto
       * (spam-flagged reports, Zod validation errors, and GitHub failures all
       * return errors with no mailto). Rather than silently losing the user's
       * typed report behind a generic toast, fall back to a client-built
       * mailto so they can still send it to abuse@e-code.ai.
       */
      if (typeof window !== 'undefined') {
        window.location.href = buildAbuseMailto(payload);
      }

      toast({
        title: 'Opening email client',
        description:
          error instanceof Error
            ? `${error.message} We've prepared your report for abuse@e-code.ai instead.`
            : "We couldn't reach the server, so we've prepared your report for abuse@e-code.ai instead.",
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
              <span className="text-[13px] text-muted-foreground">Trust & Safety</span>
            </div>

            <h1 className="text-responsive-2xl font-bold tracking-tight mb-4" data-testid="heading-report-abuse">
              Report Abuse
            </h1>

            <p className="text-responsive-base text-muted-foreground mb-8">
              Help us maintain a safe and productive environment for all E-Code users. If you've encountered content or
              behavior that violates our policies, please report it here.
            </p>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>What constitutes abuse on E-Code?</CardTitle>
                <CardDescription>
                  We take the following violations seriously and investigate all reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        Illegal Content
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Content that violates laws, including but not limited to copyright infringement, malware
                        distribution, or illegal activities
                      </p>
                    </div>

                    <div>
                      <h3 className="font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        Harmful or Malicious Code
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Code designed to harm systems, steal data, or compromise security
                      </p>
                    </div>

                    <div>
                      <h3 className="font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        Harassment or Bullying
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Targeted harassment, threats, or intimidation of other users
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-teal-500" />
                        Spam or Scams
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Unsolicited promotional content, phishing attempts, or fraudulent schemes
                      </p>
                    </div>

                    <div>
                      <h3 className="font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-blue-500" />
                        Privacy Violations
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Sharing personal information without consent or doxxing
                      </p>
                    </div>

                    <div>
                      <h3 className="font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-green-500" />
                        Inappropriate Content
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Adult content, graphic violence, or content inappropriate for our community
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Submit a Report</CardTitle>
                <CardDescription>Please provide as much detail as possible to help us investigate</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label>Type of abuse</Label>
                    <RadioGroup value={reportType} onValueChange={setReportType} className="mt-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="code" id="code" />
                        <Label htmlFor="code" className="font-normal">
                          Malicious or harmful code
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="content" id="content" />
                        <Label htmlFor="content" className="font-normal">
                          Inappropriate content
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="harassment" id="harassment" />
                        <Label htmlFor="harassment" className="font-normal">
                          Harassment or bullying
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="spam" id="spam" />
                        <Label htmlFor="spam" className="font-normal">
                          Spam or scams
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="copyright" id="copyright" />
                        <Label htmlFor="copyright" className="font-normal">
                          Copyright infringement
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="privacy" id="privacy" />
                        <Label htmlFor="privacy" className="font-normal">
                          Privacy violation
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="other" id="other" />
                        <Label htmlFor="other" className="font-normal">
                          Other
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label htmlFor="url">URL of the content</Label>
                    <Input
                      id="url"
                      name="url"
                      type="url"
                      placeholder="https://e-code.ai/..."
                      required
                      className="mt-2 min-h-[44px]"
                      data-testid="input-abuse-url"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Please provide the direct link to the project, profile, or comment
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="username">Username of the violator (if applicable)</Label>
                    <Input
                      id="username"
                      name="username"
                      placeholder="@username"
                      className="mt-2 min-h-[44px]"
                      data-testid="input-abuse-username"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description of the issue</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="Please describe the issue in detail. Include any relevant context, such as when the incident occurred, what specifically violates our policies, and any evidence you can provide."
                      rows={6}
                      required
                      className="mt-2"
                      data-testid="input-abuse-description"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Your email (optional)</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="your@email.com"
                      className="mt-2 min-h-[44px]"
                      data-testid="input-abuse-email"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Provide your email if you'd like us to follow up on this report
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox id="terms" required data-testid="checkbox-abuse-terms" />
                    <Label htmlFor="terms" className="text-[13px] font-normal">
                      I confirm that this report is made in good faith and the information provided is accurate
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
                      <>Submitting...</>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Report
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-[15px]">DMCA Takedown Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] text-muted-foreground mb-4">
                    For copyright infringement claims, please submit a formal DMCA takedown notice.
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full min-h-[44px]"
                    data-testid="button-abuse-dmca"
                  >
                    <a href="/acceptable-use">
                      <FileText className="h-4 w-4 mr-2" />
                      DMCA Process
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-[15px]">Emergency Contact</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] text-muted-foreground mb-4">
                    For urgent safety concerns or illegal activity, contact us immediately.
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full min-h-[44px]"
                    data-testid="button-abuse-emergency"
                  >
                    <a href="mailto:abuse@e-code.ai">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      abuse@e-code.ai
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">What happens after I submit a report?</h3>
              <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-5">
                <li>Our Trust & Safety team reviews all reports within 24-48 hours</li>
                <li>We investigate the reported content against our Community Guidelines</li>
                <li>Appropriate action is taken, which may include content removal or account suspension</li>
                <li>If you provided an email, we'll notify you of the outcome when possible</li>
              </ul>
            </div>

            <div className="mt-6 text-center">
              <p className="text-[13px] text-muted-foreground">
                False reports or abuse of the reporting system may result in account penalties.
                <br />
                For more information, see our{' '}
                <a href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/acceptable-use" className="text-primary hover:underline">
                  Community Guidelines
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
