import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/cloudflare';
import { redirect } from '@remix-run/cloudflare';
import { Link, useNavigate } from '@remix-run/react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  CheckCircle,
  Code,
  FileCode2,
  Gauge,
  Globe,
  Globe2,
  ListTodo,
  Maximize,
  MessageSquare,
  Pause,
  Play,
  PlayCircle,
  Rocket,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Users,
  Users2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useRef, useState } from 'react';
import {
  SiDocker,
  SiGo,
  SiJavascript,
  SiKubernetes,
  SiNodedotjs,
  SiPhp,
  SiPython,
  SiReact,
  SiRust,
  SiTypescript,
} from 'react-icons/si';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { readSessionToken } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [
  { title: 'E-Code - Build & Deploy Production Apps in Minutes' },
  {
    name: 'description',
    content:
      'E-Code combines AI agents, cloud infrastructure, and enterprise security to deliver Fortune 500 development velocity to every team.',
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const host = request.headers.get('host')?.toLowerCase() ?? '';

  if (host === 'app.e-code.ai') {
    return redirect(readSessionToken(request) ? '/dashboard' : '/login');
  }

  return null;
}

const cloudComputingImg =
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop';

const modernSoftwareImg = 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2070&auto=format&fit=crop';

const codingWorkspaceImg =
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=2072&auto=format&fit=crop';

const examples = [
  {
    icon: ShoppingCart,
    label: 'E-commerce Platform',
    text: 'Build a full-stack e-commerce marketplace with Stripe payments, product catalog with search and filters, shopping cart with checkout flow, user authentication, order management dashboard',
    tone: 'orange',
    id: 'ecommerce',
  },
  {
    icon: MessageSquare,
    label: 'Real-time Chat',
    text: 'Create a Slack-like real-time messaging platform with WebSocket connections, public and private channels, direct messages, file sharing, typing indicators',
    tone: 'amber',
    id: 'chat',
  },
  {
    icon: Bot,
    label: 'AI Assistant',
    text: 'Build an intelligent AI chatbot with OpenAI GPT-5 integration, conversation memory, document upload for RAG knowledge base, streaming responses',
    tone: 'deep',
    id: 'chatbot',
  },
  {
    icon: Globe,
    label: 'Analytics Dashboard',
    text: 'Design a Fortune 500-grade analytics dashboard with real-time interactive charts, KPI widgets, data tables with filtering, date range picker',
    tone: 'gold',
    id: 'dashboard',
  },
  {
    icon: Briefcase,
    label: 'SaaS Starter',
    text: 'Create a complete SaaS starter kit with landing page, pricing tiers, Stripe subscription billing, user authentication, team management',
    tone: 'deep',
    id: 'saas',
  },
  {
    icon: ListTodo,
    label: 'Project Management',
    text: 'Build a Jira-like project management tool with drag-and-drop Kanban boards, sprint planning, task assignments, time tracking',
    tone: 'orange',
    id: 'project',
  },
] as const;

const stats = [
  { label: 'Active Developers', value: '2M+', icon: Users },
  { label: 'Apps Deployed', value: '10M+', icon: Rocket },
  { label: 'Lines of Code', value: '5B+', icon: FileCode2 },
  { label: 'Uptime SLA', value: '99.99%', icon: Gauge },
] as const;

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
] as const;

const templates = [
  {
    name: 'SaaS Starter',
    description: 'Complete SaaS with auth, billing, dashboard',
    icon: Briefcase,
    category: 'Business',
  },
  { name: 'E-Commerce', description: 'Full store with cart, checkout, inventory', icon: Store, category: 'Commerce' },
  {
    name: 'Analytics Dashboard',
    description: 'Real-time charts and data visualization',
    icon: BarChart3,
    category: 'Analytics',
  },
  {
    name: 'Chat Application',
    description: 'Real-time messaging with WebSocket',
    icon: MessageSquare,
    category: 'Communication',
  },
  {
    name: 'Documentation',
    description: 'Beautiful docs with search and versioning',
    icon: FileCode2,
    category: 'Content',
  },
  { name: 'Admin Panel', description: 'Full admin dashboard with CRUD', icon: Gauge, category: 'Business' },
] as const;

const features = [
  {
    icon: Rocket,
    title: 'Enterprise-Grade Infrastructure',
    description: 'Built on Fortune 500 standards with 99.99% uptime SLA, auto-scaling, and global CDN distribution',
  },
  {
    icon: Brain,
    title: 'AI-Powered Development',
    description: 'Advanced AI agents that understand context, write production code, and deploy automatically',
  },
  {
    icon: Shield,
    title: 'Bank-Level Security',
    description: 'SOC 2 Type II certified with end-to-end encryption, RBAC, and continuous security monitoring',
  },
  {
    icon: Users2,
    title: 'Real-Time Collaboration',
    description: 'Multiple developers can code simultaneously with instant sync and conflict resolution',
  },
  {
    icon: Gauge,
    title: '10x Faster Development',
    description: 'Ship features in minutes instead of months with our optimized development pipeline',
  },
  {
    icon: Globe2,
    title: 'Global Edge Deployment',
    description: 'Deploy to 200+ edge locations worldwide with automatic SSL and DDoS protection',
  },
] as const;

const languages = [
  { name: 'Python', icon: SiPython, color: '#3776AB' },
  { name: 'JavaScript', icon: SiJavascript, color: '#F7DF1E' },
  { name: 'TypeScript', icon: SiTypescript, color: '#3178C6' },
  { name: 'Go', icon: SiGo, color: '#00ADD8' },
  { name: 'React', icon: SiReact, color: '#61DAFB' },
  { name: 'Node.js', icon: SiNodedotjs, color: '#339933' },
  { name: 'Rust', icon: SiRust, color: '#F97316' },
  { name: 'PHP', icon: SiPhp, color: '#777BB4' },
  { name: 'Docker', icon: SiDocker, color: '#2496ED' },
  { name: 'Kubernetes', icon: SiKubernetes, color: '#326CE5' },
] as const;

const workflow = [
  {
    icon: MessageSquare,
    title: 'Describe Your App',
    description: 'Tell our AI what you want to build in plain language',
  },
  { icon: Code, title: 'AI Generates Code', description: 'Watch as production-ready code is created in real-time' },
  { icon: Rocket, title: 'Deploy Instantly', description: 'One-click deployment to global edge network' },
  { icon: CheckCircle, title: 'Scale Automatically', description: 'Auto-scaling infrastructure handles any traffic' },
] as const;

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
] as const;

export default function LandingPageRoute() {
  const navigate = useNavigate();
  const [appDescription, setAppDescription] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startBuilding = () => {
    const params = appDescription.trim() ? `?prompt=${encodeURIComponent(appDescription.trim())}` : '';
    navigate(`/register${params}`);
  };

  return (
    <PublicShell>
      <section className="vc-ecode-hero" data-testid="section-hero">
        <div className="vc-ecode-hero-bg" aria-hidden>
          <img src={cloudComputingImg} alt="" loading="eager" decoding="async" />
        </div>
        <div className="vc-ecode-grid-pattern" aria-hidden />

        <div className="vc-ecode-container vc-ecode-hero-inner">
          <span className="vc-ecode-badge" data-testid="badge-hero">
            <Sparkles className="h-4 w-4" aria-hidden />
            AI-Powered Enterprise Development Platform
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>

          <h1 className="vc-ecode-hero-title" data-testid="heading-hero">
            <span>Build &amp; Deploy</span>
            <span>Production Apps</span>
            <span>in Minutes</span>
          </h1>

          <p className="vc-ecode-hero-copy" data-testid="text-hero-description">
            The only platform that combines AI agents, cloud infrastructure, and enterprise security to deliver Fortune
            500 development velocity to every team.
          </p>

          <div className="vc-ecode-prompt">
            <div className="vc-ecode-prompt-glow" aria-hidden />
            <div className="vc-ecode-prompt-box">
              <input
                type="text"
                placeholder="Describe your app idea in any language..."
                value={appDescription}
                onChange={(event) => setAppDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && appDescription.trim()) {
                    startBuilding();
                  }
                }}
                data-testid="input-app-description"
              />
              <button
                type="button"
                onClick={startBuilding}
                disabled={!appDescription.trim()}
                data-testid="button-hero-build-now"
              >
                <Sparkles className="h-5 w-5" aria-hidden />
                Build Now
              </button>
            </div>
          </div>

          <div className="vc-ecode-examples">
            <p>Try these popular examples:</p>
            <div>
              {examples.map((example) => {
                const Icon = example.icon;
                return (
                  <button
                    key={example.id}
                    type="button"
                    className="vc-ecode-example"
                    data-tone={example.tone}
                    onClick={() => setAppDescription(example.text)}
                    data-testid={`button-example-${example.id}`}
                  >
                    <span>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    {example.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="vc-ecode-proof-row">
            {['No credit card required', 'Deploy instantly', 'Scale to millions'].map((item) => (
              <span key={item}>
                <CheckCircle className="h-4 w-4" aria-hidden />
                {item}
              </span>
            ))}
          </div>

          <div className="vc-ecode-hero-actions">
            <Button
              type="button"
              variant="outline"
              className="vc-ecode-outline-button"
              onClick={() => document.getElementById('video-demo')?.scrollIntoView({ behavior: 'smooth' })}
              data-testid="button-hero-watch-demo"
            >
              <PlayCircle className="h-5 w-5" aria-hidden />
              Watch Demo (2 min)
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="vc-ecode-ghost-button"
              onClick={() => navigate('/pricing')}
              data-testid="button-hero-view-pricing"
            >
              View Pricing
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>
      </section>

      <section className="vc-ecode-stats" data-testid="section-stats">
        <div className="vc-ecode-container">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} data-testid={`container-stat-${index}`}>
                <span data-testid={`icon-stat-${index}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <strong data-testid={`text-stat-value-${index}`}>{stat.value}</strong>
                <small data-testid={`text-stat-label-${index}`}>{stat.label}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section id="video-demo" className="vc-ecode-section vc-ecode-section-muted" data-testid="section-video-demo">
        <div className="vc-ecode-container">
          <SectionHeader
            title="See E-Code Platform in Action"
            description="Watch a real demo: Build and deploy a full-stack application in under 2 minutes using AI agents"
          />
          <div className="vc-ecode-video-card">
            <div className="vc-ecode-video-frame">
              <video
                ref={videoRef}
                poster={modernSoftwareImg}
                muted={isMuted}
                loop
                playsInline
                aria-label="E-Code platform demo poster"
              />
              <button
                type="button"
                className="vc-ecode-video-play"
                onClick={() => {
                  if (!videoRef.current) {
                    return;
                  }

                  if (isPlaying) {
                    videoRef.current.pause();
                  } else {
                    void videoRef.current.play().catch(() => undefined);
                  }

                  setIsPlaying(!isPlaying);
                }}
                data-testid="button-video-play-toggle"
              >
                {isPlaying ? <Pause className="h-8 w-8" aria-hidden /> : <Play className="h-8 w-8" aria-hidden />}
              </button>
              <div className="vc-ecode-video-controls">
                <button
                  type="button"
                  onClick={() => {
                    setIsMuted((current) => !current);

                    if (videoRef.current) {
                      videoRef.current.muted = !videoRef.current.muted;
                    }
                  }}
                  data-testid="button-video-mute-toggle"
                  aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                >
                  {isMuted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => void videoRef.current?.requestFullscreen?.()}
                  data-testid="button-video-fullscreen"
                  aria-label="Open video fullscreen"
                >
                  <Maximize className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
            <div className="vc-ecode-video-caption">
              <h3>Live Platform Demo</h3>
              <p>Watch how E-Code Platform's AI agent builds a complete full-stack application</p>
              <div>
                {['AI Code Generation', 'Real-time Preview', 'Instant Deployment'].map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingCards />

      <section className="vc-ecode-cta" data-testid="section-cta">
        <div className="vc-ecode-container">
          <h2>Ready to Build Something Amazing?</h2>
          <p>Join 2M+ developers shipping production apps faster than ever</p>
          <div>
            <Link to="/register">
              <Sparkles className="h-5 w-5" aria-hidden />
              Start Building Free
            </Link>
            <Link to="/pricing">
              View Enterprise Plans
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function LandingCards() {
  return (
    <>
      <section className="vc-ecode-section" data-testid="section-projects">
        <div className="vc-ecode-container">
          <SectionHeader
            title="Built with E-Code Platform"
            description="Real production applications built by our community in hours, not months"
          />
          <div className="vc-ecode-card-grid">
            {projects.map((project) => (
              <article key={project.title} className="vc-ecode-project-card">
                <div>
                  <img src={project.image} alt={project.title} loading="lazy" decoding="async" />
                  <span>
                    <strong>{project.title}</strong>
                    <small>{project.stats}</small>
                  </span>
                </div>
                <p>{project.description}</p>
                <footer>
                  {project.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="vc-ecode-section vc-ecode-section-muted" data-testid="section-templates">
        <div className="vc-ecode-container">
          <SectionHeader
            title="Start with Templates"
            description="Production-ready templates to accelerate your development"
          />
          <div className="vc-ecode-card-grid">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <Link key={template.name} to="/templates" className="vc-ecode-template-card">
                  <span>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <strong>{template.name}</strong>
                    <small>{template.category}</small>
                  </div>
                  <p>{template.description}</p>
                </Link>
              );
            })}
          </div>
          <div className="vc-ecode-center-action">
            <Link to="/templates">
              View All Templates
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <section className="vc-ecode-section" data-testid="section-features">
        <div className="vc-ecode-container">
          <SectionHeader
            title="Enterprise Features, Startup Speed"
            description="Everything you need to build, deploy, and scale production applications"
          />
          <div className="vc-ecode-card-grid">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="vc-ecode-feature-card" data-testid={`card-feature-${index}`}>
                  <span data-testid={`icon-feature-${index}`}>
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 data-testid={`text-feature-title-${index}`}>{feature.title}</h3>
                  <p data-testid={`text-feature-description-${index}`}>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="vc-ecode-section vc-ecode-languages" data-testid="section-languages">
        <div className="vc-ecode-container">
          <SectionHeader
            title="Every Language, Every Framework"
            description="Build with your favorite tools - we support 29+ languages and all major frameworks"
          />
          <div>
            {languages.map((language) => {
              const Icon = language.icon;
              return (
                <article key={language.name}>
                  <span>
                    <Icon className="h-8 w-8" style={{ color: language.color }} aria-hidden />
                  </span>
                  <small>{language.name}</small>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="vc-ecode-section vc-ecode-section-muted" data-testid="section-workflow">
        <div className="vc-ecode-container">
          <SectionHeader title="How It Works" description="From idea to production in 4 simple steps" />
          <div className="vc-ecode-workflow">
            {workflow.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title}>
                  <span>
                    <Icon className="h-8 w-8" aria-hidden />
                    <small>{index + 1}</small>
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="vc-ecode-section" data-testid="section-testimonials">
        <div className="vc-ecode-container">
          <SectionHeader
            title="Trusted by Industry Leaders"
            description="See what engineering leaders are saying about E-Code Platform"
          />
          <div className="vc-ecode-card-grid vc-ecode-testimonials">
            {testimonials.map((testimonial) => (
              <article key={testimonial.author}>
                <div aria-label="5 star rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5" aria-hidden />
                  ))}
                </div>
                <blockquote>"{testimonial.quote}"</blockquote>
                <footer>
                  <span>{testimonial.avatar}</span>
                  <div>
                    <strong>{testimonial.author}</strong>
                    <small>{testimonial.role}</small>
                    <small>{testimonial.company}</small>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="vc-ecode-section-head">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
