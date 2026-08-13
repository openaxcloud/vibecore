import { Users, Rocket, FileCode2, TrendingUp } from 'lucide-react';

const stats = [
  { label: 'Active Developers', value: '2M+', icon: <Users className="h-5 w-5" /> },
  { label: 'Apps Deployed', value: '10M+', icon: <Rocket className="h-5 w-5" /> },
  { label: 'Lines of Code', value: '5B+', icon: <FileCode2 className="h-5 w-5" /> },
  { label: 'Uptime SLA', value: '99.99%', icon: <TrendingUp className="h-5 w-5" /> },
];

export default function LandingStats() {
  return (
    <section
      className="py-20 bg-gradient-to-b from-[var(--ecode-background)] to-[var(--ecode-surface-tertiary)]"
      data-testid="section-stats"
    >
      <div className="container-responsive max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center group animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
              data-testid={`container-stat-${index}`}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ecode-accent/10 mb-3 transition-all duration-300 group-hover:bg-ecode-accent/20 group-hover:scale-110"
                data-testid={`icon-stat-${index}`}
              >
                <div className="text-ecode-accent">{stat.icon}</div>
              </div>
              <div
                className="text-4xl font-bold bg-gradient-to-r from-ecode-orange via-ecode-orange-light to-ecode-yellow bg-clip-text text-transparent"
                data-testid={`text-stat-value-${index}`}
              >
                {stat.value}
              </div>
              <div className="text-[13px] text-[var(--ecode-text-muted)] mt-1" data-testid={`text-stat-label-${index}`}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
