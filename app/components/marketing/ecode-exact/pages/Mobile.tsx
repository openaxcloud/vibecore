import {
  Smartphone,
  Code,
  Cloud,
  Users,
  Shield,
  Terminal,
  Sparkles,
  Globe,
  Play,
  FileCode,
  Package,
  GitBranch,
  Layers,
  Wifi,
  Star,
  QrCode,
  Apple,
  Chrome,
  ArrowRight,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useMarketingNavigate,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function Mobile() {
  const navigate = useMarketingNavigate();

  const features = [
    {
      id: 'editor',
      icon: <Code className="h-6 w-6" />,
      title: 'Full-Featured Editor',
      description: 'Syntax highlighting, autocomplete, and multi-file editing',
      image: '/mobile-editor.png',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'terminal',
      icon: <Terminal className="h-6 w-6" />,
      title: 'Integrated Terminal',
      description: 'Run commands, install packages, and debug your code',
      image: '/mobile-terminal.png',
      color: 'from-green-500 to-emerald-500',
    },
    {
      id: 'ai',
      icon: <Sparkles className="h-6 w-6" />,
      title: 'AI Assistant',
      description: 'Get code suggestions and explanations on the go',
      image: '/mobile-ai.png',
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'preview',
      icon: <Globe className="h-6 w-6" />,
      title: 'Live Preview',
      description: 'See your web apps running in real-time',
      image: '/mobile-preview.png',
      color: 'from-orange-500 to-red-500',
    },
    {
      id: 'collab',
      icon: <Users className="h-6 w-6" />,
      title: 'Real-time Collaboration',
      description: 'Code together with your team from anywhere',
      image: '/mobile-collab.png',
      color: 'from-indigo-500 to-purple-500',
    },
    {
      id: 'git',
      icon: <GitBranch className="h-6 w-6" />,
      title: 'Version Control',
      description: 'Commit, push, and manage branches on mobile',
      image: '/mobile-git.png',
      color: 'from-teal-500 to-blue-500',
    },
  ];

  const featureChecklists: Record<string, string[]> = {
    editor: [
      'IntelliSense, refactors, and AI inline help',
      'Multi-cursor editing with gestures',
      'Secure workspace secrets management',
    ],
    terminal: [
      'Full Linux terminal with GPU builds',
      'Project scripts one tap away',
      'Role-based access & audit trails',
    ],
    ai: [
      'Explain unfamiliar code instantly',
      'Generate tests, docs, and commit messages',
      'Works offline and syncs prompts when online',
    ],
    preview: [
      'Device frames for phones and tablets',
      'Shareable live URLs with edge deploy',
      'Network throttling and breakpoints',
    ],
    collab: [
      'Live cursors, audio rooms, and annotations',
      'Threaded reviews with suggested fixes',
      'Presence synced with Slack and Teams',
    ],
    git: [
      'Commit, cherry-pick, and revert on the go',
      'Protected branch rules built in',
      'CI status & release tracking from mobile',
    ],
  };

  const editorFiles: Record<string, string> = {
    'App.tsx': `import { Workspace, ActivityBar } from "@ecode/mobile";

export default function InventoryDashboard() {
  return (
    <Workspace name="Inventory" repo="acme/mobile-ops">
      <ActivityBar team="Field Ops" presence={5} />
    </Workspace>
  );
}
`,
    'routes.ts': `import { createRouter } from "@ecode/mobile/navigation";

export const routes = createRouter({
  home: { path: "/", screen: "Dashboard" },
  incidents: { path: "/incidents", screen: "IncidentFeed" },
  devices: { path: "/devices/:id", screen: "DeviceProfile" }
});
`,
    'mobile.config.json': `{
  "platforms": ["ios", "android", "web"],
  "edgeDeploy": true,
  "observability": {
    "traces": true,
    "metrics": true
  }
}
`,
  };

  const terminalCommands = [
    {
      command: 'ecode login --sso',
      output: ['Connected to org: acme-mobile', 'Using role: Field Ops Admin'],
    },
    {
      command: 'npm run test:mobile',
      output: ['Running Jest in mobile profile…', '✔ 212 tests passing in 34.2s'],
    },
    {
      command: 'ecode deploy mobile-app --target=edge',
      output: ['Packaging release 24.6.0…', 'Edge deploy live → https://m.acme.ecode.run'],
    },
  ];

  const aiScenarios = [
    {
      prompt: 'Optimize sync queue for slow networks',
      response: `AI Suggestion → Retry failed syncs with exponential backoff and persist to local KV storage.`,
      followup: 'Generate integration tests',
    },
    {
      prompt: 'Draft release notes for 24.6.0',
      response: `AI Draft → “Adds offline device diagnostics, accelerates deploy previews by 40%, and introduces SOC2 posture checks.”`,
      followup: 'Create changelog PR',
    },
    {
      prompt: 'Explain metrics hook in App.tsx',
      response: `AI Explanation → The hook batches telemetry events and streams to Edge metrics every 30s when battery > 20%.`,
      followup: 'Suggest refactor',
    },
  ];

  const previewDeviceOptions = [
    { name: 'iPhone 15 Pro', resolution: '1179 × 2556', latency: '32ms edge latency', theme: 'Dark' },
    { name: 'Pixel 8', resolution: '1080 × 2400', latency: '41ms edge latency', theme: 'Light' },
    { name: 'iPad Pro 13"', resolution: '2048 × 2732', latency: '27ms edge latency', theme: 'Dark' },
  ];

  const collabPresence = [
    {
      initials: 'SC',
      name: 'Sara Cole',
      status: 'Editing incidents.ts',
      location: 'NYC Ops',
      color: 'bg-pink-500/20 text-pink-200',
    },
    {
      initials: 'MG',
      name: 'Manny Green',
      status: 'Reviewing release notes',
      location: 'London',
      color: 'bg-blue-500/20 text-blue-200',
    },
    {
      initials: 'JL',
      name: 'Jamie Lee',
      status: 'Pairing in Live Share',
      location: 'Remote',
      color: 'bg-emerald-500/20 text-emerald-200',
    },
  ];

  const collabReviews = [
    {
      file: 'app/screens/Deployments.tsx',
      comment: '“Consider lazy-loading the analytics card for low bandwidth devices.”',
      author: 'Jamie Lee',
      time: '2 minutes ago',
    },
    {
      file: 'mobile.config.json',
      comment: '“Edge deploy looks great. Can we add rollback TTL?”',
      author: 'Sara Cole',
      time: '7 minutes ago',
    },
  ];

  const gitCommits = [
    {
      sha: 'a9c1f12',
      message: 'feat: offline queue with battery aware retries',
      author: 'Jamie L.',
      time: '2m ago',
      status: '✅ Checks passing',
    },
    {
      sha: '7fdb234',
      message: 'fix: ensure SOC2 audit logging on deploy',
      author: 'Manny G.',
      time: '18m ago',
      status: '⚠️ Awaiting approval',
    },
    {
      sha: '62ab8ff',
      message: 'chore: refresh device manifest schema',
      author: 'Release Bot',
      time: '1h ago',
      status: '✅ Checks passing',
    },
  ];

  const gitBranches = [
    {
      name: 'main',
      description: 'Protected · auto deploy to production',
      updated: 'Last deploy 42m ago',
    },
    {
      name: 'mobile/release-24.6',
      description: 'Release candidate · QA sign-off required',
      updated: 'QA checklist 92% complete',
    },
    {
      name: 'feature/predictive-sync',
      description: 'In review · 4 comments waiting',
      updated: 'Updated 9m ago',
    },
  ];

  const featureCount = features.length;

  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const [activeDemoFile, setActiveDemoFile] = useState(Object.keys(editorFiles)[0]);
  const [terminalStep, setTerminalStep] = useState(1);
  const [aiStep, setAiStep] = useState(0);
  const [aiSuggestionAccepted, setAiSuggestionAccepted] = useState(false);
  const [selectedPreviewDevice, setSelectedPreviewDevice] = useState(previewDeviceOptions[0]);
  const [previewOrientation, setPreviewOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [activeCollabTab, setActiveCollabTab] = useState<'presence' | 'reviews'>('presence');
  const [activeGitView, setActiveGitView] = useState<'commits' | 'branches'>('commits');
  const [gitSyncState, setGitSyncState] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [isAutoCycling, setIsAutoCycling] = useState(true);
  const resumeCycleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeFeature = features[activeFeatureIndex] ?? features[0];

  const handlePauseAutoCycle = () => {
    setIsAutoCycling(false);

    if (resumeCycleTimeoutRef.current) {
      clearTimeout(resumeCycleTimeoutRef.current);
    }

    resumeCycleTimeoutRef.current = setTimeout(() => {
      setIsAutoCycling(true);
    }, 15000);
  };

  const handleFeatureSelectByIndex = (index: number) => {
    handlePauseAutoCycle();
    setActiveFeatureIndex(index);
  };

  const handleFeatureSelectById = (featureId: string) => {
    const targetIndex = features.findIndex((feature) => feature.id === featureId);

    if (targetIndex !== -1) {
      handleFeatureSelectByIndex(targetIndex);
    }
  };

  useEffect(() => {
    if (!isAutoCycling || featureCount === 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      setActiveFeatureIndex((prev) => (prev + 1) % featureCount);
    }, 6000);

    return () => clearInterval(interval);
  }, [featureCount, isAutoCycling]);

  useEffect(() => {
    return () => {
      if (resumeCycleTimeoutRef.current) {
        clearTimeout(resumeCycleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (gitSyncState === 'syncing') {
      const timeout = setTimeout(() => setGitSyncState('done'), 1200);
      return () => clearTimeout(timeout);
    }

    if (gitSyncState === 'done') {
      const timeout = setTimeout(() => setGitSyncState('idle'), 4000);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [gitSyncState]);

  useEffect(() => {
    setAiSuggestionAccepted(false);
  }, [aiStep]);

  const handleRunNextCommand = () => {
    setTerminalStep((step) => Math.min(step + 1, terminalCommands.length));
  };

  const handleResetTerminal = () => {
    setTerminalStep(1);
  };

  const handleNextAiScenario = () => {
    setAiStep((step) => (step + 1) % aiScenarios.length);
  };

  const currentAIScenario = aiScenarios[aiStep];

  const renderHeroContent = (featureId: string) => {
    switch (featureId) {
      case 'editor':
        return (
          <pre className="text-left text-[11px] leading-relaxed font-mono text-emerald-200 bg-black/50 border border-white/10 rounded-lg p-4">
            {`import Workspace from "@ecode/mobile";
const session = Workspace.resume("inventory-app");

session.enableAI();
session.share({ team: "Field Ops" });
`}
          </pre>
        );
      case 'terminal':
        return (
          <div className="space-y-2 text-[11px] font-mono text-emerald-200">
            <div className="flex items-center justify-between text-emerald-300">
              <span>mobile@ecode:~/shipping-service</span>
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-100 border border-emerald-400/30">
                LIVE
              </Badge>
            </div>
            <div className="text-emerald-400">$ npm run deploy:edge</div>
            <div className="text-emerald-200/80">Building optimized bundle…</div>
            <div className="text-emerald-200/60">Edge deploy → mobile.acme.ecode.run</div>
          </div>
        );
      case 'ai':
        return (
          <div className="space-y-3 text-[11px]">
            <div className="rounded-lg bg-purple-500/20 border border-purple-400/30 p-3 text-purple-100">
              <p className="font-semibold flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> AI Pair
              </p>
              <p className="mt-2">“{currentAIScenario.prompt}”</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-[0.7rem] text-white/80">
              {currentAIScenario.response}
            </div>
          </div>
        );
      case 'preview':
        return (
          <div className="space-y-3 text-[11px] text-white/80">
            <Badge variant="secondary" className="bg-white/10 text-white border border-white/10 w-fit">
              Edge Preview
            </Badge>
            <p className="font-semibold text-[13px] text-white">{selectedPreviewDevice.name}</p>
            <p>{selectedPreviewDevice.resolution}</p>
            <p className="text-white/60">{selectedPreviewDevice.latency}</p>
          </div>
        );
      case 'collab':
        return (
          <div className="space-y-2 text-[11px] text-white/80">
            {collabPresence.map((member) => (
              <div key={member.name} className="flex items-center gap-3">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[0.65rem] ${member.color}`}>
                  {member.initials}
                </div>
                <div>
                  <p className="text-white text-[13px] font-semibold">{member.name}</p>
                  <p className="text-white/60">{member.status}</p>
                </div>
              </div>
            ))}
          </div>
        );
      case 'git':
        return (
          <div className="space-y-2 text-[11px] text-white/80">
            {gitCommits.slice(0, 2).map((commit) => (
              <div key={commit.sha} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-white text-[13px] font-semibold">{commit.message}</p>
                <p className="text-white/60">
                  {commit.sha} · {commit.time}
                </p>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  const renderFeatureDemo = (featureId: string) => {
    switch (featureId) {
      case 'editor':
        return (
          <div className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 mb-3">
              <div className="flex flex-wrap gap-2">
                {Object.keys(editorFiles).map((file) => (
                  <button
                    key={file}
                    onClick={() => setActiveDemoFile(file)}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      activeDemoFile === file
                        ? 'bg-white/10 text-white shadow'
                        : 'text-white/60 hover:text-white/90 bg-white/5'
                    }`}
                  >
                    {file}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/signup')}
                className="gap-2 bg-white/15 text-white border-0 hover:bg-white/25"
              >
                <Play className="h-3.5 w-3.5" /> Run project
              </Button>
            </div>
            <pre className="bg-[var(--ecode-terminal-bg)] text-left text-[11px] leading-relaxed font-mono text-emerald-200/90 p-4 rounded-lg border border-white/5 overflow-x-auto">
              {editorFiles[activeDemoFile]}
            </pre>
          </div>
        );
      case 'terminal':
        return (
          <div className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-[11px] text-white/70 font-mono">
              <span>mobile@ecode:~/checkout-service</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunNextCommand}
                  disabled={terminalStep >= terminalCommands.length}
                  className="border-white/20 text-white/80 hover:bg-white/10 disabled:text-white/40"
                >
                  Run next command
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetTerminal}
                  className="text-white/60 hover:text-white"
                >
                  Reset
                </Button>
              </div>
            </div>
            <div className="space-y-3 font-mono text-[11px]">
              {terminalCommands.slice(0, terminalStep).map((entry) => (
                <div key={entry.command} className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="text-emerald-300">$ {entry.command}</p>
                  <div className="mt-2 space-y-1 text-emerald-200/90">
                    {entry.output.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'ai':
        return (
          <div className="space-y-4 text-[13px] text-white/80">
            <div className="rounded-xl border border-purple-400/30 bg-purple-500/15 p-4">
              <p className="text-[11px] uppercase tracking-wide text-purple-200/80">Prompt</p>
              <p className="mt-1 text-white font-semibold">{currentAIScenario.prompt}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-wide text-white/60">AI Response</p>
              <p className="mt-2 text-[13px]">{currentAIScenario.response}</p>
              {aiSuggestionAccepted && (
                <Badge variant="success" className="mt-3 w-fit">
                  Applied to App.tsx
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleNextAiScenario}
                className="bg-white/15 text-white border-0 hover:bg-white/25"
              >
                Next scenario
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAiSuggestionAccepted(true)}
                className="border-white/20 text-white/80 hover:bg-white/10"
              >
                Apply suggestion
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/mobile-apps')}
                className="text-white/70 hover:text-white"
              >
                Create {currentAIScenario.followup}
              </Button>
            </div>
          </div>
        );
      case 'preview':
        return (
          <div className="space-y-4 text-white/80">
            <div className="flex flex-wrap gap-2">
              {previewDeviceOptions.map((device) => (
                <Button
                  key={device.name}
                  variant={selectedPreviewDevice.name === device.name ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPreviewDevice(device)}
                  className={`${selectedPreviewDevice.name === device.name ? 'bg-white/20 text-white border-0' : 'border-white/20 text-white/70 hover:text-white'}`}
                >
                  {device.name}
                </Button>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] text-white font-semibold">{selectedPreviewDevice.name}</p>
                  <p className="text-[11px] text-white/60">{selectedPreviewDevice.resolution}</p>
                  <p className="text-[11px] text-white/60">{selectedPreviewDevice.latency}</p>
                  <Badge variant="secondary" className="mt-3 bg-white/10 text-white border border-white/10">
                    {previewOrientation === 'portrait' ? 'Portrait' : 'Landscape'} · {selectedPreviewDevice.theme}
                  </Badge>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div
                    className={`relative rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-primary/20 via-purple-600/20 to-pink-600/30 flex items-center justify-center text-white text-[11px] font-medium ${previewOrientation === 'portrait' ? 'h-[220px] w-[120px]' : 'h-[150px] w-[240px]'}`}
                  >
                    <span>Preview #{previewOrientation === 'portrait' ? 'A' : 'B'}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPreviewOrientation((orientation) => (orientation === 'portrait' ? 'landscape' : 'portrait'))
                    }
                    className="border-white/20 text-white/80 hover:bg-white/10 gap-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Toggle orientation
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/deploy')}
              className="text-white/70 hover:text-white"
            >
              Open edge deploy dashboard
            </Button>
          </div>
        );
      case 'collab':
        return (
          <div className="space-y-4 text-white/80">
            <div className="flex gap-2">
              <Button
                variant={activeCollabTab === 'presence' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setActiveCollabTab('presence')}
                className={`${activeCollabTab === 'presence' ? 'bg-white/20 text-white border-0' : 'border-white/20 text-white/70 hover:text-white'}`}
              >
                Live presence
              </Button>
              <Button
                variant={activeCollabTab === 'reviews' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setActiveCollabTab('reviews')}
                className={`${activeCollabTab === 'reviews' ? 'bg-white/20 text-white border-0' : 'border-white/20 text-white/70 hover:text-white'}`}
              >
                Code reviews
              </Button>
            </div>
            {activeCollabTab === 'presence' ? (
              <div className="space-y-3">
                {collabPresence.map((member) => (
                  <div
                    key={member.name}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center text-[13px] font-semibold ${member.color}`}
                      >
                        {member.initials}
                      </div>
                      <div>
                        <p className="text-white font-semibold">{member.name}</p>
                        <p className="text-[11px] text-white/60">{member.status}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-white/10 text-white border border-white/10 text-[11px]">
                      {member.location}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {collabReviews.map((review) => (
                  <div key={review.file} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/60">{review.file}</p>
                    <p className="mt-2 text-[13px] text-white">{review.comment}</p>
                    <p className="mt-2 text-[11px] text-white/50">
                      {review.author} · {review.time}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/mobile-apps')}
                        className="text-white/70 hover:text-white"
                      >
                        Reply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/mobile-admin')}
                        className="border-white/20 text-white/70 hover:text-white"
                      >
                        Approve change
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/mobile-apps')}
                className="bg-white/15 text-white border-0 hover:bg-white/25"
              >
                Start live session
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/mobile-admin')}
                className="border-white/20 text-white/80 hover:text-white"
              >
                Schedule review
              </Button>
            </div>
          </div>
        );
      case 'git':
        return (
          <div className="space-y-4 text-white/80">
            <div className="flex gap-2">
              <Button
                variant={activeGitView === 'commits' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setActiveGitView('commits')}
                className={`${activeGitView === 'commits' ? 'bg-white/20 text-white border-0' : 'border-white/20 text-white/70 hover:text-white'}`}
              >
                Commits
              </Button>
              <Button
                variant={activeGitView === 'branches' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setActiveGitView('branches')}
                className={`${activeGitView === 'branches' ? 'bg-white/20 text-white border-0' : 'border-white/20 text-white/70 hover:text-white'}`}
              >
                Branches
              </Button>
            </div>
            {activeGitView === 'commits' ? (
              <div className="space-y-3">
                {gitCommits.map((commit) => (
                  <div key={commit.sha} className="rounded-xl border border-white/10 bg-black/40 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-white font-semibold">{commit.message}</p>
                      <Badge variant="secondary" className="bg-white/10 text-white border border-white/10 text-[11px]">
                        {commit.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[11px] text-white/60">
                      {commit.sha} · {commit.author} · {commit.time}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {gitBranches.map((branch) => (
                  <div key={branch.name} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-white font-semibold">{branch.name}</p>
                    <p className="text-[11px] text-white/60 mt-1">{branch.description}</p>
                    <p className="text-[11px] text-white/50 mt-2">{branch.updated}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => gitSyncState !== 'syncing' && setGitSyncState('syncing')}
                className={`border-0 text-white ${gitSyncState === 'syncing' ? 'bg-white/30' : 'bg-white/15 hover:bg-white/25'}`}
              >
                {gitSyncState === 'syncing' ? 'Syncing…' : gitSyncState === 'done' ? 'Synced' : 'Sync workspace'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/mobile-apps')}
                className="border-white/20 text-white/80 hover:text-white"
              >
                Open release board
              </Button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const testimonials = [
    {
      name: 'Sarah Chen',
      role: 'Full Stack Developer',
      avatar: 'SC',
      content: 'I can review PRs and fix bugs during my commute. The mobile experience is incredibly smooth!',
      rating: 5,
    },
    {
      name: 'Alex Rivera',
      role: 'Student',
      avatar: 'AR',
      content: 'Perfect for learning on the go. I practice coding problems between classes.',
      rating: 5,
    },
    {
      name: 'Marcus Johnson',
      role: 'DevOps Engineer',
      avatar: 'MJ',
      content: 'Being able to SSH and run scripts from my phone has saved me countless times.',
      rating: 5,
    },
  ];

  const capabilities = [
    {
      icon: <FileCode className="h-5 w-5" />,
      title: '50+ Languages',
      description: 'Python, JavaScript, Go, Rust, and more',
    },
    {
      icon: <Package className="h-5 w-5" />,
      title: 'Package Management',
      description: 'npm, pip, cargo - all at your fingertips',
    },
    {
      icon: <Layers className="h-5 w-5" />,
      title: 'Multi-file Projects',
      description: 'Work with complex codebases on mobile',
    },
    {
      icon: <Wifi className="h-5 w-5" />,
      title: 'Offline Mode',
      description: 'Code without internet, sync when connected',
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: 'Secure Storage',
      description: 'Your code is encrypted and protected',
    },
    {
      icon: <Cloud className="h-5 w-5" />,
      title: 'Cloud Sync',
      description: 'Seamless sync across all devices',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-600/20 to-pink-600/20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(var(--primary),0.2),transparent_50%)]" />

          <div className="relative py-20 px-4">
            <div className="container mx-auto max-w-7xl">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="text-center lg:text-left space-y-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <span className="text-[13px] font-medium">Available on iOS & Android</span>
                  </div>

                  <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold">
                    Code on the go with
                    <span className="block mt-2 bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent">
                      E-Code Mobile
                    </span>
                  </h1>

                  <p className="text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                    The full power of E-Code in your pocket. Write, run, and deploy code from anywhere with our native
                    mobile apps.
                  </p>

                  {/* Download buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                    <a
                      href="https://apps.apple.com/app/ecode"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative overflow-hidden rounded-lg bg-black p-[1px] transition-all hover:scale-105"
                      data-testid="link-download-ios-hero"
                    >
                      <div className="relative flex items-center gap-3 bg-black px-6 py-3 rounded-lg">
                        <Apple className="h-8 w-8 text-white" />
                        <div className="text-left">
                          <p className="text-[11px] text-gray-300">Download on the</p>
                          <p className="text-[15px] font-semibold text-white">App Store</p>
                        </div>
                      </div>
                    </a>

                    <a
                      href="https://play.google.com/store/apps/details?id=com.ecode.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative overflow-hidden rounded-lg bg-black p-[1px] transition-all hover:scale-105"
                      data-testid="link-download-android-hero"
                    >
                      <div className="relative flex items-center gap-3 bg-black px-6 py-3 rounded-lg">
                        <Chrome className="h-8 w-8 text-white" />
                        <div className="text-left">
                          <p className="text-[11px] text-gray-300">Get it on</p>
                          <p className="text-[15px] font-semibold text-white">Google Play</p>
                        </div>
                      </div>
                    </a>
                  </div>

                  {/* QR Code section */}
                  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg max-w-fit mx-auto lg:mx-0">
                    <QrCode className="h-16 w-16 text-muted-foreground" />
                    <div className="text-left">
                      <p className="text-[13px] font-medium">Scan to download</p>
                      <p className="text-[11px] text-muted-foreground">Or visit e-code.ai/mobile</p>
                    </div>
                  </div>
                </div>

                {/* Interactive Phone Mockup */}
                <div className="relative">
                  <div className="relative mx-auto w-[320px] h-[640px]">
                    {/* Phone frame */}
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800 rounded-[3rem] shadow-2xl">
                      {/* Screen */}
                      <div className="absolute inset-[14px] bg-black rounded-[2.5rem] overflow-hidden">
                        {/* Dynamic content based on active feature */}
                        <div className="relative w-full h-full bg-gradient-to-br from-gray-900 to-black">
                          {/* Status bar */}
                          <div className="absolute top-0 left-0 right-0 h-10 bg-black/50 flex items-center justify-between px-6 text-white text-[11px]">
                            <span>9:41</span>
                            <div className="flex gap-1">
                              <div className="w-4 h-3 bg-white rounded-sm"></div>
                              <div className="w-4 h-3 bg-white rounded-sm"></div>
                              <div className="w-4 h-3 bg-white rounded-sm"></div>
                            </div>
                          </div>

                          {/* App content */}
                          <div className="pt-10 h-full">
                            <div
                              className={`absolute inset-x-0 top-10 bottom-0 bg-gradient-to-br ${activeFeature.color} opacity-20`}
                            />
                            <div className="relative p-6 text-white h-full flex flex-col gap-4">
                              <div className="flex items-center gap-3">
                                <div className="p-3 bg-white/20 rounded-xl">{activeFeature.icon}</div>
                                <h3 className="text-xl font-semibold">{activeFeature.title}</h3>
                              </div>
                              <p className="text-[13px] text-gray-300 leading-relaxed">{activeFeature.description}</p>
                              <div className="mt-2 bg-black/30 rounded-lg p-4 flex-1 overflow-hidden">
                                {renderHeroContent(activeFeature.id)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Phone details */}
                    <div className="absolute -left-[2px] top-[120px] w-[3px] h-[60px] bg-gray-700 rounded-r-lg"></div>
                    <div className="absolute -left-[2px] top-[200px] w-[3px] h-[60px] bg-gray-700 rounded-r-lg"></div>
                    <div className="absolute -right-[2px] top-[160px] w-[3px] h-[80px] bg-gray-700 rounded-l-lg"></div>
                  </div>

                  {/* Feature selector dots */}
                  <div className="flex justify-center gap-2 mt-8">
                    {features.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => handleFeatureSelectByIndex(index)}
                        className={`h-2 w-2 rounded-full transition-all ${
                          index === activeFeatureIndex
                            ? 'w-8 bg-primary'
                            : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                        }`}
                        aria-label={`Show ${features[index].title}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Showcase */}
        <section className="py-24 px-4">
          <div className="container mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-[13px] font-medium mb-4">
                <Sparkles className="h-4 w-4" />
                Mobile Features
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Everything you need, <span className="text-primary">anywhere you are</span>
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-3xl mx-auto">
                Our mobile apps are built from the ground up for touch, with all the power of the desktop experience
              </p>
            </div>

            <Tabs value={activeFeature.id} onValueChange={handleFeatureSelectById} className="w-full">
              <TabsList className="flex flex-wrap sm:flex-nowrap w-full max-w-4xl mx-auto mb-12 gap-2 overflow-x-auto rounded-xl bg-muted/60 p-2">
                {features.map((feature) => (
                  <TabsTrigger
                    key={feature.id}
                    value={feature.id}
                    className="flex-1 sm:flex-none min-w-[140px] gap-2 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
                  >
                    {feature.icon}
                    <span className="truncate">{feature.title}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {features.map((feature) => (
                <TabsContent key={feature.id} value={feature.id} className="mt-0 min-w-0">
                  <div className="grid min-w-0 lg:grid-cols-2 gap-12 items-start">
                    <div className="space-y-6 min-w-0">
                      <div
                        className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${feature.color} text-white shadow-lg`}
                      >
                        {feature.icon}
                      </div>
                      <h3 className="text-3xl font-bold">{feature.title}</h3>
                      <p className="text-[15px] text-muted-foreground">{feature.description}</p>

                      <ul className="space-y-3">
                        {(featureChecklists[feature.id] ?? []).map((item) => (
                          <li key={item} className="flex items-center gap-3">
                            <Check className="h-5 w-5 text-primary" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Feature mockup */}
                    <div className="relative min-w-0">
                      <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} blur-3xl opacity-20`} />
                      <div className="relative min-w-0 max-w-full bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-4 sm:p-6 shadow-2xl border border-white/10">
                        <div className="min-w-0 max-w-full bg-black/60 rounded-lg p-4 min-h-[400px] text-white">
                          {renderFeatureDemo(feature.id)}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>

        {/* Capabilities Grid */}
        <section className="py-24 px-4 bg-muted/50">
          <div className="container mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Professional development, <span className="text-primary">pocket-sized</span>
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-3xl mx-auto">
                No compromises. Get the full development experience on your mobile device.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {capabilities.map((capability, index) => (
                <Card key={index} className="group hover:shadow-xl transition-all duration-300">
                  <CardContent className="pt-6">
                    <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4 group-hover:scale-110 transition-transform">
                      {capability.icon}
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{capability.title}</h3>
                    <p className="text-muted-foreground">{capability.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Platform Comparison */}
        <section className="py-24 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Why developers choose <span className="text-primary">E-Code Mobile</span>
              </h2>
            </div>

            <div className="bg-muted/50 rounded-2xl p-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-6 text-red-500">Other Mobile Code Editors</h3>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
                        <span className="text-red-500 text-[13px]">✗</span>
                      </div>
                      <span className="text-muted-foreground">Limited language support</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
                        <span className="text-red-500 text-[13px]">✗</span>
                      </div>
                      <span className="text-muted-foreground">No package management</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
                        <span className="text-red-500 text-[13px]">✗</span>
                      </div>
                      <span className="text-muted-foreground">Basic text editing only</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
                        <span className="text-red-500 text-[13px]">✗</span>
                      </div>
                      <span className="text-muted-foreground">No collaboration features</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-2xl font-bold mb-6 text-primary">E-Code Mobile</h3>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span>50+ languages with full IDE features</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span>Built-in package managers</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span>Full terminal and debugging</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span>Real-time collaboration</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-24 px-4 bg-gradient-to-b from-background to-muted/50">
          <div className="container mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Loved by <span className="text-primary">2M+ developers</span>
              </h2>
              <div className="flex items-center justify-center gap-3 mt-6">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-6 w-6 text-yellow-500 fill-yellow-500" />
                  ))}
                </div>
                <span className="text-[15px] font-semibold">4.8/5</span>
                <span className="text-muted-foreground">(10,000+ reviews)</span>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <Card key={index} className="hover:shadow-xl transition-all duration-300">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-semibold">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <p className="font-semibold">{testimonial.name}</p>
                        <p className="text-[13px] text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                    <div className="flex mb-3">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      ))}
                    </div>
                    <p className="text-muted-foreground">{testimonial.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to code anywhere?</h2>
            <p className="text-xl text-muted-foreground mb-12">
              Code on the go with E-Code Mobile - your full IDE in your pocket
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center mb-12">
              <a
                href="https://apps.apple.com/app/ecode"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-lg bg-black p-[1px] transition-all hover:scale-105"
                data-testid="link-download-ios-cta"
              >
                <div className="relative flex items-center gap-3 bg-black px-8 py-4 rounded-lg">
                  <Apple className="h-10 w-10 text-white" />
                  <div className="text-left">
                    <p className="text-[13px] text-gray-300">Download on the</p>
                    <p className="text-xl font-semibold text-white">App Store</p>
                  </div>
                </div>
              </a>

              <a
                href="https://play.google.com/store/apps/details?id=com.ecode.app"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-lg bg-black p-[1px] transition-all hover:scale-105"
                data-testid="link-download-android-cta"
              >
                <div className="relative flex items-center gap-3 bg-black px-8 py-4 rounded-lg">
                  <Chrome className="h-10 w-10 text-white" />
                  <div className="text-left">
                    <p className="text-[13px] text-gray-300">Get it on</p>
                    <p className="text-xl font-semibold text-white">Google Play</p>
                  </div>
                </div>
              </a>
            </div>

            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/features')}
              className="gap-2"
              data-testid="button-explore-features"
            >
              Explore all features
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
