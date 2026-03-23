'use client';

export interface CreateRunRequestPayload {
  user_id: string;
  track_id: string;
  mode: 'manual' | 'autonomous';
  model_version?: string | null;
  sim_build?: string;
  client_build?: string;
  notes?: string | null;
  local_run_id?: string;
  started_at?: string;
}

export interface CreateRunResponsePayload {
  run_id: string;
  upload_urls: {
    frames: string;
    controls: string;
  };
}

export interface FinalizeRunRequestPayload {
  ended_at?: string;
  duration_s?: number;
  frame_count?: number;
  lap_count?: number;
  off_track_count?: number;
  best_lap_ms?: number | null;
}

export interface RunRecordPayload {
  run_id: string;
  user_id: string;
  track_id: string;
  mode: 'manual' | 'autonomous';
  model_version: string | null;
  sim_build: string;
  client_build: string;
  notes: string | null;
  local_run_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  frame_count: number;
  lap_count: number;
  off_track_count: number;
  best_lap_ms: number | null;
  artifacts: {
    frames_uri: string | null;
    controls_uri: string | null;
    run_json_uri: string | null;
  };
  created_at: string;
}

export interface ListRunsResponsePayload {
  items: RunRecordPayload[];
  next_cursor: string | null;
}

export interface RunsSummaryPayload {
  completed_runs: number;
  completed_laps: number;
  completed_frames: number;
  total_duration_s?: number;
  best_lap_ms?: number | null;
}

export interface ModelRecordPayload {
  model_id: string;
  model_version: string;
  status: string;
  created_at: string;
  architecture: Record<string, unknown>;
  training: Record<string, unknown>;
  artifacts: {
    pytorch_uri: string | null;
    onnx_uri: string | null;
    openvino_uri: string | null;
  };
}

export interface ListModelsResponsePayload {
  items: ModelRecordPayload[];
  next_cursor: string | null;
}

export interface TrainingJobRecordPayload {
  job_id: string;
  status: string;
  created_at: string;
  config: Record<string, unknown>;
  progress: Record<string, unknown>;
  outputs: Record<string, unknown>;
  logs_uri: string | null;
}

export interface ListTrainingJobsResponsePayload {
  items: TrainingJobRecordPayload[];
  next_cursor: string | null;
}

export function getApiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw) return raw.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return null;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API request failed (${res.status}) ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl() !== null;
}

export interface ActiveModelPayload {
  active_model_version: string | null;
}

export async function fetchActiveModelVersion(): Promise<string | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  const payload = await requestJson<ActiveModelPayload>(`${base}/api/models/active`);
  return payload.active_model_version ?? null;
}

export function getModelOnnxDownloadUrl(modelVersion: string): string {
  const base = getApiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  return `${base}/api/models/${encodeURIComponent(modelVersion)}/artifacts/onnx`;
}

export async function listModels(limit = 20): Promise<ModelRecordPayload[]> {
  const base = getApiBaseUrl();
  if (!base) return [];
  const payload = await requestJson<ListModelsResponsePayload>(`${base}/api/models?limit=${limit}`);
  return payload.items;
}

export async function listTrainingJobs(limit = 20): Promise<TrainingJobRecordPayload[]> {
  const base = getApiBaseUrl();
  if (!base) return [];
  const payload = await requestJson<ListTrainingJobsResponsePayload>(`${base}/api/train/jobs?limit=${limit}`);
  return payload.items;
}

export async function listRemoteRuns(limit = 20): Promise<RunRecordPayload[]> {
  const base = getApiBaseUrl();
  if (!base) return [];
  const payload = await requestJson<ListRunsResponsePayload>(`${base}/api/runs?limit=${limit}`);
  return payload.items;
}

export async function getRemoteRunsSummary(): Promise<RunsSummaryPayload | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  try {
    return await requestJson<RunsSummaryPayload>(`${base}/api/runs/summary`);
  } catch (error) {
    // Older deployments used /api/stats for pooled run totals.
    if (error instanceof Error && error.message.includes('(404)')) {
      return requestJson<RunsSummaryPayload>(`${base}/api/stats`);
    }
    throw error;
  }
}

export async function setActiveModelVersion(modelVersion: string): Promise<void> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  await requestJson<ActiveModelPayload>(`${base}/api/models/active`, {
    method: 'POST',
    body: JSON.stringify({ model_version: modelVersion }),
  });
}

export async function createTrainingJob(payload: {
  dataset?: Record<string, unknown>;
  hyperparams?: Record<string, unknown>;
  export?: Record<string, unknown>;
}): Promise<{ job_id: string; status: string }> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  return requestJson<{ job_id: string; status: string }>(`${base}/api/train/jobs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createRemoteRun(payload: CreateRunRequestPayload): Promise<CreateRunResponsePayload> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  return requestJson<CreateRunResponsePayload>(`${base}/api/runs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadRunArtifact(url: string, file: Blob, filename: string): Promise<void> {
  const form = new FormData();
  form.append('file', file, filename);
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`Artifact upload failed (${res.status}) ${res.statusText}`);
  }
}

export async function finalizeRemoteRun(runId: string, payload: FinalizeRunRequestPayload): Promise<void> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const res = await fetch(`${base}/api/runs/${runId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Finalize failed (${res.status}) ${res.statusText}`);
  }
}
