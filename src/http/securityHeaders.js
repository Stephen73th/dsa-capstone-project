// HTTP Security Headers middleware.
// Sets Content-Security-Policy (strictly no inline scripts), X-Content-Type-Options,
// Referrer-Policy, and clickjacking protection headers.

export const SECURITY_HEADERS = Object.freeze({
  // No inline scripts allowed: forces scripts to be loaded from external files via 'self'
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // styles allowed inline for UI utilities, but scripts strictly blocked
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
});

/**
 * Applies security headers to an outgoing HTTP response.
 * @param {import('node:http').ServerResponse} res
 */
export function applySecurityHeaders(res) {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(header, value);
  }
}
