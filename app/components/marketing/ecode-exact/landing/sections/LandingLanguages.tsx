import {
  SiExpress,
  SiJavascript,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxtdotjs,
  SiReact,
  SiSvelte,
  SiTailwindcss,
  SiTypescript,
  SiVite,
  SiVuedotjs,
} from 'react-icons/si';

const technologies = [
  { name: 'JavaScript', icon: SiJavascript, color: '#F7DF1E' },
  { name: 'TypeScript', icon: SiTypescript, color: '#3178C6' },
  { name: 'React', icon: SiReact, color: '#61DAFB' },
  { name: 'Next.js', icon: SiNextdotjs, color: '#F5F5F5' },
  { name: 'Vue', icon: SiVuedotjs, color: '#4FC08D' },
  { name: 'Svelte', icon: SiSvelte, color: '#FF3E00' },
  { name: 'Nuxt', icon: SiNuxtdotjs, color: '#00DC82' },
  { name: 'SvelteKit', icon: SiSvelte, color: '#FF3E00' },
  { name: 'Vite', icon: SiVite, color: '#A855F7' },
  { name: 'Tailwind', icon: SiTailwindcss, color: '#06B6D4' },
  { name: 'Node.js', icon: SiNodedotjs, color: '#339933' },
  { name: 'Express', icon: SiExpress, color: '#F5F5F5' },
];

export default function LandingLanguages() {
  return (
    <section className="py-20 bg-[var(--ecode-background)]" data-testid="section-validated-web-runtime">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">
            JavaScript and TypeScript, proven end to end
          </h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            Remix a working application or import a supported source, then run and preview it in the same web runtime.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-8">
          {technologies.map((technology, index) => {
            const Icon = technology.icon;
            return (
              <div
                key={technology.name}
                className="group flex flex-col items-center gap-2 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-16 h-16 rounded-xl bg-[var(--ecode-surface)] border border-[var(--ecode-border)] flex items-center justify-center transition-all duration-300 group-hover:border-ecode-accent/50 group-hover:scale-110">
                  <Icon className="h-8 w-8" style={{ color: technology.color }} />
                </div>
                <span className="text-[13px] text-[var(--ecode-text-muted)]">{technology.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
