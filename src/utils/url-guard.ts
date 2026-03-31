/**
 * URL guard — blocks SSRF attempts by rejecting private/reserved IP ranges
 * and dangerous URL schemes.
 *
 * LLM-controlled tools (web_fetch, browser) must validate URLs through this
 * guard before making any network request.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',       // GCP metadata
  'instance-data',                   // AWS EC2 alias
]);

/**
 * Check if a hostname resolves to a private/reserved IP range.
 * Covers: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 *         169.254.0.0/16 (link-local / cloud metadata), [::1]
 */
function isPrivateHost(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true;

  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;

  // IPv4 patterns
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map(Number);
  if (nums.some(n => isNaN(n))) return false;

  const [a, b] = nums;
  if (a === 127) return true;                          // 127.0.0.0/8
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 172 && b! >= 16 && b! <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (AWS/GCP metadata)
  if (a === 0) return true;                            // 0.0.0.0/8

  return false;
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Validate a URL for safe external access.
 * Throws if the URL targets a private network or uses a blocked scheme.
 */
export function assertSafeUrl(urlString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('無効なURLです。');
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`許可されていないURLスキームです: ${parsed.protocol}`);
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new Error('ローカル・内部ネットワークへのアクセスはブロックされています。');
  }
}
