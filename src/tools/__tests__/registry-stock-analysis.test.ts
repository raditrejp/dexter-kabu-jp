import { describe, test, expect, mock, afterEach } from 'bun:test';

process.env.RADIKABUNAVI_API_KEY = 'rk_test';
const { getToolRegistry } = await import('../registry.js');

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockServer(toolText: string[], isError = false) {
  const calls: Array<{ method: string; params: any }> = [];
  (globalThis as any).fetch = mock(async (_url: string, opts: RequestInit) => {
    const body = JSON.parse(opts.body as string);
    calls.push({ method: body.method, params: body.params });
    const result = body.method === 'tools/call'
      ? { content: toolText.map((text) => ({ type: 'text', text })), ...(isError ? { isError: true } : {}) }
      : {};
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      text: async () => (body.id == null ? '' : `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', result, id: body.id })}`),
    } as Response;
  });
  return calls;
}

function getTool() {
  const t = getToolRegistry('test-model').find((x) => x.name === 'get_stock_analysis');
  if (!t) throw new Error('get_stock_analysis is not registered');
  return t.tool;
}

describe('get_stock_analysis tool', () => {
  test('is registered and passes code / currentPrice to the MCP tool', async () => {
    const calls = mockServer([JSON.stringify({ code: '9999', usage: { counted: 6 }, sections: [] })]);
    const out = await getTool().invoke({ code: '9999', currentPrice: 1234 });
    const call = calls.find((c) => c.method === 'tools/call')!;
    expect(call.params).toEqual({ name: 'get_stock_analysis', arguments: { code: '9999', currentPrice: 1234 } });
    expect(JSON.parse(out as string).code).toBe('9999');
  });

  test('omits currentPrice when not given', async () => {
    const calls = mockServer([JSON.stringify({ code: '140A', sections: [] })]);
    await getTool().invoke({ code: '140A' });
    expect(calls.find((c) => c.method === 'tools/call')!.params.arguments).toEqual({ code: '140A' });
  });

  test('reads only the first text when the 80% usage notice is appended', async () => {
    mockServer([JSON.stringify({ code: '9999', sections: [] }), '本日の上限の80%に達しました。']);
    const out = JSON.parse((await getTool().invoke({ code: '9999' })) as string);
    expect(out.code).toBe('9999');
  });

  test('adds userNotice when sections were withheld', async () => {
    mockServer([JSON.stringify({
      code: '9999',
      usage: { counted: 3, withheld: [{ key: 'dcf', title: 'DCF' }], withheldNote: '今日の利用回数が足りないため返していません' },
      sections: [],
    })]);
    const out = JSON.parse((await getTool().invoke({ code: '9999' })) as string);
    expect(out.userNotice).toContain('今日の利用回数が足りない');
  });

  test('returns the server message as error when isError is set (e.g. not analyzable)', async () => {
    mockServer(['銘柄コード 9999 は上場廃止のため分析できません。search_stocks で確認してください。'], true);
    const out = JSON.parse((await getTool().invoke({ code: '9999' })) as string);
    expect(out.error).toContain('上場廃止');
  });
});
