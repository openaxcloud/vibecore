import { CheckCircle2, GitBranch, Globe, MessageSquare, Shield, Users, Zap } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Button, Link } from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function PublicTeamPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />
      {/* Hero Section */}
      <section className="relative py-20 px-4 bg-gradient-to-b from-[#F26207]/5 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="mkt-h1 mb-6 bg-gradient-to-r from-[#F26207] to-[#F99D25] text-transparent bg-clip-text">
            Build Together, Ship Faster
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            Real-time collaboration that feels like magic. Code, debug, and deploy with your team in perfect sync.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="text-[15px] px-8">
                Start Collaborating Free
              </Button>
            </Link>
            <Link href="/contact-sales">
              <Button size="lg" variant="outline" className="text-[15px] px-8">
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">Everything Your Team Needs</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="p-6 rounded-lg border bg-card">
              <Users className="w-12 h-12 text-[#F26207] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Real-time Multiplayer</h3>
              <p className="text-gray-600 dark:text-gray-400">
                See teammates' cursors, selections, and edits in real-time. It's like being in the same room.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <GitBranch className="w-12 h-12 text-[#F26207] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Advanced Version Control</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Built-in Git with visual branching, merge conflict resolution, and code review tools.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <MessageSquare className="w-12 h-12 text-green-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Integrated Communication</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Voice chat, video calls, and threaded discussions right in your workspace.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <Shield className="w-12 h-12 text-red-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Enterprise Security</h3>
              <p className="text-gray-600 dark:text-gray-400">
                SSO, 2FA, audit logs, and granular permissions to keep your code secure.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <Zap className="w-12 h-12 text-yellow-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Instant Environments</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Spin up identical development environments for every team member in seconds.
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <Globe className="w-12 h-12 text-[#F26207] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Global Performance</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Low-latency collaboration from anywhere with our global edge network.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">Built for Modern Teams</h2>
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-semibold mb-4">Remote Teams</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Bridge the distance with real-time collaboration that makes remote feel local. Share screens, pair
                program, and ship code together from anywhere in the world.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Live presence indicators</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Voice and video chat</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Timezone-aware scheduling</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-4">Educational Institutions</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Transform how students learn to code. Teachers can jump into any student's project, provide real-time
                feedback, and track progress effortlessly.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Classroom management tools</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Assignment distribution</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Progress tracking</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">Loved by Teams Worldwide</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-lg border bg-card">
              <p className="text-gray-600 dark:text-gray-400 mb-4 italic">
                "E-Code transformed how our distributed team works. We ship 3x faster and onboard new developers in
                hours, not weeks."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#F26207] to-[#F99D25]"></div>
                <div>
                  <p className="font-semibold">Sarah Chen</p>
                  <p className="text-[13px] text-gray-500">CTO, TechStart</p>
                </div>
              </div>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <p className="text-gray-600 dark:text-gray-400 mb-4 italic">
                "The real-time collaboration features are game-changing. Our team feels more connected than ever,
                despite being across 5 time zones."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#F26207] to-[#F99D25]"></div>
                <div>
                  <p className="font-semibold">Marcus Johnson</p>
                  <p className="text-[13px] text-gray-500">Engineering Lead, CloudScale</p>
                </div>
              </div>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <p className="text-gray-600 dark:text-gray-400 mb-4 italic">
                "Teaching programming has never been easier. I can help students debug in real-time and the whole class
                can learn together."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#F26207] to-[#F99D25]"></div>
                <div>
                  <p className="font-semibold">Dr. Emily Rodriguez</p>
                  <p className="text-[13px] text-gray-500">CS Professor, Tech University</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-[#F26207] to-[#F99D25] text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Transform Your Team's Workflow?</h2>
          <p className="text-xl mb-8 opacity-90">Join thousands of teams building amazing things together on E-Code.</p>
          <div className="flex gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="text-[15px] px-8">
                Start Free Trial
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="text-[15px] px-8 bg-transparent text-white border-white hover:bg-white hover:text-[#F26207]"
              >
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
