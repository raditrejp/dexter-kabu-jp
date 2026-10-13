/**
 * ラジ株ナビ MCP クライアント
 *
 * Streamable HTTP transport で radikabunavi.com/mcp に接続し、
 * EDINET 財務データツールを呼び出す。
 *
 * 認証: Authorization: Bearer <API_KEY>
 * プロトコル: JSON-RPC 2.0 (MCP Streamable HTTP)
 * セッション管理: ラジ株ナビの /mcp はステートレス（2026-04-05〜）で mcp-session-id を返さない。
 *   返ってきた場合（旧仕様・他サーバー）だけ、以降のリクエストに付けて送り返す。
 *
 * 応答の扱い:
 *   - エラーは HTTP 200 のまま result.isError=true で返る（上限到達・バースト制限・引数誤り等）。
 *     callTool / callToolData は isError のとき Error を投げる（文面は利用者向けの案内文）。
 *   - 1日の上限の80%に達した日は、成功結果の content に案内文の text が1件追加される。
 *     JSON を読む用途は callToolData（最初の text だけ）を使う。
 */

import { UserFacingError } from '../../utils/safe-error.js';

const MCP_ENDPOINT = 'https://radikabunavi.com/mcp';
const TIMEOUT_MS = 30_000;

interface McpResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

interface McpResponse {
  jsonrpc: '2.0';
  result?: McpResult;
  error?: { code: number; message: string };
  id: number | null;
}

export class RadikabuNaviClient {
  private readonly apiKey: string;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        'RADIKABUNAVI_API_KEY is required. Get yours at https://radikabunavi.com/mcp-service',
      );
    }
    // Reject control characters to prevent HTTP header injection (CRLF)
    if (/[\r\n\x00]/.test(apiKey)) {
      throw new Error('RADIKABUNAVI_API_KEY contains invalid characters.');
    }
    this.apiKey = apiKey;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.rawRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'kabu-dexter', version: '1.0.0' },
    }, 0);

    // mcp-session-id が無くてもよい（ステートレスサーバー）。あれば rawRequest が保持して送り返す。
    await this.rawRequest('notifications/initialized', {}, null);
    this.initialized = true;
  }

  /** 全 text をつないで返す（LLM にそのまま見せる用途。80% 予告の text も含む）。 */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.callToolRaw(name, args);
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('\n');
    }
    return JSON.stringify(result);
  }

  /**
   * 最初の text だけを返す（JSON.parse する用途）。
   * 上限の80%到達日は2件目に案内文が付くため、つないだ文字列は JSON として読めない。
   */
  async callToolData(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.callToolRaw(name, args);
    const first = result.content?.find((c: { type: string }) => c.type === 'text');
    if (first) return first.text;
    return JSON.stringify(result);
  }

  private async callToolRaw(name: string, args: Record<string, unknown>): Promise<McpResult> {
    await this.initialize();
    const result = await this.request('tools/call', { name, arguments: args });
    if (result.isError) {
      const message = (result.content ?? [])
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('\n');
      throw new UserFacingError(message || `ラジ株ナビMCPがエラーを返しました（${name}）`);
    }
    return result;
  }

  async listTools(): Promise<unknown[]> {
    await this.initialize();
    const result = await this.request('tools/list', {});
    return (result as unknown as { tools: unknown[] }).tools ?? [];
  }

  // ── Internal ──────────────────────────────────────────────────

  private requestId = 1;

  private async request(method: string, params: Record<string, unknown>): Promise<McpResult> {
    const id = this.requestId++;
    const parsed = await this.rawRequest(method, params, id);

    if (parsed.error) {
      throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`);
    }
    return parsed.result ?? {};
  }

  private async rawRequest(
    method: string,
    params: Record<string, unknown>,
    id: number | null,
  ): Promise<McpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    try {
      const body: Record<string, unknown> = { jsonrpc: '2.0', method, params };
      if (id !== null) body.id = id;

      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check HTTP status before parsing
      if (!response.ok) {
        throw new Error(`ラジ株ナビMCPエラー（ステータス: ${response.status}）`);
      }

      const sid = response.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;

      const text = await response.text();

      // Handle SSE format — take the last data: line (skip notifications)
      const dataLines = [...text.matchAll(/^data:\s*(.+)$/gm)];
      const jsonMatch = dataLines.length > 0
        ? dataLines[dataLines.length - 1]
        : text.match(/^(\{.+\})$/m);
      if (!jsonMatch) {
        if (id === null) return { jsonrpc: '2.0', result: {}, id: null };
        throw new Error(`Unexpected MCP response: ${text.slice(0, 200)}`);
      }

      return JSON.parse(jsonMatch[1]) as McpResponse;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
