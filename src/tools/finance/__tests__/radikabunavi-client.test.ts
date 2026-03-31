import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { RadikabuNaviClient } from '../radikabunavi-client.js';

describe('RadikabuNaviClient', () => {
  test('throws if API key is empty', () => {
    expect(() => new RadikabuNaviClient('')).toThrow('RADIKABUNAVI_API_KEY');
  });

  test('constructs with valid API key', () => {
    const client = new RadikabuNaviClient('rk_test_key');
    expect(client).toBeDefined();
  });

  describe('with mocked fetch', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = originalFetch;
    });

    function mockFetch(responses: Array<{ status?: number; headers?: Record<string, string>; body: string }>) {
      let callIndex = 0;
      (globalThis as any).fetch = mock(async () => {
        const res = responses[callIndex++] ?? responses[responses.length - 1];
        return {
          ok: (res.status ?? 200) >= 200 && (res.status ?? 200) < 300,
          status: res.status ?? 200,
          statusText: res.status === 401 ? 'Unauthorized' : 'OK',
          headers: new Headers(res.headers ?? {}),
          text: async () => res.body,
        } as Response;
      });
    }

    test('initialize sends JSON-RPC initialize and notifications/initialized', async () => {
      const calls: string[] = [];
      (globalThis as any).fetch = mock(async (_url: string, opts: RequestInit) => {
        const body = JSON.parse(opts.body as string);
        calls.push(body.method);
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'mcp-session-id': 'test-session-123' }),
          text: async () => body.method === 'initialize'
            ? 'event: message\ndata: {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05"},"id":0}'
            : '',
        } as Response;
      });

      const client = new RadikabuNaviClient('rk_test');
      await client.initialize();
      expect(calls).toEqual(['initialize', 'notifications/initialized']);
    });

    test('callTool extracts text content from MCP response', async () => {
      mockFetch([
        // initialize
        { headers: { 'mcp-session-id': 'sid' }, body: 'event: message\ndata: {"jsonrpc":"2.0","result":{},"id":0}' },
        // notifications/initialized
        { body: '' },
        // tools/call
        { headers: { 'mcp-session-id': 'sid' }, body: 'event: message\ndata: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"hello world"}]},"id":1}' },
      ]);

      const client = new RadikabuNaviClient('rk_test');
      const result = await client.callTool('test_tool', { arg: 1 });
      expect(result).toBe('hello world');
    });

    test('callTool throws on MCP error response', async () => {
      mockFetch([
        { headers: { 'mcp-session-id': 'sid' }, body: 'event: message\ndata: {"jsonrpc":"2.0","result":{},"id":0}' },
        { body: '' },
        { headers: { 'mcp-session-id': 'sid' }, body: 'event: message\ndata: {"jsonrpc":"2.0","error":{"code":-32001,"message":"Tool not found"},"id":1}' },
      ]);

      const client = new RadikabuNaviClient('rk_test');
      expect(client.callTool('bad_tool', {})).rejects.toThrow('Tool not found');
    });

    test('throws on HTTP error status', async () => {
      mockFetch([
        { status: 401, body: 'Unauthorized' },
      ]);

      const client = new RadikabuNaviClient('rk_test');
      expect(client.initialize()).rejects.toThrow('ラジ株ナビMCPエラー（ステータス: 401）');
    });

    test('SSE with multiple data lines takes the last one', async () => {
      mockFetch([
        { headers: { 'mcp-session-id': 'sid' }, body: 'event: message\ndata: {"jsonrpc":"2.0","result":{},"id":0}' },
        { body: '' },
        {
          headers: { 'mcp-session-id': 'sid' },
          body: 'event: message\ndata: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"first"}]},"id":99}\n\nevent: message\ndata: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"last"}]},"id":1}',
        },
      ]);

      const client = new RadikabuNaviClient('rk_test');
      const result = await client.callTool('test', {});
      expect(result).toBe('last');
    });

    test('handles plain JSON response (no SSE)', async () => {
      mockFetch([
        { headers: { 'mcp-session-id': 'sid' }, body: '{"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05"},"id":0}' },
        { body: '' },
        { headers: { 'mcp-session-id': 'sid' }, body: '{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"plain json"}]},"id":1}' },
      ]);

      const client = new RadikabuNaviClient('rk_test');
      const result = await client.callTool('test', {});
      expect(result).toBe('plain json');
    });

    test('propagates session ID on subsequent requests', async () => {
      const sentHeaders: Record<string, string>[] = [];
      (globalThis as any).fetch = mock(async (_url: string, opts: RequestInit) => {
        sentHeaders.push(Object.fromEntries(Object.entries(opts.headers as Record<string, string>)));
        const body = JSON.parse(opts.body as string);
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'mcp-session-id': 'session-abc' }),
          text: async () => body.method === 'initialize'
            ? 'event: message\ndata: {"jsonrpc":"2.0","result":{},"id":0}'
            : body.method === 'tools/call'
              ? 'event: message\ndata: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"ok"}]},"id":' + body.id + '}'
              : '',
        } as Response;
      });

      const client = new RadikabuNaviClient('rk_test');
      await client.callTool('test', {});

      // First call (initialize) has no session ID
      expect(sentHeaders[0]['mcp-session-id']).toBeUndefined();
      // Subsequent calls should include session ID
      expect(sentHeaders[1]['mcp-session-id']).toBe('session-abc');
      expect(sentHeaders[2]['mcp-session-id']).toBe('session-abc');
    });
  });
});
