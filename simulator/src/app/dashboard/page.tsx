'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Database, Trophy, Timer, Gauge, TrendingUp,
  BarChart3, Activity, Map, Users, Download, Trash2,
} from 'lucide-react';
import { getRuns, getStats, exportRunsAsJSON, exportRunsAsCSV, type TrainingRun, type AccumulatedStats } from '@/lib/data/training-data';
import { LapTimeChart } from '@/components/dashboard/LapTimeChart';
import { SpeedDistribution } from '@/components/dashboard/SpeedDistribution';
import { SteeringHeatmap } from '@/components/dashboard/SteeringHeatmap';
import { TrackCoverage } from '@/components/dashboard/TrackCoverage';
import { RunsTable } from '@/components/dashboard/RunsTable';
import { FrameTimeline } from '@/components/dashboard/FrameTimeline';

type Tab = 'overview' | 'laps' | 'driving' | 'coverage' | 'runs' | 'timeline';

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'laps', label: 'Lap Times', icon: Timer },
  { id: 'driving', label: 'Driving Analysis', icon: Activity },
  { id: 'coverage', label: 'Track Coverage', icon: Map },
  { id: 'runs', label: 'All Runs', icon: Database },
  { id: 'timeline', label: 'Frame Data', icon: TrendingUp },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [stats, setStats] = useState<AccumulatedStats | null>(null);
  const [selectedRun, setSelectedRun] = useState<TrainingRun | null>(null);

  useEffect(() => {
    setRuns(getRuns());
    setStats(getStats());
  }, []);

  function handleExport(format: 'json' | 'csv') {
    const data = format === 'json' ? exportRunsAsJSON() : exportRunsAsCSV();
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepracer-training-data.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleClearData() {
    if (confirm('Clear all training data? This cannot be undone.')) {
      localStorage.removeItem('deepracer-training-runs');
      localStorage.removeItem('deepracer-stats');
      setRuns([]);
      setStats(null);
    }
  }

  const manualRuns = runs.filter((r) => r.driveMode === 'manual');
  const aiRuns = runs.filter((r) => r.driveMode === 'ai');

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      {/* Top nav */}
      <header className="border-b border-gray-800 bg-[#0f0f23]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Simulator
            </Link>
            <div className="w-px h-5 bg-gray-700" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Training Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('json')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={handleClearData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* What is this? */}
        <div className="bg-blue-900/20 border border-blue-800/30 rounded-2xl p-5 space-y-2">
          <h2 className="text-sm font-bold text-blue-300">What is this dashboard?</h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            Every time you drive in the simulator, the app records your <strong className="text-white">steering</strong>, <strong className="text-white">speed</strong>, <strong className="text-white">throttle</strong>, and <strong className="text-white">position</strong> ~10 times per second.
            This is called <strong className="text-white">training data</strong>. Later, a neural network will learn to drive by studying these recordings — just like how a self-driving car learns from human examples.
            The more laps the class drives, the better the AI will become.
          </p>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard icon={Database} label="Training Runs" value={stats.totalRuns} color="blue" hint="Each time you drive and stop = 1 run" />
            <StatCard icon={Trophy} label="Total Laps" value={stats.totalLaps} color="yellow" hint="Complete laps around the track" />
            <StatCard icon={Activity} label="Data Frames" value={stats.totalFrames.toLocaleString()} color="green" hint="Snapshots of your driving (~10/sec)" />
            <StatCard icon={Timer} label="Best Lap" value={stats.bestLapMs ? `${(stats.bestLapMs / 1000).toFixed(2)}s` : '—'} color="purple" hint="Fastest lap time recorded" />
            <StatCard icon={Users} label="Drive Time" value={formatDuration(stats.totalDriveTimeMs)} color="cyan" hint="Total time spent driving" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900/50 rounded-xl p-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="min-h-[500px]">
          {runs.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab runs={runs} manualRuns={manualRuns} aiRuns={aiRuns} stats={stats} />}
              {activeTab === 'laps' && <LapTimeChart runs={runs} />}
              {activeTab === 'driving' && <SpeedDistribution runs={runs} />}
              {activeTab === 'coverage' && <TrackCoverage runs={runs} />}
              {activeTab === 'runs' && <RunsTable runs={runs} onSelect={setSelectedRun} selectedRun={selectedRun} />}
              {activeTab === 'timeline' && <FrameTimeline runs={runs} selectedRun={selectedRun} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, hint }: { icon: typeof Database; label: string; value: string | number; color: string; hint?: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    yellow: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    green: 'text-green-400 bg-green-400/10 border-green-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    cyan: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-xs uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {hint && <div className="text-[10px] text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

function OverviewTab({ runs, manualRuns, aiRuns, stats }: { runs: TrainingRun[]; manualRuns: TrainingRun[]; aiRuns: TrainingRun[]; stats: AccumulatedStats | null }) {
  const trackBreakdown: Record<string, { runs: number; laps: number; frames: number }> = {};
  for (const r of runs) {
    const existing = trackBreakdown[r.trackId] || { runs: 0, laps: 0, frames: 0 };
    existing.runs++;
    existing.laps += r.lapCount;
    existing.frames += r.frames;
    trackBreakdown[r.trackId] = existing;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Data breakdown */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Data Breakdown</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
            <span className="text-sm text-gray-300">Manual Driving</span>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span><strong className="text-white">{manualRuns.length}</strong> runs</span>
              <span><strong className="text-white">{manualRuns.reduce((s, r) => s + r.lapCount, 0)}</strong> laps</span>
              <span><strong className="text-white">{manualRuns.reduce((s, r) => s + r.frames, 0).toLocaleString()}</strong> frames</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-purple-900/20 rounded-xl">
            <span className="text-sm text-gray-300">AI Driving</span>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span><strong className="text-white">{aiRuns.length}</strong> runs</span>
              <span><strong className="text-white">{aiRuns.reduce((s, r) => s + r.lapCount, 0)}</strong> laps</span>
              <span><strong className="text-white">{aiRuns.reduce((s, r) => s + r.frames, 0).toLocaleString()}</strong> frames</span>
            </div>
          </div>
        </div>
      </div>

      {/* Track breakdown */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">By Track</h3>
        <div className="space-y-3">
          {Object.entries(trackBreakdown).map(([trackId, data]) => {
            const totalFrames = stats?.totalFrames || 1;
            const pct = Math.round((data.frames / totalFrames) * 100);
            return (
              <div key={trackId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300 capitalize">{trackId.replace('-', ' ')}</span>
                  <span className="text-xs text-gray-500">{data.runs} runs · {data.laps} laps · {data.frames.toLocaleString()} frames</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent runs */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4 md:col-span-2">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Recent Runs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                <th className="text-left py-2 pr-4">Track</th>
                <th className="text-left py-2 pr-4">Mode</th>
                <th className="text-right py-2 pr-4">Laps</th>
                <th className="text-right py-2 pr-4">Frames</th>
                <th className="text-right py-2 pr-4">Best Lap</th>
                <th className="text-right py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(-10).reverse().map((r) => (
                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2.5 pr-4 capitalize text-gray-300">{r.trackId.replace('-', ' ')}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.driveMode === 'ai' ? 'bg-purple-900/40 text-purple-400' : 'bg-blue-900/40 text-blue-400'}`}>
                      {r.driveMode === 'ai' ? 'AI' : 'Manual'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-300">{r.lapCount}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-400">{r.frames.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-green-400">{r.bestLapMs ? `${(r.bestLapMs / 1000).toFixed(2)}s` : '—'}</td>
                  <td className="py-2.5 text-right text-gray-500 text-xs">{new Date(r.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <Database className="w-16 h-16 text-gray-700" />
      <h2 className="text-xl font-bold text-gray-400">No Training Data Yet</h2>
      <p className="text-sm text-gray-500 max-w-md">
        Drive some laps in the simulator to start generating training data.
        Every lap captures steering, throttle, speed, and position data.
      </p>
      <Link
        href="/"
        className="mt-4 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
      >
        Start Driving
      </Link>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!ms) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}
