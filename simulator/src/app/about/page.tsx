'use client';

import Link from 'next/link';
import { Bot, Brain, Camera, Car, ChevronRight, Gamepad2, Globe, Layers, Target, Users, Zap } from 'lucide-react';

const phases = [
  {
    num: 1,
    title: 'Closed Tracks',
    status: 'live' as const,
    desc: 'Drive on structured tracks to learn the controls and generate baseline training data.',
    detail: 'Oval, S-Curves, and City Circuit tracks. Every lap you drive captures steering + throttle data paired with what the car "sees."',
    icon: Car,
  },
  {
    num: 2,
    title: 'Bigger Tracks with Choices',
    status: 'next' as const,
    desc: 'Tracks with forks, intersections, and obstacles — your decisions teach the model that multiple paths are valid.',
    detail: 'Y-junctions, roundabouts, parking lots with cones, night mode. Richer data = smarter model.',
    icon: Layers,
  },
  {
    num: 3,
    title: 'Open Campus Map',
    status: 'planned' as const,
    desc: 'Free-form driving in a virtual campus. Navigate between buildings, handle intersections, park.',
    detail: 'Waypoint missions, delivery challenges, free roam. The model learns navigation, not just lane-following.',
    icon: Globe,
  },
  {
    num: 4,
    title: 'Photo-Realistic Lab & Quad',
    status: 'planned' as const,
    desc: 'A 3D reconstruction of the real lab and quad area, built from photos. Drive in a sim that looks like the real world.',
    detail: 'Using photogrammetry or Gaussian splatting, we reconstruct the actual deployment environment. The model trained here transfers directly to the physical car.',
    icon: Camera,
  },
];

const statusColors = {
  live: 'bg-green-500',
  next: 'bg-yellow-500',
  planned: 'bg-gray-500',
};

const statusLabels = {
  live: 'LIVE',
  next: 'NEXT',
  planned: 'PLANNED',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0f23] to-[#1a1a2e] text-white">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-16">

        {/* Header */}
        <div className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to Simulator
          </Link>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            About Deep Racer
          </h1>
          <p className="text-xl text-gray-300 leading-relaxed">
            A gamified training environment where every lap you drive teaches an
            AI to race autonomously. Built by students at Laney College.
          </p>
        </div>

        {/* How it works */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-gray-700 rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center">
                <Gamepad2 className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold">1. You Drive</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Use keyboard or gamepad to drive around tracks in the browser.
                Every frame captures your steering angle, throttle, speed, and
                position at ~10 frames per second.
              </p>
            </div>
            <div className="bg-white/5 border border-gray-700 rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center">
                <Brain className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold">2. The AI Learns</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Your driving data feeds a neural network (PyTorch). The model
                learns to map camera images → steering angles using supervised
                learning from your demonstrations.
              </p>
            </div>
            <div className="bg-white/5 border border-gray-700 rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-green-600/20 flex items-center justify-center">
                <Car className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold">3. The Car Drives</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                The trained model is exported to ONNX, optimized with OpenVINO,
                and deployed to the physical DeepRacer vehicle. The car drives
                autonomously using what it learned from you.
              </p>
            </div>
          </div>
        </section>

        {/* AI Modes Explainer */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">AI Driving Modes</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-purple-900/20 border border-purple-700/40 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6 text-purple-400" />
                <h3 className="text-lg font-semibold">Demo AI (Waypoint Follower)</h3>
              </div>
              <div className="text-xs font-mono text-purple-400 bg-purple-900/30 rounded-lg px-3 py-1.5 inline-block">
                demo-v0 — currently active
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                This AI <strong className="text-purple-300">cheats</strong> — it has the
                track centerline coordinates hardcoded and simply steers toward
                the next waypoint. It knows the map perfectly because we gave it
                the map. It drives well but can&apos;t generalize to new environments.
              </p>
              <div className="text-xs text-gray-500 space-y-1">
                <div>✓ Knows exact track shape</div>
                <div>✓ Perfect path following</div>
                <div>✗ Can&apos;t see — no camera input</div>
                <div>✗ Useless on a new track or in the real world</div>
              </div>
            </div>
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-blue-400" />
                <h3 className="text-lg font-semibold">Trained Model (Coming Soon)</h3>
              </div>
              <div className="text-xs font-mono text-blue-400 bg-blue-900/30 rounded-lg px-3 py-1.5 inline-block">
                v0001+ — trained from your driving data
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                This AI sees <strong className="text-blue-300">only camera pixels</strong> —
                just like the real car. It must learn to recognize roads, turns,
                and obstacles from visual input alone. It will be wobbly at first
                and improve as the class drives more laps.
              </p>
              <div className="text-xs text-gray-500 space-y-1">
                <div>✓ Learns from human demonstrations</div>
                <div>✓ Generalizes to new situations</div>
                <div>✓ Transfers to the physical car</div>
                <div>✗ Needs lots of driving data to improve</div>
              </div>
            </div>
          </div>
        </section>

        {/* Environment Roadmap */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Environment Roadmap</h2>
          <div className="space-y-4">
            {phases.map((phase) => {
              const Icon = phase.icon;
              return (
                <div
                  key={phase.num}
                  className="bg-white/5 border border-gray-700 rounded-2xl p-6 flex gap-5"
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-gray-300" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">Phase {phase.num}: {phase.title}</h3>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white ${statusColors[phase.status]}`}>
                        {statusLabels[phase.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{phase.desc}</p>
                    <p className="text-xs text-gray-500">{phase.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Why your driving matters */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Why Your Driving Matters</h2>
          <div className="bg-white/5 border border-gray-700 rounded-2xl p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="font-medium">Diverse driving lines</span>
                </div>
                <p className="text-gray-400 text-xs pl-6">
                  30 students drive differently — some hug the inside, some take
                  wide lines. This variety teaches the model to handle many situations.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-yellow-400" />
                  <span className="font-medium">Recovery behavior</span>
                </div>
                <p className="text-gray-400 text-xs pl-6">
                  When you go off-track and correct, that&apos;s gold — the model
                  learns how to recover from mistakes, not just follow a perfect line.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="font-medium">Edge cases</span>
                </div>
                <p className="text-gray-400 text-xs pl-6">
                  Humans naturally explore weird situations — near-misses, sharp
                  corrections, unusual speeds. These are the hardest cases for AI.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <span className="font-medium">Imperfect is better</span>
                </div>
                <p className="text-gray-400 text-xs pl-6">
                  Paradoxically, imperfect human driving is better training data
                  than perfect waypoint following. A model trained on perfect data
                  is brittle.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Class Progress</h2>
          <ClassStats />
        </section>

        {/* Tech stack */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Tech Stack</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              'Next.js', 'React Three Fiber', 'Three.js', 'TypeScript',
              'Tailwind CSS', 'Zustand', 'PyTorch', 'ONNX', 'OpenVINO',
              'FastAPI', 'Railway', 'AWS DeepRacer',
            ].map((t) => (
              <span key={t} className="px-3 py-1.5 rounded-full bg-white/5 border border-gray-700 text-gray-300">
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-800 pt-8 pb-4 text-center text-xs text-gray-500 space-y-2">
          <p>Built by students at Laney College — CIS Department</p>
          <p>
            <a
              href="https://github.com/JekaJeka1627/laney-lab-autonomous-racer-hack"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              GitHub Repository
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

function ClassStats() {
  // Read accumulated stats from localStorage
  let totalLaps = 0;
  let totalFrames = 0;
  let totalRuns = 0;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('deepracer-training-runs');
      if (raw) {
        const runs = JSON.parse(raw) as Array<{ lapCount: number; frames: number }>;
        totalRuns = runs.length;
        for (const r of runs) {
          totalLaps += r.lapCount;
          totalFrames += r.frames;
        }
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white/5 border border-gray-700 rounded-2xl p-6 text-center">
        <div className="text-3xl font-bold text-blue-400">{totalRuns}</div>
        <div className="text-xs text-gray-400 mt-1">Training Runs</div>
      </div>
      <div className="bg-white/5 border border-gray-700 rounded-2xl p-6 text-center">
        <div className="text-3xl font-bold text-green-400">{totalLaps}</div>
        <div className="text-xs text-gray-400 mt-1">Total Laps</div>
      </div>
      <div className="bg-white/5 border border-gray-700 rounded-2xl p-6 text-center">
        <div className="text-3xl font-bold text-purple-400">{totalFrames.toLocaleString()}</div>
        <div className="text-xs text-gray-400 mt-1">Data Frames</div>
      </div>
    </div>
  );
}
