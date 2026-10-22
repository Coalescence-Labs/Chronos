export function contentSecurityPolicy(
  nonce: string,
  development = false,
  /** Omit on local HTTP prod (`next start`) — upgrade breaks asset loads without TLS. */
  upgradeInsecureRequests = !development,
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Graph geometry and theme tokens use React style attributes.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "img-src 'self' data: https:", "font-src 'self'", "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'",
    ...(upgradeInsecureRequests ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
