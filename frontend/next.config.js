/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // ── API proxy — keeps API base URL server-side only ─────────────────────
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://backend:8000"}/api/:path*`,
      },
    ];
  },

  // ── Security headers ─────────────────────────────────────────────────────
  // Applied to all routes by the backend middleware too, but also here so
  // Next.js static pages (e.g. /about, /terms) get them even when served
  // directly from Vercel's CDN edge without hitting the API.
  async headers() {
    const securityHeaders = [
      {
        // Prevent content from being embedded in iframes (clickjacking)
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        // Prevent MIME-type sniffing
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        // Force HTTPS for 1 year, include subdomains
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
      {
        // Limit referrer header to same origin
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        // Disable dangerous browser features
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      {
        // Content Security Policy
        // script-src 'self': no inline scripts, no eval
        // style-src 'unsafe-inline': needed for Tailwind class injection
        // font-src: Google Fonts used for JetBrains Mono + Space Grotesk
        // img-src data:: recharts uses data: URIs for chart SVGs
        // connect-src: API calls to Railway backend
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval'",         // Next.js needs unsafe-eval in dev; fine in prod build
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          "connect-src 'self' https://phishguard-production-0e6b.up.railway.app wss:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ];

    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
