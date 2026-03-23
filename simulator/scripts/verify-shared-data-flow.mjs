#!/usr/bin/env node

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function getJson(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function uploadControls(runId, rows) {
  const csv = [
    'frame_idx,timestamp_ms,steering,throttle,speed,x,z',
    ...rows.map((r) => r.join(',')),
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'controls.csv');
  const res = await fetch(`${base}/api/runs/${runId}/controls`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw new Error(`controls upload failed (${res.status})`);
  }
}

async function submitRun(userId, lapCount) {
  const create = await postJson('/api/runs', {
    user_id: userId,
    track_id: 'oval',
    mode: 'manual',
    client_build: 'verify-script',
    sim_build: 'verify-script',
  });
  const runId = create.run_id;
  await uploadControls(runId, [
    [0, 0, 0.0, 0.4, 1.2, 0.0, 0.0],
    [1, 100, 0.1, 0.5, 1.5, 0.2, 0.1],
    [2, 200, -0.1, 0.5, 1.4, 0.4, 0.2],
  ]);
  await postJson(`/api/runs/${runId}/finalize`, {
    duration_s: 12.5,
    frame_count: 3,
    lap_count: lapCount,
    off_track_count: 0,
    best_lap_ms: 5900,
  });
  return runId;
}

async function main() {
  const before = await getJson('/api/runs/summary');

  const runA = await submitRun(`verify-a-${Date.now()}`, 1);
  const runB = await submitRun(`verify-b-${Date.now()}`, 2);

  const after = await getJson('/api/runs/summary');
  assert(after.completed_runs >= before.completed_runs + 2, 'Global completed_runs did not increase by at least 2');
  assert(after.completed_laps >= before.completed_laps + 3, 'Global completed_laps did not increase by at least 3');

  const job = await postJson('/api/train/jobs', {
    dataset: { manual_only: true },
    hyperparams: { epochs: 1 },
    export: { set_active: false },
  });
  const jobRecord = await getJson(`/api/train/jobs/${job.job_id}`);
  const selected = Array.isArray(jobRecord.outputs?.selected_run_ids) ? jobRecord.outputs.selected_run_ids : [];
  assert(selected.includes(runA), 'Training job dataset snapshot missing first run_id');
  assert(selected.includes(runB), 'Training job dataset snapshot missing second run_id');

  console.log(JSON.stringify({
    base_url: base,
    run_ids: [runA, runB],
    stats_before: before,
    stats_after: after,
    training_job_id: job.job_id,
    selected_run_count: selected.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
