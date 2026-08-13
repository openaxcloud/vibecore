import { Sparkles, ArrowRight } from 'lucide-react';
import { Button, useWouterLocation } from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function LandingCta() {
  const [, navigate] = useWouterLocation();

  return (
    <section
      className="py-20 bg-gradient-to-r from-ecode-accent via-ecode-orange-light to-ecode-yellow"
      data-testid="section-cta"
    >
      <div className="container-responsive max-w-4xl text-center">
        <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6 animate-fade-in">
          Ready to Build Something Amazing?
        </h2>
        <p className="text-xl text-white/90 mb-8 animate-fade-in" style={{ animationDelay: '100ms' }}>
          Join 2M+ developers shipping production apps faster than ever
        </p>
        <div
          className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in"
          style={{ animationDelay: '200ms' }}
        >
          <Button
            size="lg"
            className="bg-white text-ecode-accent hover:bg-white/90 gap-2 px-8 py-6 text-[15px] font-semibold"
            onClick={() => navigate('/register')}
            data-testid="button-cta-register"
          >
            <Sparkles className="h-5 w-5" />
            Start Building Free
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-2 border-gray-900 text-gray-900 bg-white/20 hover:bg-white/40 gap-2 px-8 py-6 text-[15px] font-semibold"
            onClick={() => navigate('/pricing')}
            data-testid="button-cta-pricing"
          >
            View Enterprise Plans
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
