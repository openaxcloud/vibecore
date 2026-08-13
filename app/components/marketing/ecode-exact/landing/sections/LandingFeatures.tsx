import { Rocket, Brain, Shield, MessagesSquare, Gauge, Globe2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

const features = [
  {
    icon: <Rocket className="h-6 w-6" />,
    title: 'Enterprise-Grade Infrastructure',
    description: 'Built on Fortune 500 standards with 99.99% uptime SLA, auto-scaling, and global CDN distribution',
  },
  {
    icon: <Brain className="h-6 w-6" />,
    title: 'AI-Powered Development',
    description: 'Advanced AI agents that understand context, write production code, and deploy automatically',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Bank-Level Security',
    description: 'SOC 2 Type II certified with end-to-end encryption, RBAC, and continuous security monitoring',
  },
  {
    icon: <MessagesSquare className="h-6 w-6" />,
    title: 'Real-Time Collaboration',
    description: 'Multiple developers can code simultaneously with instant sync and conflict resolution',
  },
  {
    icon: <Gauge className="h-6 w-6" />,
    title: '10x Faster Development',
    description: 'Ship features in minutes instead of months with our optimized development pipeline',
  },
  {
    icon: <Globe2 className="h-6 w-6" />,
    title: 'Global Edge Deployment',
    description: 'Deploy to 200+ edge locations worldwide with automatic SSL and DDoS protection',
  },
];

export default function LandingFeatures() {
  return (
    <section className="py-24 bg-[var(--ecode-surface)]" data-testid="section-features">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">
            Enterprise Features, Startup Speed
          </h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            Everything you need to build, deploy, and scale production applications
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="group bg-[var(--ecode-surface)] border-[var(--ecode-border)] hover:border-ecode-accent/50 transition-all duration-300 hover:shadow-[0_8px_32px_-8px_rgba(242,98,7,0.2)] animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
              data-testid={`card-feature-${index}`}
            >
              <CardHeader>
                <div
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-ecode-accent to-ecode-secondary-accent flex items-center justify-center mb-4 shadow-[0_4px_16px_-4px_rgba(242,98,7,0.5)] transition-all duration-300 group-hover:scale-110"
                  data-testid={`icon-feature-${index}`}
                >
                  <div className="text-white">{feature.icon}</div>
                </div>
                <CardTitle className="text-xl text-[var(--ecode-text)]" data-testid={`text-feature-title-${index}`}>
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription
                  className="text-[var(--ecode-text-muted)] text-base"
                  data-testid={`text-feature-description-${index}`}
                >
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
