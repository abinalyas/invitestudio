// Security headers shared by the static shell and the API. `_headers` carries the
// same CSP for static assets; tests/unit/security.test.mjs keeps the two in step.
//
// script-src keeps 'unsafe-inline' for now: the editor uses inline event handler
// attributes. Removing it is planned future work (docs/PHASE_0_INTEGRATION_PLAN.md, 4.2).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the HEIC photo decoder (vendor/libheif-bundle.js) compile its WebAssembly. It does not
  // allow eval() or new Function(), which stay blocked.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://images.unsplash.com",
  "media-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'"
].join('; ');

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
});
