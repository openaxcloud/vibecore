import {
  SiPython,
  SiJavascript,
  SiTypescript,
  SiGo,
  SiReact,
  SiNextdotjs,
  SiVuedotjs,
  SiSvelte,
  SiTailwindcss,
  SiNodedotjs,
  SiRust,
  SiPhp,
  SiDocker,
  SiKubernetes,
} from 'react-icons/si';

const languages = [
  { name: 'Python', icon: SiPython, color: '#3776AB' },
  { name: 'JavaScript', icon: SiJavascript, color: '#F7DF1E' },
  { name: 'TypeScript', icon: SiTypescript, color: '#3178C6' },
  { name: 'Go', icon: SiGo, color: '#00ADD8' },
  { name: 'React', icon: SiReact, color: '#61DAFB' },

  /*
   * Next.js's brand mark is pure-black, which disappears on the dark
   * --ecode-surface tile; use a near-white tone so it stays legible.
   */
  { name: 'Next.js', icon: SiNextdotjs, color: '#F5F5F5' },
  { name: 'Vue', icon: SiVuedotjs, color: '#4FC08D' },
  { name: 'Svelte', icon: SiSvelte, color: '#FF3E00' },
  { name: 'Tailwind', icon: SiTailwindcss, color: '#06B6D4' },
  { name: 'Node.js', icon: SiNodedotjs, color: '#339933' },

  /*
   * Rust's monochrome logo is pure-black, which disappears on the dark
   * --ecode-surface tile; use Rust's documented dark-mode tone so it stays visible.
   */
  { name: 'Rust', icon: SiRust, color: '#DEA584' },
  { name: 'PHP', icon: SiPhp, color: '#777BB4' },
  { name: 'Docker', icon: SiDocker, color: '#2496ED' },
  { name: 'Kubernetes', icon: SiKubernetes, color: '#326CE5' },
];

export default function LandingLanguages() {
  return (
    <section className="py-20 bg-[var(--ecode-background)]" data-testid="section-languages">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">
            Every Language, Every Framework
          </h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            Build with your favorite tools - we support 29+ languages and all major frameworks
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-8">
          {languages.map((lang, index) => {
            const Icon = lang.icon;
            return (
              <div
                key={index}
                className="group flex flex-col items-center gap-2 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-16 h-16 rounded-xl bg-[var(--ecode-surface)] border border-[var(--ecode-border)] flex items-center justify-center transition-all duration-300 group-hover:border-ecode-accent/50 group-hover:scale-110">
                  <Icon className="h-8 w-8" style={{ color: lang.color }} />
                </div>
                <span className="text-[13px] text-[var(--ecode-text-muted)]">{lang.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
