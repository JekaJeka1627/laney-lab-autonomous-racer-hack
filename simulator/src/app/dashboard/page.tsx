'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Database, Trophy, Timer,
  BarChart3, Activity, Download, Trash2, Cloud, Bot, RefreshCcw, Play,
  ChevronDown, HelpCircle, Zap, X,
} from 'lucide-react';
import { getRuns, getStats, exportRunsAsJSON, exportRunsAsCSV, deleteRuns, type TrainingRun, type AccumulatedStats } from '@/lib/data/training-data';
import { downloadBlob, exportAllRunCapturesZip, exportRunCaptureZip } from '@/lib/capture/frame-store';
import {
  createTrainingJob,
  fetchActiveModelVersion,
  getRemoteRunsSummary,
  isApiConfigured,
  listRemoteRuns,
  listModels as fetchRemoteModels,
  listTrainingJobs as fetchRemoteTrainingJobs,
  setActiveModelVersion as setRemoteActiveModelVersion,
  type ModelRecordPayload,
  type RunRecordPayload,
  type TrainingJobRecordPayload,
} from '@/lib/api/api-client';
import { listRunSyncQueue, type RunSyncEntry } from '@/lib/api/run-sync-queue';
import { LapTimeChart } from '@/components/dashboard/LapTimeChart';
import { SpeedDistribution } from '@/components/dashboard/SpeedDistribution';
import { TrackCoverage } from '@/components/dashboard/TrackCoverage';
import { RunsTable } from '@/components/dashboard/RunsTable';
import { FrameTimeline } from '@/components/dashboard/FrameTimeline';

type Tab = 'driving' | 'data' | 'models' | 'inspector';

const tabs: { id: Tab; label: string; icon: typeof BarChart3; description: string }[] = [
  { id: 'driving', label: 'My Driving', icon: Activity, description: 'Your stats and progress' },
  { id: 'data', label: 'Training Data', icon: Database, description: 'Runs the AI learns from' },
  { id: 'models', label: 'AI Models', icon: Bot, description: 'Training pipeline and results' },
  { id: 'inspector', label: 'Inspector', icon: Zap, description: 'Advanced frame-level data' },
];

// Main dashboard page — manages all state and renders the tab layout with stats banner.
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('driving');
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [stats, setStats] = useState<AccumulatedStats | null>(null);
  const [selectedRun, setSelectedRun] = useState<TrainingRun | null>(null);
  const [exportingCaptureZip, setExportingCaptureZip] = useState(false);
  const [remoteModels, setRemoteModels] = useState<ModelRecordPayload[]>([]);
  const [remoteJobs, setRemoteJobs] = useState<TrainingJobRecordPayload[]>([]);
  const [remoteRuns, setRemoteRuns] = useState<RunRecordPayload[]>([]);
  const [remoteSummary, setRemoteSummary] = useState<{ completed_runs: number; completed_laps: number; completed_frames: number; best_lap_ms?: number | null } | null>(null);
  const [activeRemoteModel, setActiveRemoteModel] = useState<string | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(() => {
    // Lazy initializer: SSR guard needed because localStorage is browser-only.
    // Default to showing help unless the user has previously dismissed it.
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('dashboard-help-dismissed') !== 'true';
  });
  const [localSyncEntries, setLocalSyncEntries] = useState<RunSyncEntry[]>([]);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    //get runs and stats on componet load
    setRuns(getRuns());
    setStats(getStats());
  }, []);

  // Closes the export dropdown when the user clicks outside of it.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);


  // Fetches all cloud state in parallel (summary, models, jobs, active model, recent runs)
  // and updates the corresponding state variables. Shows a loading indicator while in flight.
  async function refreshCloudData() {
    if (!isApiConfigured()) return;
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const [summary, models, jobs, active, recentRuns] = await Promise.all([
        getRemoteRunsSummary(),
        fetchRemoteModels(20),
        fetchRemoteTrainingJobs(20),
        fetchActiveModelVersion(),
        listRemoteRuns(12),
      ]); // All requests run in parallel to minimise total loading time.
      setRemoteSummary(summary);
      setRemoteModels(models);
      setRemoteJobs(jobs);
      setActiveRemoteModel(active);
      setRemoteRuns(recentRuns);
    } catch (error) {
      console.error(error);
      setRemoteError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemoteLoading(false);
    }
  }

  // Triggers the initial cloud data fetch when the API is configured.
  useEffect(() => {
    if (!isApiConfigured()) return;
    void refreshCloudData();
  }, []);

  // Polls the local run-sync queue every 2 seconds and also listens for cross-tab storage
  // events so the sync status badge stays up to date without a manual refresh.
  useEffect(() => {
    const refreshLocalSync = () => setLocalSyncEntries(listRunSyncQueue());
    refreshLocalSync();
    const timer = window.setInterval(refreshLocalSync, 2000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'deepracer-run-sync-queue') refreshLocalSync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Serializes all training runs to the requested format (JSON or CSV) and triggers a browser download.
  function handleExport(format: 'json' | 'csv') {
    const data = format === 'json' ? exportRunsAsJSON() : exportRunsAsCSV();
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    // Programmatically click a temporary <a> tag to trigger the browser's file download dialog.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepracer-training-data.${format}`;
    a.click();
    URL.revokeObjectURL(url); // Free the object URL immediately after the download starts.
    setShowExportMenu(false);
  }
  // Deletes the specified runs by ID, refreshes the runs/stats state, and clears the
  // selected run if it was among those deleted.
  function handleDeleteRuns(ids: string[]) {
    deleteRuns(ids);
    setRuns(getRuns());
    setStats(getStats());
    if (selectedRun && ids.includes(selectedRun.id)) {
      setSelectedRun(null);
    }
  }

  // Packages the frame-capture images for a single run into a ZIP file and downloads it.
  // No-ops if the run has no frame capture data.
  async function handleDownloadRunCapture(run: TrainingRun) {
    if (!run.hasFrameCapture) return;
    try {
      const zip = await exportRunCaptureZip(run.id);
      downloadBlob(zip, `deepracer-run-${run.id}.zip`);
    } catch (error) {
      console.error(error);
      alert('Unable to export image capture for this run.');
    }
  }

  // Bundles frame captures from every run that has them into a single ZIP and downloads it.
  // Shows a loading state while the ZIP is being built.
  async function handleExportAllCaptureZips() {
    const captureRunIds = runs.filter((r) => r.hasFrameCapture).map((r) => r.id);
    if (captureRunIds.length === 0) {
      alert('No image captures are available to export yet.');
      return;
    }

    setExportingCaptureZip(true);
    try {
      const zip = await exportAllRunCapturesZip(captureRunIds);
      downloadBlob(zip, `deepracer-captured-runs-${new Date().toISOString().slice(0, 10)}.zip`); // slice(0,10) gives YYYY-MM-DD
    } catch (error) {
      console.error(error);
      alert('Failed to build bulk capture export zip.');
    } finally {
      setExportingCaptureZip(false);
    }
  }

  // Prompts the user for confirmation, then wipes all training runs and stats from localStorage.
  function handleClearData() {
    if (confirm('Clear all training data? This cannot be undone.')) {
      localStorage.removeItem('deepracer-training-runs');
      localStorage.removeItem('deepracer-stats');
      setRuns([]);
      setStats(null);
    }
  }

  // Hides the help banner and persists the dismissal to localStorage so it stays hidden on reload.
  function dismissHelp() {
    setShowHelp(false);
    localStorage.setItem('dashboard-help-dismissed', 'true');
  }

  const manualRuns = runs.filter((r) => r.driveMode === 'manual');
  const aiRuns = runs.filter((r) => r.driveMode === 'ai');
  // Prefer cloud-aggregated stats (team-wide) over local stats when available.
  const totalRuns = remoteSummary?.completed_runs ?? runs.length;
  const totalLaps = remoteSummary?.completed_laps ?? stats?.totalLaps ?? 0;
  const totalFrames = remoteSummary?.completed_frames ?? stats?.totalFrames ?? 0;
  const bestLapMs = remoteSummary?.best_lap_ms ?? stats?.bestLapMs ?? null;

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      {/* Top nav — simplified */}
      <header className="border-b border-gray-800 bg-[#0f0f23]/80 backdrop-blur-sm sticky top-0 z-20">
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
            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className="w-3 h-3" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-30">
                  <button
                    onClick={() => { void handleExportAllCaptureZips(); setShowExportMenu(false); }}
                    disabled={exportingCaptureZip}
                    className="w-full text-left px-4 py-2.5 text-xs text-cyan-300 hover:bg-gray-800 transition-colors disabled:opacity-50 border-b border-gray-800"
                  >
                    {exportingCaptureZip ? 'Building .zip...' : 'All Runs (.zip with images)'}
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-800"
                  >
                    Training Data (.json)
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    Training Data (.csv)
                  </button>
                </div>
              )}
            </div>
            {/* Help toggle */}
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              title="What is this dashboard?"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Collapsible explainer */}
        {showHelp && (
          <div className="bg-blue-900/15 border border-blue-800/25 rounded-2xl p-4 relative">
            <button
              onClick={dismissHelp}
              className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-bold text-blue-300 mb-1">What is this dashboard?</h2>
            <p className="text-xs text-gray-400 leading-relaxed pr-6">
              Every time you drive in the simulator, the app records your <strong className="text-white">steering</strong>, <strong className="text-white">speed</strong>, <strong className="text-white">throttle</strong>, and <strong className="text-white">position</strong> ~10 times per second.
              This is <strong className="text-white">training data</strong> that a neural network uses to learn to drive. The more laps the class drives, the better the AI becomes.
            </p>
          </div>
        )}

        {/* Progress banner */}
        <div className="bg-gradient-to-r from-gray-900/80 to-gray-900/40 border border-gray-800 rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Collected</div>
                <div className="text-lg font-bold text-white">{totalRuns} <span className="text-sm font-normal text-gray-500">runs</span></div>
              </div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Laps</div>
                <div className="text-lg font-bold text-white">{totalLaps}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
                <Timer className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Best Lap</div>
                <div className="text-lg font-bold text-white">
                  {bestLapMs ? `${(bestLapMs / 1000).toFixed(2)}s` : '--'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Frames</div>
                <div className="text-lg font-bold text-white">{totalFrames.toLocaleString()}</div>
              </div>
            </div>
            {activeRemoteModel && (
              <div className="flex items-center gap-3 min-w-0 ml-auto">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Active Model</div>
                  <div className="text-sm font-mono font-bold text-cyan-300">{activeRemoteModel}</div>
                </div>
              </div>
            )}
          </div>
          {/* Progress bar toward next milestone */}
          {totalRuns > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-800/50">
              <ProgressMilestone totalRuns={totalRuns} />
            </div>
          )}
        </div>

        {/* Tabs — 4 consolidated */}
        <div className="flex gap-1 bg-gray-900/50 rounded-xl p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="min-h-[500px]">
          {runs.length === 0 && activeTab !== 'models' ? (
            <EmptyState />
          ) : (
            <>
              {activeTab === 'driving' && (
                <MyDrivingTab runs={runs} manualRuns={manualRuns} aiRuns={aiRuns} stats={stats} />
              )}
              {activeTab === 'data' && (
                <TrainingDataTab
                  runs={runs}
                  selectedRun={selectedRun}
                  onSelect={setSelectedRun}
                  onDeleteRuns={handleDeleteRuns}
                  onDownloadRun={handleDownloadRunCapture}
                />
              )}
              {activeTab === 'models' && (
                <CloudTab
                  apiConfigured={isApiConfigured()}
                  models={remoteModels}
                  jobs={remoteJobs}
                  runs={remoteRuns}
                  activeModelVersion={activeRemoteModel}
                  localSyncEntries={localSyncEntries}
                  loading={remoteLoading}
                  error={remoteError}
                  creatingJob={creatingJob}
                  onRefresh={refreshCloudData}
                  onSetActive={async (version) => {
                    await setRemoteActiveModelVersion(version);
                    await refreshCloudData();
                  }}
                  onStartTraining={async () => {
                    setCreatingJob(true);
                    try {
                      await createTrainingJob({
                        dataset: { manual_only: true },
                        hyperparams: { epochs: 3, batch_size: 32, learning_rate: 0.0003 },
                        export: { set_active: true },
                      });
                      await refreshCloudData();
                    } finally {
                      setCreatingJob(false);
                    }
                  }}
                />
              )}
              {activeTab === 'inspector' && <FrameTimeline runs={runs} selectedRun={selectedRun} />}
            </>
          )}
        </div>

        {/* Danger zone — clear data moved to bottom */}
        {runs.length > 0 && (
          <div className="border-t border-gray-800/50 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Danger Zone</h3>
                <p className="text-xs text-gray-600 mt-0.5">Permanently delete all local training data</p>
              </div>
              <button
                onClick={handleClearData}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400/80 hover:text-red-400 border border-red-900/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All Data
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── My Driving Tab ─── */
// Displays a breakdown of manual vs AI runs, per-track frame distribution,
// lap time progression chart, and speed distribution analysis.
function MyDrivingTab({ runs, manualRuns, aiRuns, stats }: { runs: TrainingRun[]; manualRuns: TrainingRun[]; aiRuns: TrainingRun[]; stats: AccumulatedStats | null }) {
  // Aggregate runs by track so each track shows a combined run/lap/frame count.
  const trackBreakdown: Record<string, { runs: number; laps: number; frames: number }> = {};
  for (const r of runs) {
    const existing = trackBreakdown[r.trackId] || { runs: 0, laps: 0, frames: 0 };
    existing.runs++;
    existing.laps += r.lapCount;
    existing.frames += r.frames;
    trackBreakdown[r.trackId] = existing;
  }

  return (
    <div className="space-y-6">
      {/* Data split + track breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Data Split</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-blue-900/15 border border-blue-900/20 rounded-xl">
              <span className="text-sm text-gray-300">Manual</span>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span><strong className="text-white">{manualRuns.length}</strong> runs</span>
                <span><strong className="text-white">{manualRuns.reduce((s, r) => s + r.lapCount, 0)}</strong> laps</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-900/15 border border-purple-900/20 rounded-xl">
              <span className="text-sm text-gray-300">AI</span>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span><strong className="text-white">{aiRuns.length}</strong> runs</span>
                <span><strong className="text-white">{aiRuns.reduce((s, r) => s + r.lapCount, 0)}</strong> laps</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">By Track</h3>
          <div className="space-y-2">
            {Object.entries(trackBreakdown).map(([trackId, data]) => {
              const totalFrames = stats?.totalFrames || 1; // Fallback to 1 to avoid division by zero.
              const pct = Math.round((data.frames / totalFrames) * 100); // % of all frames from this track
              return (
                <div key={trackId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 capitalize">{trackId.replace('-', ' ')}</span>
                    <span className="text-xs text-gray-500">{data.runs} runs, {data.laps} laps</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(trackBreakdown).length === 0 && (
              <div className="text-xs text-gray-600 py-4 text-center">No track data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Lap time progression */}
      <LapTimeChart runs={runs} />

      {/* Driving analysis */}
      <SpeedDistribution runs={runs} />
    </div>
  );
}

/* ─── Training Data Tab ─── */
// Shows track coverage heatmap and a full sortable/selectable table of recorded runs.
// Supports per-run deletion and frame-capture ZIP download.
function TrainingDataTab({
  runs,
  selectedRun,
  onSelect,
  onDeleteRuns,
  onDownloadRun,
}: {
  runs: TrainingRun[];
  selectedRun: TrainingRun | null;
  onSelect: (run: TrainingRun) => void;
  onDeleteRuns: (ids: string[]) => void;
  onDownloadRun: (run: TrainingRun) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Track coverage */}
      <TrackCoverage runs={runs} />

      {/* Full runs table */}
      <RunsTable
        runs={runs}
        onSelect={onSelect}
        selectedRun={selectedRun}
        onDeleteRuns={onDeleteRuns}
        onDownloadRun={onDownloadRun}
      />
    </div>
  );
}

/* ─── Cloud / AI Models Tab ─── */
// Renders the cloud-connected AI models and training jobs panel. Shows a prompt to
// configure the API when not connected. Allows starting new training jobs, setting the
// active model version, and monitoring the local run-sync queue status.
function CloudTab({
  apiConfigured,
  models,
  jobs,
  runs,
  activeModelVersion,
  localSyncEntries,
  loading,
  error,
  creatingJob,
  onRefresh,
  onSetActive,
  onStartTraining,
}: {
  apiConfigured: boolean;
  models: ModelRecordPayload[];
  jobs: TrainingJobRecordPayload[];
  runs: RunRecordPayload[];
  activeModelVersion: string | null;
  localSyncEntries: RunSyncEntry[];
  loading: boolean;
  error: string | null;
  creatingJob: boolean;
  onRefresh: () => void | Promise<void>;
  onSetActive: (version: string) => Promise<void>;
  onStartTraining: () => Promise<void>;
}) {
  const [busyActiveVersion, setBusyActiveVersion] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const syncCounts = {
    total: localSyncEntries.length,
    synced: localSyncEntries.filter((e) => e.status === 'synced').length,
    pending: localSyncEntries.filter((e) => e.status === 'pending' || e.status === 'syncing').length,
    error: localSyncEntries.filter((e) => e.status === 'error').length,
  };

  if (!apiConfigured) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <Cloud className="w-12 h-12 text-gray-700" />
        <h2 className="text-lg font-bold text-gray-400">API Not Connected</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Set <code className="text-white bg-gray-800 px-1.5 py-0.5 rounded text-xs">NEXT_PUBLIC_API_URL</code> in your environment to enable shared models and training jobs.
        </p>
      </div>
    );
  }

  // Only block the whole tab with a spinner on the very first load; subsequent refreshes
  // update data in the background while the existing list remains visible.
  if (loading && models.length === 0 && jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <RefreshCcw className="w-8 h-8 text-gray-600 animate-spin" />
        <p className="text-sm text-gray-500">Loading models and training jobs...</p>
      </div>
    );
  }

  // Jobs that are still in progress — used to show the "N in progress" badge.
  const queuedJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">AI Models and Training</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Start a training job, then monitor status below. Models are shared across the team.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void onStartTraining().catch((e) => setActionError(e instanceof Error ? e.message : String(e))); }}
            disabled={creatingJob}
            className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium disabled:opacity-50 transition-all shadow-lg shadow-purple-900/20"
          >
            <Play className="w-3.5 h-3.5" />
            {creatingJob ? 'Queueing...' : 'Start Training Job'}
          </button>
          <button
            onClick={() => { void onRefresh(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {(error || actionError) && (
          <div className="w-full text-xs text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
            {error || actionError}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Models list */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-semibold text-gray-200">Models</h4>
          </div>
          <div className="text-xs text-gray-500">
            Active: <span className="font-mono text-green-300">{activeModelVersion ?? 'none'}</span>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {models.length === 0 ? (
              <div className="text-center py-8">
                <Bot className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No models yet. Start a training job to create one.</p>
              </div>
            ) : models.map((m) => {
              // metrics arrives as untyped JSON from the API, so values are narrowed before use.
              const metrics = (m.training?.metrics as Record<string, unknown> | undefined) ?? {};
              const trainLoss = typeof metrics.train_loss === 'number' ? metrics.train_loss : null;
              const valLoss = typeof metrics.val_loss === 'number' ? metrics.val_loss : null;
              const hasOnnx = !!m.artifacts?.onnx_uri; // ONNX export is required to run the model in-sim.
              const isActive = activeModelVersion === m.model_version;
              return (
                <div key={m.model_id} className={`rounded-xl border p-3 ${isActive ? 'border-green-700/50 bg-green-950/10' : 'border-gray-800 bg-gray-950/20'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm text-gray-100">{m.model_version}</div>
                      <div className="text-[11px] text-gray-500">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${hasOnnx ? 'bg-cyan-900/30 text-cyan-300' : 'bg-yellow-900/30 text-yellow-300'}`}>
                      {hasOnnx ? 'ONNX' : 'No ONNX'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-400 grid grid-cols-2 gap-2">
                    <div>Train: <span className="text-gray-200">{trainLoss?.toFixed(4) ?? '--'}</span></div>
                    <div>Val: <span className="text-gray-200">{valLoss?.toFixed(4) ?? '--'}</span></div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setBusyActiveVersion(m.model_version);
                        setActionError(null);
                        void onSetActive(m.model_version)
                          .catch((e) => setActionError(e instanceof Error ? e.message : String(e)))
                          .finally(() => setBusyActiveVersion(null));
                      }}
                      // Disable all "Set Active" buttons while any one of them is in flight.
                      disabled={isActive || busyActiveVersion !== null}
                      className={`px-2.5 py-1 text-[11px] rounded-md transition-colors disabled:opacity-50 ${
                        isActive
                          ? 'bg-green-900/30 text-green-300 border border-green-800/30'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                      }`}
                    >
                      {isActive ? 'Active' : busyActiveVersion === m.model_version ? 'Setting...' : 'Set Active'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Training jobs */}
        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-200">Training Jobs</h4>
            <div className="text-xs text-gray-500">
              {queuedJobs.length > 0 ? (
                <span className="text-yellow-300">{queuedJobs.length} in progress</span>
              ) : 'Idle'}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="text-center py-8">
                <Play className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No training jobs yet. Click &quot;Start Training Job&quot; to begin.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                    <th className="text-left py-2 pr-3">Job</th>
                    <th className="text-left py-2 pr-3">Status</th>
                    <th className="text-left py-2 pr-3">Stage</th>
                    <th className="text-left py-2 pr-3">Output</th>
                    <th className="text-right py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const progress = j.progress ?? {};
                    const outputs = j.outputs ?? {};
                    const stage = typeof progress.stage === 'string' ? progress.stage : '--';
                    const modelVersion = typeof outputs.model_version === 'string' ? outputs.model_version : '--';
                    const statusClass =
                      j.status === 'succeeded' ? 'text-green-300 bg-green-900/20' :
                      j.status === 'failed' ? 'text-red-300 bg-red-900/20' :
                      j.status === 'running' ? 'text-yellow-300 bg-yellow-900/20' :
                      'text-gray-300 bg-gray-800';
                    return (
                      <tr key={j.job_id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                        <td className="py-2.5 pr-3 font-mono text-xs text-gray-300">{j.job_id.slice(0, 8)}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${statusClass}`}>{j.status}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-400">{stage}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-cyan-300">{modelVersion}</td>
                        <td className="py-2.5 text-right text-xs text-gray-500">{new Date(j.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-semibold text-gray-200">Sync Verification</h4>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-gray-800 bg-gray-950/20 p-3">
              <div className="text-gray-500">Local Queue</div>
              <div className="mt-1 text-lg font-bold text-white">{syncCounts.total}</div>
            </div>
            <div className="rounded-xl border border-green-900/30 bg-green-950/10 p-3">
              <div className="text-green-300/80">Synced</div>
              <div className="mt-1 text-lg font-bold text-green-300">{syncCounts.synced}</div>
            </div>
            <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-3">
              <div className="text-yellow-300/80">Pending</div>
              <div className="mt-1 text-lg font-bold text-yellow-300">{syncCounts.pending}</div>
            </div>
            <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-3">
              <div className="text-red-300/80">Errors</div>
              <div className="mt-1 text-lg font-bold text-red-300">{syncCounts.error}</div>
            </div>
          </div>
          <p className="text-[11px] text-gray-500">
            Counts above are for this browser&apos;s background sync queue. Check the cloud runs table for team-wide uploads.
          </p>
        </div>

        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-200">Recent Synced Runs (Cloud)</h4>
            <div className="text-xs text-gray-500">{runs.length} shown</div>
          </div>
          <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
            {runs.length === 0 ? (
              <div className="text-center py-8">
                <Cloud className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No shared runs found yet. Drive laps, then refresh after sync completes.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                    <th className="text-left py-2 pr-3">Created</th>
                    <th className="text-left py-2 pr-3">User</th>
                    <th className="text-left py-2 pr-3">Track</th>
                    <th className="text-left py-2 pr-3">Mode</th>
                    <th className="text-right py-2 pr-3">Laps</th>
                    <th className="text-right py-2">Frames</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.run_id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                      <td className="py-2.5 pr-3 text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-300">{r.user_id}</td>
                      <td className="py-2.5 pr-3 text-gray-300 capitalize">{r.track_id.replace('-', ' ')}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.mode === 'manual' ? 'bg-blue-900/20 text-blue-300' : 'bg-purple-900/20 text-purple-300'}`}>
                          {r.mode}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-gray-200">{r.lap_count}</td>
                      <td className="py-2.5 text-right text-gray-200">{r.frame_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Progress Milestone ─── */
// Renders a progress bar toward the next dataset-size milestone (10 / 50 / 200 / 1000 runs).
// Finds the first incomplete milestone and shows current progress as a percentage.
function ProgressMilestone({ totalRuns }: { totalRuns: number }) {
  // Define milestones
  const milestones = [
    { label: 'First training', target: 10, unit: 'runs', current: totalRuns },
    { label: 'Solid dataset', target: 50, unit: 'runs', current: totalRuns },
    { label: 'Large dataset', target: 200, unit: 'runs', current: totalRuns },
    { label: 'Massive dataset', target: 1000, unit: 'runs', current: totalRuns },
  ];

  // Find the next incomplete milestone; fall back to the last one if all are complete.
  const next = milestones.find((m) => m.current < m.target) ?? milestones[milestones.length - 1];
  const pct = Math.min(100, Math.round((next.current / next.target) * 100));

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-400">
            Next milestone: <strong className="text-gray-200">{next.label}</strong>
          </span>
          <span className="text-gray-500">{next.current} / {next.target} {next.unit}</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {pct >= 100 && (
        <span className="text-xs text-green-400 font-medium whitespace-nowrap">Complete</span>
      )}
    </div>
  );
}

/* ─── Empty State ─── */
// Placeholder shown on the driving/data/inspector tabs when no training runs exist yet.
// Prompts the user to go drive laps in the simulator.
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
        <Database className="w-8 h-8 text-blue-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-300">No Training Data Yet</h2>
      <p className="text-sm text-gray-500 max-w-md">
        Drive laps in the simulator to start generating training data.
        Every lap captures steering, throttle, speed, and position data that the AI will learn from.
      </p>
      <Link
        href="/"
        className="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all shadow-lg shadow-blue-900/20"
      >
        Start Driving
      </Link>
    </div>
  );
}
