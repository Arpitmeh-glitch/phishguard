import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "PhishGuard — Cybersecurity Detection Platform",
  description: "Enterprise-grade phishing, fraud, and malicious URL detection powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * FIX: Removed className="dark" — it was activating Tailwind's dark: variant
     * overrides which reset text colors to transparent/unknown values on our
     * custom color tokens. We control the dark theme entirely via CSS variables,
     * so Tailwind dark mode must not be triggered.
     *
     * FIX: Removed next/font Inter import — it was injecting a className that
     * overrode font-family on body, preventing 'Space Grotesk' and 'JetBrains Mono'
     * from loading correctly. Fonts are loaded via Google Fonts <link> in <head>.
     */
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: "#050810", color: "#e8eaf0" }}>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#0c1120",
                color: "#e8eaf0",
                border: "1px solid #1a2540",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "13px",
              },
              success: { iconTheme: { primary: "#00ff88", secondary: "#0c1120" } },
              error:   { iconTheme: { primary: "#ff2d55", secondary: "#0c1120" } },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
