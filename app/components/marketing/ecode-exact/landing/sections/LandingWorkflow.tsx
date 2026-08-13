import { MessageSquarePlus, Code2, Rocket, Gauge } from 'lucide-react';

const steps = [
  {
    icon: <MessageSquarePlus className="h-8 w-8" aria-hidden="true" />,
    title: 'Describe Your App',
    description: 'Tell our AI what you want to build in plain language',
  },
  {
    icon: <Code2 className="h-8 w-8" aria-hidden="true" />,
    title: 'AI Generates Code',
    description: 'Watch as production-ready code is created in real-time',
  },
  {
    icon: <Rocket className="h-8 w-8" aria-hidden="true" />,
    title: 'Deploy Instantly',
    description: 'One-click deployment to global edge network',
  },
  {
    icon: <Gauge className="h-8 w-8" aria-hidden="true" />,
    title: 'Scale Automatically',
    description: 'Auto-scaling infrastructure handles any traffic',
  },
];

export default function LandingWorkflow() {
  return (
    <section className="py-20 bg-[var(--ecode-surface-tertiary)]" data-testid="section-workflow">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">How It Works</h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            From idea to production in 4 simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative text-center animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-1/2 w-full h-0.5 bg-gradient-to-r from-ecode-accent to-ecode-accent/20" />
              )}
              <div className="relative z-10 inline-flex items-center justify-center w-24 h-24 rounded-full bg-ecode-accent border-2 border-ecode-accent shadow-[0_8px_24px_-8px_rgba(242,98,7,0.5)] mb-6">
                <div className="text-white">{step.icon}</div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-ecode-accent text-white flex items-center justify-center font-bold text-[13px]">
                  {index + 1}
                </div>
              </div>
              <h3 className="text-xl font-bold text-[var(--ecode-text)] mb-2">{step.title}</h3>
              <p className="text-[var(--ecode-text-muted)]">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
