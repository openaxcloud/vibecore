import { Star } from 'lucide-react';
import { Card, CardContent } from '~/components/marketing/ecode-exact/EcodeExactUi';

const testimonials = [
  {
    quote: 'E-Code reduced our development time by 85% and saved us $2M annually in engineering costs.',
    author: 'Sarah Chen',
    role: 'CTO, Fortune 500 Tech Company',
    company: 'TechCorp Global',
    avatar: 'SC',
  },
  {
    quote: 'The AI agent built our entire customer portal in 3 days. What used to take months now takes hours.',
    author: 'Michael Rodriguez',
    role: 'VP Engineering, Series C Startup',
    company: 'InnovateTech',
    avatar: 'MR',
  },
  {
    quote: "Best development platform we've used. Our team productivity increased by 400% in the first month.",
    author: 'Emily Watson',
    role: 'Director of Engineering, Enterprise SaaS',
    company: 'CloudScale Solutions',
    avatar: 'EW',
  },
];

export default function LandingTestimonials() {
  return (
    <section className="py-20 bg-[var(--ecode-surface)]" data-testid="section-testimonials">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">Trusted by Industry Leaders</h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            See what engineering leaders are saying about E-Code Platform
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="bg-[var(--ecode-surface)] border-[var(--ecode-border)] animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-6">
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5 fill-ecode-accent text-ecode-accent" />
                  ))}
                </div>
                <blockquote className="text-[var(--ecode-text)] mb-6 text-[15px] italic">
                  "{testimonial.quote}"
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-ecode-accent to-ecode-secondary-accent flex items-center justify-center text-white font-bold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--ecode-text)]">{testimonial.author}</div>
                    <div className="text-[13px] text-[var(--ecode-text-muted)]">{testimonial.role}</div>
                    <div className="text-[11px] text-[var(--ecode-text-muted)]">{testimonial.company}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
