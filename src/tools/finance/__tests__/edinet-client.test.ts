import { describe, test, expect } from 'vitest';
import { EdinetClient } from '../edinet-client.js';

// ── Constructor ─────────────────────────────────────────────────────

describe('EdinetClient constructor', () => {
  test('constructs with valid API key', () => {
    const client = new EdinetClient('test-api-key');
    expect(client).toBeInstanceOf(EdinetClient);
  });

  test('throws when API key is empty', () => {
    expect(() => new EdinetClient('')).toThrow('EDINET DB API key is required');
  });
});

// ── buildUrl ────────────────────────────────────────────────────────

describe('EdinetClient.buildUrl', () => {
  const client = new EdinetClient('test-api-key');

  test('builds URL with no params', () => {
    const url = client.buildUrl('search');
    expect(url).toBe('https://edinetdb.jp/v1/search');
  });

  test('builds URL with query params', () => {
    const url = client.buildUrl('search', {
      q: 'トヨタ',
      type: 'company',
    });
    expect(url).toContain('https://edinetdb.jp/v1/search?');
    expect(url).toContain('q=%E3%83%88%E3%83%A8%E3%82%BF');
    expect(url).toContain('type=company');
  });

  test('omits undefined param values', () => {
    const url = client.buildUrl('search', {
      q: 'トヨタ',
      type: undefined,
    });
    expect(url).toContain('q=');
    expect(url).not.toContain('type=');
  });

  test('handles empty params object', () => {
    const url = client.buildUrl('search', {});
    expect(url).toBe('https://edinetdb.jp/v1/search');
  });

  test('handles numeric param values', () => {
    const url = client.buildUrl('documents', { limit: 100 });
    expect(url).toBe('https://edinetdb.jp/v1/documents?limit=100');
  });
});

// ── Retry limit (unit test, no real API calls) ──────────────────────

describe('EdinetClient retry behavior', () => {
  test('get rejects after exhausting retries on 5xx', async () => {
    const client = new EdinetClient('test-api-key');

    // Override sleep to be instant
    (client as any).sleep = () => Promise.resolve();

    // Mock fetch to always return 500
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
    };

    try {
      await expect(client.get('search')).rejects.toThrow('EDINET API error 500');
      // Initial call + 3 retries = 4 total calls
      expect(callCount).toBe(4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('get succeeds when 5xx clears on retry', async () => {
    const client = new EdinetClient('test-api-key');
    (client as any).sleep = () => Promise.resolve();

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
      }
      return new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const result = await client.get<{ result: string }>('search');
      expect(result).toEqual({ result: 'ok' });
      expect(callCount).toBe(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
