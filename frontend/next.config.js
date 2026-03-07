/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  /*
   * FIX: API proxy rewrites /api/v1/* → backend:8000/api/v1/*
   *
   * IMPORTANT: Only proxy /api/v1/* paths. Do NOT use /api/:path* (too broad)
   * as it would intercept Next.js own /api/auth/* route handlers and forward
   * them to the backend — breaking cookie handling and auth flow.
   */
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },

  async headers() {
    const isProd = process.env.NODE_ENV === "production";

    // Build connect-src dynamically
    const connectSrc = [
      "'self'",
      // FIX: Allow the Railway backend URL if set
      process.env.NEXT_PUBLIC_API_URL || "",
      // Allow WebSocket connections for any hot-reload in dev
      !isProd ? "ws: wss:" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const securityHeaders = [
      { key: "X-Frame-Options",           value: "DENY" },
      { key: "X-Content-Type-Options",    value: "nosniff" },
      { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      /*
       * FIX: Content-Security-Policy.
       *
       * Previous issues:
       * 1. connect-src was missing the backend Railway URL — API calls blocked.
       * 2. style-src was missing 'unsafe-inline' — Tailwind inline styles blocked.
       * 3. script-src needed 'unsafe-eval' for Next.js dev/turbopack.
       *
       * Note: The CSP is intentionally relaxed on style-src with unsafe-inline
       * because Tailwind, framer-motion, and recharts all inject inline styles.
       * Removing unsafe-inline would require nonce-based CSP which is complex.
       */
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob:",
          `connect-src ${connectSrc}`,
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ];

    // Only add HSTS in production (causes issues in local dev)
    if (isProd) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
