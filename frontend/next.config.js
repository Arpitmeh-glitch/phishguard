/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // ── API proxy — keeps API base URL server-side only ─────────────────────
  // FIX: Proxy rewrites /api/v1/* → backend:8000/api/v1/* (not /api/*)
  // The old rule rewrote /api/:path* which caught Next.js's own /api/auth/*
  // routes and forwarded them to the backend, breaking set-cookie etc.
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
    return [
      {
        // Only proxy /api/v1/* to the backend; leave /api/auth/* for Next.js
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },

  // ── Security headers ─────────────────────────────────────────────────────
  async headers() {
    const securityHeaders = [
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      {
        // FIX: connect-src now includes Railway backend URL AND 'self' for
        // the proxy. Previously 'self' only — API calls were blocked by CSP.
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          // FIX: Added Railway URL and wss: for connect-src
          "connect-src 'self' https://phishguard-production-0e6b.up.railway.app wss: ws:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ];

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
