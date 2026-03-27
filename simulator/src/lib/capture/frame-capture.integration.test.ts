import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import {
  __setPendingCapturedFramesForTest,
  finalizeCapturedFramesToIndexedDb,
  getPendingCaptureFrameCount,
  resetPendingCapturedFrames,
  type CapturedFrame,
} from '@/lib/capture/frame-capture';
import { exportRunCaptureZipBytes, getRunCaptureMeta, getRunFrames } from '@/lib/capture/frame-store';

function makeMockFrame(i: number): CapturedFrame {
  return {
    timestamp_ms: i * 100,
    steering: i === 0 ? 0.1 : -0.25,
    throttle: 0.5,
    speed: 2 + i,
    jpeg: new Blob([`jpeg-${i}`], { type: 'image/jpeg' }),
  };
}

describe('frame capture finalize/export flow', () => {
  beforeEach(() => {
    resetPendingCapturedFrames();
  });

  it('persists mocked captured frames to IndexedDB and exports a training zip', async () => {
    const runId = 'test-run-001';
    const frames = [makeMockFrame(0), makeMockFrame(1)];

    __setPendingCapturedFramesForTest(frames);
    expect(getPendingCaptureFrameCount()).toBe(2);

    const savedCount = await finalizeCapturedFramesToIndexedDb({
      runId,
      trackId: 'oval',
      driveMode: 'manual',
      durationMs: 2500,
      lapCount: 1,
      bestLapMs: 2400,
      offTrackCount: 0,
    });

    expect(savedCount).toBe(2);
    expect(getPendingCaptureFrameCount()).toBe(0);

    const meta = await getRunCaptureMeta(runId);
    const storedFrames = await getRunFrames(runId);
    expect(meta?.runId).toBe(runId);
    expect(meta?.frameCount).toBe(2);
    expect(storedFrames).toHaveLength(2);
    expect(storedFrames[0].frameIdx).toBe(0);
    expect(storedFrames[1].frameIdx).toBe(1);

    const zipBytes = await exportRunCaptureZipBytes(runId);
    const zip = await JSZip.loadAsync(zipBytes);

    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(['frames/000000.jpg', 'frames/000001.jpg', 'controls.csv', 'run.json']),
    );

    const controlsCsv = await zip.file('controls.csv')!.async('string');
    expect(controlsCsv).toContain('frame_idx,timestamp_ms,steering,throttle,speed');
    expect(controlsCsv).toContain('0,0,0.1,0.5,2');
    expect(controlsCsv).toContain('1,100,-0.25,0.5,3');

    const runJson = JSON.parse(await zip.file('run.json')!.async('string')) as { trackId: string; frameCount: number };
    expect(runJson.trackId).toBe('oval');
    expect(runJson.frameCount).toBe(2);
  });
});
