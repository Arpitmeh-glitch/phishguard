/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // FIXED: darkMode: false — we control the dark theme ourselves via CSS vars.
  // Having darkMode: 'class' + <html class="dark"> caused Tailwind to inject
  // dark-mode overrides that reset text colors to transparent/unknown values.
  darkMode: false,
  theme: {
    extend: {
      colors: {
        // Background palette
        "cyber-dark":   "#050810",
        "cyber-card":   "#0c1120",
        "cyber-border": "#1a2540",
        // Neon accent colors — ALL variants generated (bg-*, text-*, border-*)
        "neon-cyan":    "#00f5ff",
        "neon-green":   "#00ff88",
        "neon-red":     "#ff2d55",
        "neon-yellow":  "#ffd60a",
        "neon-purple":  "#bf5af2",
        // FIXED: text-primary / text-secondary as proper color tokens.
        // Without these, `text-text-primary` had no colour and text was invisible.
        "text-primary":   "#e8eaf0",
        "text-secondary": "#8892b0",
      },
      fontFamily: {
        mono:    ["'JetBrains Mono'", "monospace"],
        display: ["'Space Grotesk'",  "sans-serif"],
        body:    ["'Inter'",           "sans-serif"],
      },
      boxShadow: {
        "neon-cyan":  "0 0 20px rgba(0, 245, 255, 0.3)",
        "neon-green": "0 0 20px rgba(0, 255, 136, 0.3)",
        "neon-red":   "0 0 20px rgba(255, 45, 85, 0.3)",
        "neon-card":  "0 4px 24px rgba(0, 0, 0, 0.6), 0 0 1px rgba(0, 245, 255, 0.1)",
      },
      opacity: {
        // FIXED: 6 and 8 are not default Tailwind opacity steps — add them
        // so opacity-6 and opacity-8 actually apply instead of being no-ops.
        "6": "0.06",
        "8": "0.08",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan-line":  "scanLine 2s linear infinite",
        "glow":       "glow 2s ease-in-out infinite alternate",
        "float":      "float 6s ease-in-out infinite",
      },
      keyframes: {
        scanLine: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        glow: {
          "0%":   { textShadow: "0 0 10px rgba(0, 245, 255, 0.5)" },
          "100%": { textShadow: "0 0 30px rgba(0, 245, 255, 1), 0 0 60px rgba(0, 245, 255, 0.5)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-10px)" },
        },
      },
      backgroundImage: {
        "cyber-grid":    "linear-gradient(rgba(0, 245, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 245, 255, 0.03) 1px, transparent 1px)",
        "hero-gradient": "radial-gradient(ellipse at top left, rgba(0, 245, 255, 0.08) 0%, transparent 60%), radial-gradient(ellipse at bottom right, rgba(191, 90, 242, 0.06) 0%, transparent 60%)",
      },
    },
  },
  plugins: [],
};
