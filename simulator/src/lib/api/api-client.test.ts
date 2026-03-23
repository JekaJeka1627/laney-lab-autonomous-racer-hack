import { getRemoteRunsSummary } from '@/lib/api/api-client';
import { getApiBaseUrl, isApiConfigured } from '@/lib/api/api-client';

describe('getRemoteRunsSummary', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://shared.example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('requires NEXT_PUBLIC_API_URL for shared API mode', () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(getApiBaseUrl()).toBeNull();
    expect(isApiConfigured()).toBe(false);
  });

  it('uses the canonical /api/runs/summary endpoint', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://shared.example.com/api/runs/summary');
      return new Response(
        JSON.stringify({ completed_runs: 3, completed_laps: 6, completed_frames: 900 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    global.fetch = fetchMock as typeof fetch;

    const payload = await getRemoteRunsSummary();

    expect(payload).toEqual({ completed_runs: 3, completed_laps: 6, completed_frames: 900 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to /api/stats when /api/runs/summary is unavailable', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith('/api/runs/summary')) {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }
      expect(value).toBe('https://shared.example.com/api/stats');
      return new Response(
        JSON.stringify({ completed_runs: 4, completed_laps: 8, completed_frames: 1200 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    global.fetch = fetchMock as typeof fetch;

    const payload = await getRemoteRunsSummary();

    expect(payload).toEqual({ completed_runs: 4, completed_laps: 8, completed_frames: 1200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
