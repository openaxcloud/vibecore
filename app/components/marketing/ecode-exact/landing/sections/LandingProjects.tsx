import { Badge, Card, CardContent } from '~/components/marketing/ecode-exact/EcodeExactUi';

const cloudComputingImg =
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop';

const modernSoftwareImg = 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2070&auto=format&fit=crop';

const codingWorkspaceImg =
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=2072&auto=format&fit=crop';

const projects = [
  {
    title: 'TechStore Pro',
    description: 'Full-featured e-commerce platform with 50K+ daily transactions',
    image: cloudComputingImg,
    tags: ['React', 'Node.js', 'PostgreSQL'],
    stats: 'Built in 3 hours',
  },
  {
    title: 'TeamSync Hub',
    description: 'Real-time collaboration platform for remote teams',
    image: modernSoftwareImg,
    tags: ['WebSocket', 'Redis', 'TypeScript'],
    stats: 'Built in 2 hours',
  },
  {
    title: 'DataViz Pro',
    description: 'Enterprise analytics dashboard with real-time charts',
    image: codingWorkspaceImg,
    tags: ['Recharts', 'D3.js', 'PostgreSQL'],
    stats: 'Built in 4 hours',
  },
];

export default function LandingProjects() {
  return (
    <section className="py-20 bg-[var(--ecode-background)]" data-testid="section-projects">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">Built with E-Code Platform</h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            Real production applications built by our community in hours, not months
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project, index) => (
            <Card
              key={index}
              className="group overflow-hidden bg-[var(--ecode-surface)] border-[var(--ecode-border)] hover:border-ecode-accent/50 transition-all duration-300 hover:shadow-[0_8px_32px_-8px_rgba(242,98,7,0.2)] animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                  decoding="async"
                  width={400}
                  height={192}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-white font-bold text-[15px]">{project.title}</h3>
                  <p className="text-white/80 text-[13px]">{project.stats}</p>
                </div>
              </div>
              <CardContent className="p-6">
                <p className="text-[var(--ecode-text-muted)] mb-4">{project.description}</p>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[11px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
