/**
 * Sanitize error messages before exposing to LLM / user.
 *
 * Strips URLs, API keys, file paths, and response bodies that may
 * leak internal details. Returns a generic but actionable message.
 */

// Patterns that should never reach the user
const SENSITIVE_PATTERNS = [
  /https?:\/\/[^\s"')]+/g,                   // URLs (may contain tokens)
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,         // Bearer tokens
  /[A-Za-z0-9_-]{20,}/g,                     // Long opaque tokens / API keys
  /\/Users\/[^\s"')]+/g,                      // macOS file paths
  /\/home\/[^\s"')]+/g,                       // Linux file paths
  /[A-Z]:\\[^\s"')]+/g,                       // Windows file paths
];

/**
 * Return a user-safe error string.
 *
 * - Known HTTP status codes → friendly Japanese message
 * - Everything else → generic message + original error class name for debugging
 */
export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Rate limit
  if (raw.includes('429') || /rate.?limit/i.test(raw)) {
    return 'APIのレート制限に達しました。しばらく待ってからお試しください。';
  }

  // Auth
  if (raw.includes('401') || raw.includes('403') || /unauthorized|forbidden/i.test(raw)) {
    return 'API認証エラーです。APIキーの設定を確認してください。';
  }

  // Timeout / abort
  if (/timeout|abort/i.test(raw)) {
    return '外部APIがタイムアウトしました。時間をおいてお試しください。';
  }

  // Server error
  if (/5\d{2}/.test(raw)) {
    return '外部APIでサーバーエラーが発生しました。時間をおいてお試しください。';
  }

  // Network
  if (/ECONNREFUSED|ENOTFOUND|fetch failed/i.test(raw)) {
    return '外部APIへの接続に失敗しました。ネットワーク接続を確認してください。';
  }

  // Credit / billing
  if (/credit|balance|billing/i.test(raw)) {
    return 'APIアカウントの残高が不足しています。プロバイダーの課金設定を確認してください。';
  }

  // Fallback: strip sensitive info
  let cleaned = raw;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[redacted]');
  }

  // If cleaning removed most of the message, use generic
  if (cleaned.length < 10 || cleaned === '[redacted]') {
    return '外部APIへの接続でエラーが発生しました。';
  }

  return cleaned;
}
