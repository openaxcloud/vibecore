import { Mail, MessageCircle, Newspaper, ShieldCheck, MapPin, Send } from 'lucide-react';
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

export default function Contact() {
  const channels = [
    {
      icon: Mail,
      title: 'Sales',
      description: 'Talk to our team about plans, pricing, and enterprise rollouts.',
      email: 'sales@vibecore.dev',
    },
    {
      icon: MessageCircle,
      title: 'Support',
      description: 'Get help with your projects, workspaces, and account.',
      email: 'support@vibecore.dev',
    },
    {
      icon: Newspaper,
      title: 'Press',
      description: 'Media inquiries, brand assets, and company information.',
      email: 'press@vibecore.dev',
    },
    {
      icon: ShieldCheck,
      title: 'Security',
      description: 'Report a vulnerability or ask about our security practices.',
      email: 'security@vibecore.dev',
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
              <Mail className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-contact">
                Get in Touch
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
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
            <h2 className="text-3xl font-bold text-center mb-12">How Can We Help?</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <Card key={channel.title}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4 text-primary" />
                      <h3 className="font-semibold mb-2">{channel.title}</h3>
                      <p className="text-[13px] text-muted-foreground mb-4">{channel.description}</p>
                      <a
                        href={`mailto:${channel.email}`}
                        className="text-[13px] font-medium text-[var(--ecode-accent)] hover:underline break-all"
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
              <h2 className="text-3xl font-bold text-center mb-4">Send Us a Message</h2>
              <p className="text-[15px] text-muted-foreground text-center mb-12">
                Fill out the form below and the right team will get back to you.
              </p>

              <Card>
                <CardHeader>
                  <CardTitle>Contact Form</CardTitle>
                  <CardDescription>Tell us a little about what you need.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-6" data-testid="form-contact">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label htmlFor="contact-name" className="text-[13px] font-medium">
                          Name
                        </label>
                        <input
                          id="contact-name"
                          name="name"
                          type="text"
                          placeholder="Ada Lovelace"
                          className="flex h-10 w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                          data-testid="input-contact-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="contact-email" className="text-[13px] font-medium">
                          Email
                        </label>
                        <input
                          id="contact-email"
                          name="email"
                          type="email"
                          placeholder="you@example.com"
                          className="flex h-10 w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                          data-testid="input-contact-email"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="contact-message" className="text-[13px] font-medium">
                        Message
                      </label>
                      <textarea
                        id="contact-message"
                        name="message"
                        rows={6}
                        placeholder="How can we help you?"
                        className="flex min-h-[120px] w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                        data-testid="textarea-contact-message"
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-md text-sm font-medium text-white min-h-[44px] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                      style={{ backgroundColor: 'var(--ecode-accent)' }}
                      data-testid="button-contact-submit"
                    >
                      <Send className="h-4 w-4" />
                      Send Message
                    </button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Office */}
        <section className="py-responsive">
          <div className="container-responsive text-center">
            <MapPin className="h-10 w-10 mx-auto mb-4 text-primary" />
            <h2 className="text-3xl font-bold mb-4">Visit Us</h2>
            <p className="text-[15px] text-muted-foreground max-w-2xl mx-auto">
              E-Code is a remote-first company with team members around the world. For partnership or in-person
              inquiries, reach out to <span className="font-medium text-foreground">hello@vibecore.dev</span> and we
              will point you to the right person.
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
