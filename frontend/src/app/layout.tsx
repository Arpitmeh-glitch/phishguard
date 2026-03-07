import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PhishGuard — Cybersecurity Detection Platform",
  description: "Enterprise-grade phishing, fraud, and malicious URL detection powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // FIXED: Removed className="dark" — it activated Tailwind's dark: variant
    // overrides which made text-text-primary and text-text-secondary render as
    // transparent/invisible on our already-dark background.
    // The site is always dark via CSS variables; Tailwind dark mode not needed.
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} bg-cyber-dark text-text-primary antialiased`}>
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
