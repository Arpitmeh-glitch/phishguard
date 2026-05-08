"use client";
import Link from "next/link";
import { motion, useMotionValue, useTransform, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, Zap, Lock, Globe, MessageSquare, FileSearch,
  ChevronRight, ArrowUpRight, Terminal, Eye, AlertTriangle,
  CheckCircle2, Cpu, Activity, GitBranch, Code2, Server,
  Package, BarChart3, Users, Star, Quote, ArrowRight, X, Check
} from "lucide-react";

// ─────────────────────────────────────────────────────────
// DESIGN TOKENS — single source of truth
// ─────────────────────────────────────────────────────────
const tokens = {
  // Surfaces
  bg0: "#03040a",          // deepest bg
  bg1: "#070b14",          // base bg
  bg2: "#0c1120",          // card bg
  bg3: "#111827",          // elevated card
  
  // Borders
  border0: "rgba(255,255,255,0.04)",
  border1: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",

  // Text
  textPrimary: "#f0f4ff",
  textSecondary: "#8892aa",
  textTertiary: "#4a5568",

  // Accents — balanced, not cyan-only
  accentBlue: "#3b82f6",     // primary CTA
  accentCyan: "#06b6d4",     // terminal / data
  accentGreen: "#10b981",    // success / safe
  accentAmber: "#f59e0b",    // warning
  accentRed: "#ef4444",      // danger / threat
  accentPurple: "#8b5cf6",   // API / dev

  // Gradients
  gradHero: "radial-gradient(ellipse 120% 70% at 50% -10%, rgba(59,130,246,0.12) 0%, transparent 70%)",
  gradCard: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
};

// ─────────────────────────────────────────────────────────
// GLOBAL CSS  (injected once)
// ─────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html { scroll-behavior: smooth; }

    body {
      background: ${tokens.bg0};
      color: ${tokens.textPrimary};
      font-family: 'Geist', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    .font-mono { font-family: 'Geist Mono', monospace; }

    /* Scroll progress */
    .scroll-progress {
      position: fixed; top: 0; left: 0; right: 0; height: 1px;
      background: ${tokens.accentBlue}; transform-origin: left; z-index: 9999;
    }

    /* Grid texture */
    .grid-texture {
      background-image:
        linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    /* Noise overlay */
    .noise::after {
      content: '';
      position: absolute; inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none; z-index: 0; border-radius: inherit;
    }

    /* Glow pulse */
    @keyframes glow-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }

    @keyframes scan {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }

    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    .blink { animation: blink 1s step-end infinite; }

    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }

    /* Shimmer */
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .shimmer {
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
      background-size: 200% 100%;
      animation: shimmer 3s infinite;
    }

    /* Badge */
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 100px;
      border: 1px solid ${tokens.border2};
      background: rgba(59,130,246,0.08);
      font-family: 'Geist Mono', monospace;
      font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
      color: ${tokens.accentBlue};
    }

    /* Glass card */
    .glass {
      background: ${tokens.gradCard};
      border: 1px solid ${tokens.border1};
      backdrop-filter: blur(12px);
      border-radius: 16px;
    }

    /* CTA primary */
    .cta-primary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 24px; border-radius: 10px;
      background: ${tokens.accentBlue};
      color: white; font-weight: 600; font-size: 14px;
      text-decoration: none; transition: all 0.2s;
      box-shadow: 0 0 0 0 rgba(59,130,246,0.4);
    }
    .cta-primary:hover {
      background: #2563eb;
      box-shadow: 0 0 24px rgba(59,130,246,0.35);
      transform: translateY(-1px);
    }

    /* CTA secondary */
    .cta-secondary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 24px; border-radius: 10px;
      border: 1px solid ${tokens.border2};
      background: rgba(255,255,255,0.04);
      color: ${tokens.textPrimary}; font-weight: 500; font-size: 14px;
      text-decoration: none; transition: all 0.2s;
    }
    .cta-secondary:hover {
      background: rgba(255,255,255,0.07);
      border-color: ${tokens.border2};
      transform: translateY(-1px);
    }

    /* Section label */
    .section-label {
      font-family: 'Geist Mono', monospace;
      font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
      color: ${tokens.textTertiary};
    }

    /* Divider line */
    .h-divider {
      width: 100%; height: 1px;
      background: linear-gradient(90deg, transparent, ${tokens.border1} 30%, ${tokens.border1} 70%, transparent);
    }

    /* Threat dot */
    @keyframes threat-ping {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(3); opacity: 0; }
    }
    .threat-dot::after {
      content: ''; position: absolute; inset: 0; border-radius: 50%;
      background: currentColor;
      animation: threat-ping 1.5s ease-out infinite;
    }

    /* Remove default focus ring for mouse users */
    :focus-visible {
      outline: 2px solid ${tokens.accentBlue};
      outline-offset: 2px;
    }
  `}</style>
);

// ─────────────────────────────────────────────────────────
// SCROLL PROGRESS BAR
// ─────────────────────────────────────────────────────────
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  return <motion.div className="scroll-progress" style={{ scaleX }} />;
}

// ─────────────────────────────────────────────────────────
// AMBIENT BACKGROUND
// ─────────────────────────────────────────────────────────
function AmbientBg() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} aria-hidden="true">
      {/* Base grid */}
      <div className="grid-texture" style={{ position: "absolute", inset: 0, opacity: 0.6 }} />
      {/* Hero radial glow */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: "80vw", height: "60vh",
        background: "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.10) 0%, transparent 70%)",
      }} />
      {/* Bottom left glow */}
      <div style={{
        position: "absolute", bottom: "20%", left: "-5%",
        width: "40vw", height: "40vh",
        background: "radial-gradient(ellipse at 0% 100%, rgba(139,92,246,0.06) 0%, transparent 70%)",
      }} />
      {/* Scan line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(59,130,246,0.3), transparent)",
        animation: "scan 8s linear infinite",
        opacity: 0.4,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 32px",
        transition: "all 0.3s",
        background: scrolled ? "rgba(3,4,10,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? `1px solid ${tokens.border0}` : "1px solid transparent",
      }}
      role="banner"
    >
      <nav style={{ maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }} aria-label="Main navigation">
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }} aria-label="TieTiePhish home">
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(59,130,246,0.4)",
          }}>
            <Shield size={16} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: tokens.textPrimary, letterSpacing: "-0.02em" }}>TieTiePhish</span>
        </Link>

        {/* Nav links — hidden on mobile */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }} role="list">
          {["Platform", "Pricing", "Docs", "Blog"].map(item => (
            <Link
              key={item}
              href={`/${item.toLowerCase()}`}
              style={{ color: tokens.textSecondary, textDecoration: "none", fontSize: 14, fontWeight: 500, transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = tokens.textPrimary)}
              onMouseLeave={e => (e.currentTarget.style.color = tokens.textSecondary)}
            >
              {item}
            </Link>
          ))}
        </div>

        {/* Right CTAs */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/auth/login" style={{ color: tokens.textSecondary, textDecoration: "none", fontSize: 14, fontWeight: 500, padding: "8px 14px" }}>
            Sign in
          </Link>
          <Link href="/auth/register" className="cta-primary" style={{ padding: "8px 18px", fontSize: 13 }}>
            Get started
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}

// ─────────────────────────────────────────────────────────
// HERO — SPLIT LAYOUT
// ─────────────────────────────────────────────────────────

const terminalLines = [
  { t: 0,    text: "$ tietiephish scan --url https://login-paypal-secure.xyz", type: "cmd" },
  { t: 600,  text: "> Resolving domain...", type: "info" },
  { t: 1200, text: "> Extracting 30 URL features...", type: "info" },
  { t: 1900, text: "> Running RandomForest + BERT ensemble...", type: "info" },
  { t: 2700, text: "> THREAT DETECTED — Confidence: 97.4%", type: "danger" },
  { t: 3300, text: "> Indicators: brand_impersonation, suspicious_tld, typosquatting", type: "danger" },
  { t: 4100, text: "> Action: BLOCKED ✓  |  User: Protected ✓", type: "safe" },
  { t: 4900, text: "> Report saved to /reports/2024-01-15T14:32:08Z.json", type: "info" },
];

function HeroTerminal() {
  const [lines, setLines] = useState<typeof terminalLines>([]);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];

    const startCycle = () => {
      setLines([]);
      timers = terminalLines.map(line =>
        setTimeout(() => setLines(prev => [...prev, line]), line.t)
      );
    };

    startCycle();
    const loop = setInterval(startCycle, 7000);
    return () => { clearInterval(loop); timers.forEach(clearTimeout); };
  }, []);

  const colorMap = {
    cmd: tokens.textSecondary,
    info: tokens.textPrimary,
    danger: "#fb7185",
    safe: tokens.accentGreen,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: tokens.bg2,
        border: `1px solid ${tokens.border1}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)",
        animation: "float 6s ease-in-out infinite",
      }}
    >
      {/* Chrome bar */}
      <div style={{
        background: tokens.bg3,
        borderBottom: `1px solid ${tokens.border0}`,
        padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f56","#ffbd2e","#27c93f"].map(c => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div style={{
          flex: 1, textAlign: "center",
          fontFamily: "Geist Mono, monospace", fontSize: 12,
          color: tokens.textTertiary,
        }}>
          tietiephish — threat scanner
        </div>
        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: tokens.accentGreen, position: "relative", flexShrink: 0 }} className="threat-dot" />
          <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: tokens.accentGreen }}>LIVE</span>
        </div>
      </div>

      {/* Terminal body */}
      <div style={{ padding: "20px", minHeight: 220, fontFamily: "Geist Mono, monospace", fontSize: 12.5, lineHeight: "1.9" }}>
        <AnimatePresence>
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                color: colorMap[line.type as keyof typeof colorMap],
                textShadow: line.type === "danger" ? "0 0 10px rgba(251,113,133,0.3)" : line.type === "safe" ? "0 0 10px rgba(16,185,129,0.3)" : "none",
              }}
            >
              {line.text}
              {i === lines.length - 1 && lines.length < terminalLines.length && (
                <span className="blink" style={{ color: tokens.accentBlue }}>█</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div style={{
        borderTop: `1px solid ${tokens.border0}`,
        background: tokens.bg3,
        padding: "8px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "Model", value: "RF+BERT" },
            { label: "Latency", value: "142ms" },
          ].map(item => (
            <span key={item.label} style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: tokens.textTertiary }}>
              <span style={{ color: tokens.textSecondary }}>{item.label}:</span> {item.value}
            </span>
          ))}
        </div>
        <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: tokens.textTertiary }}>
          v2.4.1
        </span>
      </div>
    </motion.div>
  );
}

// Animated counter
function CountUp({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !started.current) {
        started.current = true;
        let start = 0;
        const duration = 1500;
        const step = 16;
        const inc = end / (duration / step);
        const timer = setInterval(() => {
          start += inc;
          if (start >= end) { setVal(end); clearInterval(timer); }
          else setVal(Math.floor(start));
        }, step);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end]);

  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

function HeroSection() {
  return (
    <section
      style={{
        position: "relative", zIndex: 10,
        minHeight: "100vh",
        display: "flex", alignItems: "center",
        padding: "120px 32px 80px",
      }}
      aria-labelledby="hero-heading"
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          {/* Left column — copy */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Status badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px 5px 8px",
                border: `1px solid ${tokens.border2}`,
                borderRadius: 100,
                background: "rgba(16,185,129,0.08)",
                fontSize: 12, color: tokens.accentGreen,
                fontFamily: "Geist Mono, monospace",
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: tokens.accentGreen, flexShrink: 0, position: "relative" }} className="threat-dot" />
                System operational · 99.9% uptime
              </div>
            </motion.div>

            <h1
              id="hero-heading"
              style={{
                fontSize: "clamp(40px, 5vw, 64px)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
                color: tokens.textPrimary,
                marginBottom: 24,
              }}
            >
              Stop phishing
              <br />
              <span style={{
                background: `linear-gradient(135deg, ${tokens.accentBlue} 0%, #60a5fa 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                before it starts.
              </span>
            </h1>

            <p style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: tokens.textSecondary,
              marginBottom: 36,
              maxWidth: 480,
            }}>
              Enterprise-grade threat detection powered by ML. Analyze URLs, files, and messages 
              in real-time with 97.4% accuracy and sub-200ms response times.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
              <Link href="/auth/register" className="cta-primary" aria-label="Create free account">
                Start for free
                <ArrowUpRight size={15} />
              </Link>
              <Link href="/dashboard" className="cta-secondary" aria-label="View live demo">
                View demo
                <ChevronRight size={15} />
              </Link>
            </div>

            {/* Social proof micro row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Avatar stack */}
              <div style={{ display: "flex" }}>
                {["#1d4ed8","#7c3aed","#0891b2","#065f46"].map((bg, i) => (
                  <div key={i} style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: bg, border: `2px solid ${tokens.bg1}`,
                    marginLeft: i === 0 ? 0 : -8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Users size={11} color="rgba(255,255,255,0.8)" />
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 13, color: tokens.textTertiary }}>
                <span style={{ color: tokens.textSecondary, fontWeight: 600 }}>2,400+</span> security teams trust TieTiePhish
              </span>
            </div>
          </motion.div>

          {/* Right column — terminal */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroTerminal />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// TRUSTED BY STRIP
// ─────────────────────────────────────────────────────────
const trustedCompanies = ["Accenture", "Deloitte", "IBM Security", "Palo Alto", "CrowdStrike", "Elastic", "DataDog", "Splunk"];

function TrustedBy() {
  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 80px" }} aria-label="Trusted by section">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="h-divider" style={{ marginBottom: 40 }} />
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p className="section-label">Trusted by security teams worldwide</p>
        </div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          flexWrap: "wrap", gap: "12px 40px",
        }}>
          {trustedCompanies.map(name => (
            <motion.span
              key={name}
              whileHover={{ opacity: 1 }}
              style={{
                fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em",
                color: tokens.textTertiary, transition: "opacity 0.2s",
                opacity: 0.6,
              }}
            >
              {name}
            </motion.span>
          ))}
        </div>
        <div className="h-divider" style={{ marginTop: 40 }} />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// ANIMATED METRICS STRIP
// ─────────────────────────────────────────────────────────
const metrics = [
  { label: "URLs Scanned", value: 2500000, suffix: "+", icon: Globe, color: tokens.accentBlue },
  { label: "Detection Accuracy", value: 97, suffix: "%", icon: CheckCircle2, color: tokens.accentGreen },
  { label: "Avg Response", value: 142, suffix: "ms", icon: Zap, color: tokens.accentCyan },
  { label: "Threats Blocked", value: 500000, suffix: "+", icon: Shield, color: tokens.accentPurple },
];

function MetricsStrip() {
  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 80px" }} aria-label="Platform metrics">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              style={{
                background: tokens.bg2,
                border: `1px solid ${tokens.border1}`,
                borderRadius: 14,
                padding: "24px",
                position: "relative", overflow: "hidden",
              }}
            >
              {/* Glow corner */}
              <div style={{
                position: "absolute", top: -20, right: -20,
                width: 80, height: 80, borderRadius: "50%",
                background: `radial-gradient(circle, ${m.color}18 0%, transparent 70%)`,
              }} />

              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${m.color}15`,
                border: `1px solid ${m.color}25`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16,
              }}>
                <m.icon size={17} color={m.color} />
              </div>

              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.04em", color: tokens.textPrimary, lineHeight: 1 }}>
                <CountUp end={m.value} suffix={m.suffix} />
              </div>
              <div style={{ fontSize: 13, color: tokens.textTertiary, marginTop: 6, fontWeight: 500 }}>
                {m.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// FEATURE SPOTLIGHT — asymmetric storytelling blocks
// ─────────────────────────────────────────────────────────

// Attack detection visualization
function AttackVisualization() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const threats = [
    { label: "login-paypaI.com", type: "Typosquatting", severity: "critical", x: 20, y: 20 },
    { label: "secure-bank-update.xyz", type: "Credential Harvest", severity: "critical", x: 60, y: 55 },
    { label: "bit.ly/update-now", type: "URL Shortener", severity: "medium", x: 30, y: 70 },
    { label: "amazon-prize.win", type: "Prize Scam", severity: "high", x: 75, y: 25 },
    { label: "docusign-verify.io", type: "Brand Impersonation", severity: "critical", x: 15, y: 50 },
  ];

  const severityColor = { critical: tokens.accentRed, high: tokens.accentAmber, medium: "#facc15" };

  return (
    <div style={{
      background: tokens.bg2, border: `1px solid ${tokens.border1}`,
      borderRadius: 16, padding: 20, position: "relative", overflow: "hidden",
      height: 340,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Eye size={14} color={tokens.accentCyan} />
          <span style={{ fontSize: 12, fontFamily: "Geist Mono, monospace", color: tokens.textSecondary }}>
            Threat Intelligence Feed
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: tokens.accentRed, position: "relative" }} className="threat-dot" />
          <span style={{ fontSize: 11, fontFamily: "Geist Mono, monospace", color: tokens.accentRed }}>LIVE</span>
        </div>
      </div>

      {/* Threat map */}
      <div style={{ position: "relative", height: 250, borderRadius: 10, background: `${tokens.bg0}80`, border: `1px solid ${tokens.border0}`, overflow: "hidden" }}>
        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }} />

        {/* Threat nodes */}
        {threats.map((threat, i) => (
          <motion.div
            key={threat.label}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.3, type: "spring" }}
            style={{
              position: "absolute",
              left: `${threat.x}%`, top: `${threat.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* Ping ring */}
            <motion.div
              animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
              style={{
                position: "absolute", inset: -6, borderRadius: "50%",
                border: `1px solid ${severityColor[threat.severity as keyof typeof severityColor]}`,
              }}
            />
            {/* Dot */}
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: severityColor[threat.severity as keyof typeof severityColor],
              boxShadow: `0 0 10px ${severityColor[threat.severity as keyof typeof severityColor]}`,
            }} />
            {/* Label — show on hover concept */}
            <div style={{
              position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              background: `${tokens.bg3}ee`,
              border: `1px solid ${tokens.border1}`,
              borderRadius: 6,
              padding: "2px 7px",
              fontSize: 10, fontFamily: "Geist Mono, monospace",
              color: severityColor[threat.severity as keyof typeof severityColor],
            }}>
              {threat.type}
            </div>
          </motion.div>
        ))}

        {/* Scan sweep */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: "200%", height: "1px",
            background: `linear-gradient(90deg, transparent, ${tokens.accentCyan}40)`,
            transformOrigin: "0 50%",
          }}
        />
      </div>
    </div>
  );
}

// URL scoring widget
function UrlScoreWidget() {
  const indicators = [
    { label: "Brand impersonation", triggered: true },
    { label: "Suspicious TLD (.xyz)", triggered: true },
    { label: "Subdomain abuse", triggered: true },
    { label: "Missing HTTPS", triggered: false },
    { label: "Typosquatting pattern", triggered: true },
    { label: "Lexical anomaly score", triggered: true },
  ];

  return (
    <div style={{
      background: tokens.bg2, border: `1px solid ${tokens.border1}`,
      borderRadius: 16, padding: 20, overflow: "hidden",
    }}>
      <div style={{ fontFamily: "Geist Mono, monospace", fontSize: 12, color: tokens.textTertiary, marginBottom: 12 }}>
        $ tietiephish analyze
      </div>
      <div style={{
        fontFamily: "Geist Mono, monospace", fontSize: 11,
        color: tokens.textSecondary,
        padding: "8px 12px",
        background: `${tokens.bg0}80`,
        borderRadius: 8, marginBottom: 16,
        border: `1px solid ${tokens.border0}`,
      }}>
        https://login-paypaI.com/verify
      </div>

      {/* Score */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: tokens.textSecondary, fontWeight: 500 }}>Threat Score</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em",
            color: tokens.accentRed,
          }}>97</div>
          <div style={{
            fontSize: 11, background: `${tokens.accentRed}18`,
            border: `1px solid ${tokens.accentRed}30`,
            color: tokens.accentRed, borderRadius: 6, padding: "2px 8px",
            fontFamily: "Geist Mono, monospace",
          }}>PHISHING</div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ height: 4, background: tokens.border0, borderRadius: 4, marginBottom: 16, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: "97%" }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${tokens.accentAmber}, ${tokens.accentRed})` }}
        />
      </div>

      {/* Indicators */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {indicators.map(ind => (
          <div key={ind.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {ind.triggered
              ? <AlertTriangle size={12} color={tokens.accentRed} />
              : <CheckCircle2 size={12} color={tokens.accentGreen} />
            }
            <span style={{
              fontSize: 12, fontFamily: "Geist Mono, monospace",
              color: ind.triggered ? tokens.textSecondary : tokens.textTertiary,
            }}>
              {ind.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 100px" }} aria-labelledby="features-heading">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <p className="section-label" style={{ marginBottom: 12 }}>Detection Platform</p>
          <h2 id="features-heading" style={{
            fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 800, letterSpacing: "-0.03em",
            color: tokens.textPrimary, lineHeight: 1.15, marginBottom: 16,
          }}>
            Three layers.<br />Zero compromise.
          </h2>
          <p style={{ fontSize: 17, color: tokens.textSecondary, maxWidth: 520, margin: "0 auto" }}>
            Built for security analysts, SOC teams, and developers who need speed without false positives.
          </p>
        </motion.div>

        {/* Block 1 — Attack Detection (full-width visual block) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 48, alignItems: "center", marginBottom: 24,
            background: tokens.bg2, border: `1px solid ${tokens.border1}`,
            borderRadius: 20, padding: 40,
          }}
        >
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "4px 10px", borderRadius: 8,
              background: `${tokens.accentRed}12`, border: `1px solid ${tokens.accentRed}25`,
              marginBottom: 20,
            }}>
              <Eye size={13} color={tokens.accentRed} />
              <span style={{ fontSize: 11, fontFamily: "Geist Mono, monospace", color: tokens.accentRed, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                URL Analysis
              </span>
            </div>
            <h3 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", color: tokens.textPrimary, marginBottom: 16, lineHeight: 1.2 }}>
              Real-time threat visualization
            </h3>
            <p style={{ fontSize: 15, color: tokens.textSecondary, lineHeight: 1.7, marginBottom: 24 }}>
              ML models analyze 30+ features including domain reputation, SSL certificates, 
              lexical patterns, and WHOIS data to identify threats before users click.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["RandomForest + BERT ensemble model", "Sub-200ms response time", "Reputation scoring with WHOIS lookups", "97.4% accuracy with <0.3% false positives"].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Check size={13} color={tokens.accentGreen} />
                  <span style={{ fontSize: 14, color: tokens.textSecondary }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <AttackVisualization />
        </motion.div>

        {/* Block 2 — two column */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          {/* URL Score */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            style={{ display: "flex", flexDirection: "column", gap: 24 }}
          >
            <UrlScoreWidget />
          </motion.div>

          {/* File inspection */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            style={{
              background: tokens.bg2, border: `1px solid ${tokens.border1}`,
              borderRadius: 16, padding: 28,
            }}
          >
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "4px 10px", borderRadius: 8,
              background: `${tokens.accentPurple}12`, border: `1px solid ${tokens.accentPurple}25`,
              marginBottom: 20,
            }}>
              <FileSearch size={13} color={tokens.accentPurple} />
              <span style={{ fontSize: 11, fontFamily: "Geist Mono, monospace", color: tokens.accentPurple, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                File Inspection
              </span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: tokens.textPrimary, marginBottom: 12, lineHeight: 1.25 }}>
              Deep malware detection
            </h3>
            <p style={{ fontSize: 14, color: tokens.textSecondary, lineHeight: 1.65, marginBottom: 24 }}>
              YARA rules, entropy analysis, and behavioral signatures scan attachments for embedded threats, 
              macro viruses, and ransomware payloads.
            </p>
            {/* File scan stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Files/day", value: "840K" },
                { label: "YARA rules", value: "12K+" },
                { label: "File types", value: "200+" },
                { label: "Scan depth", value: "7 layers" },
              ].map(item => (
                <div key={item.label} style={{
                  padding: "14px", borderRadius: 10,
                  background: `${tokens.bg3}`,
                  border: `1px solid ${tokens.border0}`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: tokens.textPrimary, letterSpacing: "-0.03em" }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Block 3 — Message scanning — wide */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            background: tokens.bg2, border: `1px solid ${tokens.border1}`,
            borderRadius: 20, padding: 40,
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center",
          }}
        >
          {/* Message preview pane */}
          <div style={{ order: 2 }}>
            <div style={{
              background: tokens.bg0, borderRadius: 12, padding: 20,
              border: `1px solid ${tokens.border0}`,
            }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: tokens.textTertiary, fontFamily: "Geist Mono, monospace", marginBottom: 4 }}>From:</div>
                <div style={{ fontSize: 13, color: tokens.textPrimary, fontFamily: "Geist Mono, monospace" }}>security@paypa1.com</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: tokens.textTertiary, fontFamily: "Geist Mono, monospace", marginBottom: 4 }}>Subject:</div>
                <div style={{ fontSize: 13, color: tokens.textPrimary }}>⚠️ Urgent: Your account has been limited</div>
              </div>
              <div style={{
                fontSize: 13, color: tokens.textSecondary, lineHeight: 1.65,
                padding: 12, borderRadius: 8,
                background: `${tokens.accentRed}08`,
                border: `1px solid ${tokens.accentRed}20`,
              }}>
                Dear valued customer, we have noticed suspicious activity on your account. 
                Click below to <span style={{ color: tokens.accentRed, fontWeight: 600 }}>verify your identity immediately</span> or your account will be suspended within 24 hours...
              </div>
              {/* Detection badges */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                {["Urgency manipulation", "Spoofed sender", "Credential harvesting"].map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, fontFamily: "Geist Mono, monospace",
                    padding: "2px 8px", borderRadius: 5,
                    background: `${tokens.accentRed}12`,
                    border: `1px solid ${tokens.accentRed}20`,
                    color: tokens.accentRed,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ order: 1 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "4px 10px", borderRadius: 8,
              background: `${tokens.accentCyan}12`, border: `1px solid ${tokens.accentCyan}25`,
              marginBottom: 20,
            }}>
              <MessageSquare size={13} color={tokens.accentCyan} />
              <span style={{ fontSize: 11, fontFamily: "Geist Mono, monospace", color: tokens.accentCyan, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Message Scanning
              </span>
            </div>
            <h3 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", color: tokens.textPrimary, marginBottom: 16, lineHeight: 1.2 }}>
              Stop social engineering at the source
            </h3>
            <p style={{ fontSize: 15, color: tokens.textSecondary, lineHeight: 1.7, marginBottom: 24 }}>
              NLP models identify phishing attempts in emails, SMS, and chat messages 
              by understanding context, urgency signals, and manipulative language patterns.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["BERT-based semantic analysis", "Sender spoofing detection", "Multi-language support (40+ languages)", "Outlook, Gmail, Slack integrations"].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Check size={13} color={tokens.accentGreen} />
                  <span style={{ fontSize: 14, color: tokens.textSecondary }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// WORKFLOW SECTION
// ─────────────────────────────────────────────────────────
const workflowSteps = [
  { n: "01", icon: Globe, title: "Submit threat", desc: "Send any URL, file, or message via API, browser extension, or dashboard.", color: tokens.accentBlue },
  { n: "02", icon: Cpu, title: "ML analysis", desc: "30+ feature extractors feed RandomForest and BERT models in parallel.", color: tokens.accentCyan },
  { n: "03", icon: Activity, title: "Score & classify", desc: "Threat score 0–100 with confidence interval and indicator breakdown.", color: tokens.accentPurple },
  { n: "04", icon: Shield, title: "Automated response", desc: "Block, alert, quarantine, or escalate based on your policy rules.", color: tokens.accentGreen },
];

function WorkflowSection() {
  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 100px" }} aria-labelledby="workflow-heading">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 56 }}
        >
          <p className="section-label" style={{ marginBottom: 12 }}>How it works</p>
          <h2 id="workflow-heading" style={{
            fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 800,
            letterSpacing: "-0.03em", color: tokens.textPrimary, lineHeight: 1.15,
          }}>
            From submission to protection in&nbsp;milliseconds
          </h2>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, position: "relative" }}>
          {/* Connector line */}
          <div style={{
            position: "absolute", top: 40, left: "12.5%", right: "12.5%", height: 1,
            background: `linear-gradient(90deg, ${tokens.border1} 0%, ${tokens.border2} 50%, ${tokens.border1} 100%)`,
            zIndex: 0,
          }} />

          {workflowSteps.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              style={{ position: "relative", zIndex: 1, padding: "0 16px" }}
            >
              {/* Icon circle */}
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: tokens.bg2,
                border: `2px solid ${step.color}30`,
                boxShadow: `0 0 24px ${step.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 24px",
              }}>
                <step.icon size={22} color={step.color} />
              </div>

              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: tokens.textTertiary, marginBottom: 8 }}>
                  Step {step.n}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: tokens.textPrimary, marginBottom: 10, letterSpacing: "-0.02em" }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 13.5, color: tokens.textSecondary, lineHeight: 1.65 }}>
                  {step.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// API / DEVELOPER SECTION
// ─────────────────────────────────────────────────────────
const codeSnippet = `const tietiephish = require('@tietiephish/sdk');

const client = new tietiephish.Client({
  apiKey: process.env.TIETIEPHISH_API_KEY
});

// Scan a URL in real-time
const result = await client.url.scan({
  url: 'https://login-paypal-secure.xyz',
  options: { deepScan: true, extractIndicators: true }
});

console.log(result.threatScore);   // 97
console.log(result.classification); // "PHISHING"
console.log(result.indicators);    // ['brand_impersonation', ...]
console.log(result.latencyMs);     // 142`;

function DeveloperSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const lines = codeSnippet.split("\n");
  const keywords = ["const", "require", "new", "await", "async", "return", "process"];
  const strings = /('.*?'|".*?")/g;
  const comments = /(\/\/.*)/g;

  const colorize = (line: string) => {
    if (line.trim().startsWith("//")) {
      return <span style={{ color: tokens.textTertiary }}>{line}</span>;
    }
    // Very basic syntax highlight
    return line.split(/(\s)/).map((word, i) => {
      if (keywords.includes(word)) return <span key={i} style={{ color: "#93c5fd" }}>{word}</span>;
      if (word.match(/^'.*'$/) || word.match(/^".*"$/)) return <span key={i} style={{ color: tokens.accentGreen }}>{word}</span>;
      if (word.match(/^\d+$/)) return <span key={i} style={{ color: tokens.accentAmber }}>{word}</span>;
      return <span key={i}>{word}</span>;
    });
  };

  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 100px" }} aria-labelledby="dev-heading">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          {/* Copy */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "4px 10px", borderRadius: 8,
              background: `${tokens.accentPurple}12`, border: `1px solid ${tokens.accentPurple}25`,
              marginBottom: 20,
            }}>
              <Code2 size={13} color={tokens.accentPurple} />
              <span style={{ fontSize: 11, fontFamily: "Geist Mono, monospace", color: tokens.accentPurple, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Developer API
              </span>
            </div>
            <h2 id="dev-heading" style={{
              fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800,
              letterSpacing: "-0.03em", color: tokens.textPrimary, lineHeight: 1.2, marginBottom: 18,
            }}>
              Integrate in minutes,<br />not days
            </h2>
            <p style={{ fontSize: 15, color: tokens.textSecondary, lineHeight: 1.7, marginBottom: 28 }}>
              RESTful API and official SDKs for Node.js, Python, Go, and Rust. 
              Comprehensive documentation, OpenAPI spec, and Postman collections included.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
              {[
                { icon: GitBranch, label: "Official SDKs for 6 languages", color: tokens.accentPurple },
                { icon: Server, label: "99.99% uptime SLA on Enterprise", color: tokens.accentBlue },
                { icon: Package, label: "Webhooks, batch API, and streaming", color: tokens.accentCyan },
                { icon: BarChart3, label: "Real-time dashboard and analytics", color: tokens.accentGreen },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: `${item.color}12`, border: `1px solid ${item.color}20`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <item.icon size={14} color={item.color} />
                  </div>
                  <span style={{ fontSize: 14, color: tokens.textSecondary }}>{item.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/docs" className="cta-primary">
                Read the docs
                <ArrowRight size={14} />
              </Link>
              <Link href="/auth/register" className="cta-secondary">
                Get API key
              </Link>
            </div>
          </motion.div>

          {/* Code block */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            style={{
              background: tokens.bg2, border: `1px solid ${tokens.border1}`,
              borderRadius: 16, overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
            }}
          >
            {/* Chrome */}
            <div style={{
              background: tokens.bg3, borderBottom: `1px solid ${tokens.border0}`,
              padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["#ff5f56","#ffbd2e","#27c93f"].map(c => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
                ))}
              </div>
              <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: tokens.textTertiary }}>
                scan.js
              </span>
              <button
                onClick={handleCopy}
                style={{
                  background: "transparent", border: `1px solid ${tokens.border1}`,
                  borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                  fontSize: 11, fontFamily: "Geist Mono, monospace",
                  color: copied ? tokens.accentGreen : tokens.textTertiary,
                  transition: "color 0.2s",
                }}
                aria-label="Copy code snippet"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Code */}
            <div style={{ padding: "20px", fontFamily: "Geist Mono, monospace", fontSize: 12.5, lineHeight: 1.75, overflowX: "auto" }}>
              {lines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 16 }}>
                  <span style={{ color: tokens.textTertiary, userSelect: "none", minWidth: 20, textAlign: "right" }}>{i + 1}</span>
                  <span style={{ color: tokens.textSecondary }}>{colorize(line)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// TESTIMONIALS
// ─────────────────────────────────────────────────────────
const testimonials = [
  {
    quote: "TieTiePhish cut our phishing incident response time by 80%. The API integration took under 2 hours and the accuracy is exceptional.",
    author: "Sarah Chen",
    role: "Head of Security Engineering",
    company: "Fintech Corp",
    avatar: "#1d4ed8",
  },
  {
    quote: "We evaluated six vendors. TieTiePhish was the only one that hit sub-200ms consistently while maintaining 97%+ accuracy. The developer experience is outstanding.",
    author: "Marcus Rivera",
    role: "CISO",
    company: "HealthScale",
    avatar: "#7c3aed",
  },
  {
    quote: "The message scanning feature alone has blocked over 50,000 spear phishing attempts in our org. ROI was visible within the first week.",
    author: "Priya Nair",
    role: "VP Information Security",
    company: "CloudOps Inc",
    avatar: "#0891b2",
  },
];

function TestimonialsSection() {
  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 100px" }} aria-labelledby="testimonials-heading">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <p className="section-label" style={{ marginBottom: 12 }}>What teams say</p>
          <h2 id="testimonials-heading" style={{
            fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 800,
            letterSpacing: "-0.03em", color: tokens.textPrimary,
          }}>
            Trusted by security professionals
          </h2>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {testimonials.map((t, i) => (
            <motion.blockquote
              key={t.author}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              style={{
                background: tokens.bg2, border: `1px solid ${tokens.border1}`,
                borderRadius: 16, padding: 28,
                margin: 0,
              }}
            >
              <Quote size={20} color={tokens.textTertiary} style={{ marginBottom: 16, opacity: 0.4 }} />
              <p style={{ fontSize: 14.5, color: tokens.textSecondary, lineHeight: 1.7, marginBottom: 24 }}>
                {t.quote}
              </p>
              <footer style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: t.avatar, display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "white" }}>
                    {t.author.charAt(0)}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>{t.author}</div>
                  <div style={{ fontSize: 12, color: tokens.textTertiary }}>
                    {t.role} · {t.company}
                  </div>
                </div>
              </footer>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// PRICING TEASER
// ─────────────────────────────────────────────────────────
const plans = [
  {
    name: "Starter",
    price: "Free",
    priceNote: "forever",
    desc: "For individuals and small teams getting started.",
    features: ["1,000 scans / month", "URL + message scanning", "REST API access", "Community support"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$49",
    priceNote: "per month",
    desc: "For growing security teams that need higher volume and priority support.",
    features: ["100K scans / month", "File scanning + YARA", "Webhooks & batch API", "Priority support", "Advanced analytics"],
    cta: "Start 14-day trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceNote: "contact sales",
    desc: "Dedicated infrastructure, SLAs, and compliance reporting.",
    features: ["Unlimited scans", "Dedicated environment", "99.99% uptime SLA", "SSO / SAML", "Custom integrations", "24/7 support"],
    cta: "Talk to sales",
    highlight: false,
  },
];

function PricingSection() {
  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 100px" }} aria-labelledby="pricing-heading">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <p className="section-label" style={{ marginBottom: 12 }}>Pricing</p>
          <h2 id="pricing-heading" style={{
            fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 800,
            letterSpacing: "-0.03em", color: tokens.textPrimary, marginBottom: 14,
          }}>
            Simple, transparent pricing
          </h2>
          <p style={{ fontSize: 16, color: tokens.textSecondary }}>
            No credit card required to start. Upgrade when you need more.
          </p>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              style={{
                background: plan.highlight
                  ? `linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.04) 100%)`
                  : tokens.bg2,
                border: `1px solid ${plan.highlight ? tokens.accentBlue + "40" : tokens.border1}`,
                borderRadius: 18, padding: 28,
                position: "relative", overflow: "hidden",
              }}
            >
              {plan.highlight && (
                <div style={{
                  position: "absolute", top: 16, right: 16,
                  fontSize: 10, fontFamily: "Geist Mono, monospace",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: tokens.accentBlue, background: `${tokens.accentBlue}18`,
                  border: `1px solid ${tokens.accentBlue}30`, borderRadius: 6, padding: "2px 8px",
                }}>
                  Most popular
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: tokens.textPrimary, marginBottom: 8 }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em", color: tokens.textPrimary }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: tokens.textTertiary }}>{plan.priceNote}</span>
                </div>
                <p style={{ fontSize: 13.5, color: tokens.textTertiary, lineHeight: 1.5 }}>{plan.desc}</p>
              </div>

              <div style={{ height: 1, background: tokens.border0, marginBottom: 20 }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Check size={13} color={tokens.accentGreen} />
                    <span style={{ fontSize: 13.5, color: tokens.textSecondary }}>{f}</span>
                  </div>
                ))}
              </div>

              <Link
                href={plan.name === "Enterprise" ? "/contact" : "/auth/register"}
                style={{
                  display: "block", textAlign: "center",
                  padding: "11px 20px", borderRadius: 10,
                  fontSize: 14, fontWeight: 600, textDecoration: "none",
                  transition: "all 0.2s",
                  background: plan.highlight ? tokens.accentBlue : "transparent",
                  color: plan.highlight ? "white" : tokens.textSecondary,
                  border: `1px solid ${plan.highlight ? "transparent" : tokens.border2}`,
                }}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// FINAL CTA
// ─────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section style={{ position: "relative", zIndex: 10, padding: "0 32px 80px" }} aria-labelledby="cta-heading">
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            background: tokens.bg2,
            border: `1px solid ${tokens.border1}`,
            borderRadius: 24,
            padding: "64px 48px",
            textAlign: "center",
            position: "relative", overflow: "hidden",
          }}
        >
          {/* Ambient glow */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "80%", height: "50%",
            background: "radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div className="shimmer" style={{ position: "absolute", inset: 0, borderRadius: 24, pointerEvents: "none" }} />

          <div style={{ position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "5px 14px", borderRadius: 100,
              border: `1px solid ${tokens.border2}`,
              marginBottom: 24,
            }}>
              <Shield size={13} color={tokens.accentBlue} />
              <span style={{ fontSize: 11, fontFamily: "Geist Mono, monospace", color: tokens.textSecondary, letterSpacing: "0.08em" }}>
                Enterprise security platform
              </span>
            </div>

            <h2 id="cta-heading" style={{
              fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800,
              letterSpacing: "-0.04em", color: tokens.textPrimary, lineHeight: 1.1, marginBottom: 18,
            }}>
              Ready to protect<br />your organization?
            </h2>

            <p style={{ fontSize: 17, color: tokens.textSecondary, marginBottom: 36, maxWidth: 460, margin: "0 auto 36px" }}>
              Free tier available. Enterprise plans with SLA and dedicated support. No credit card required.
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              <Link href="/auth/register" className="cta-primary" aria-label="Create free account">
                Create free account
                <ArrowUpRight size={15} />
              </Link>
              <Link href="/contact" className="cta-secondary" aria-label="Talk to our team">
                Talk to sales
              </Link>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, marginTop: 32 }}>
              {[
                { icon: CheckCircle2, text: "No card required", color: tokens.accentGreen },
                { icon: Zap, text: "<200ms response", color: tokens.accentCyan },
                { icon: Lock, text: "AES-256 encrypted", color: tokens.accentPurple },
                { icon: Shield, text: "SOC 2 Type II", color: tokens.accentBlue },
              ].map(item => (
                <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <item.icon size={13} color={item.color} />
                  <span style={{ fontSize: 12.5, fontFamily: "Geist Mono, monospace", color: tokens.textTertiary }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────
function Footer() {
  const cols = [
    { heading: "Platform", links: ["URL Scanner", "File Inspector", "Message Scanner", "API Reference", "Integrations"] },
    { heading: "Company", links: ["About", "Blog", "Careers", "Press", "Contact"] },
    { heading: "Resources", links: ["Documentation", "Status", "Changelog", "Security", "Privacy Policy"] },
  ];

  return (
    <footer
      style={{
        position: "relative", zIndex: 10,
        borderTop: `1px solid ${tokens.border0}`,
        padding: "56px 32px 32px",
      }}
      role="contentinfo"
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(3, 1fr)", gap: 48, marginBottom: 48 }}>
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 16px rgba(59,130,246,0.3)",
              }}>
                <Shield size={16} color="white" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 16, color: tokens.textPrimary, letterSpacing: "-0.02em" }}>TieTiePhish</span>
            </div>
            <p style={{ fontSize: 13.5, color: tokens.textTertiary, lineHeight: 1.65, maxWidth: 260 }}>
              Enterprise-grade phishing and threat detection. Protecting organizations at the speed of attacks.
            </p>
          </div>

          {cols.map(col => (
            <div key={col.heading}>
              <div style={{ fontSize: 12, fontWeight: 600, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                {col.heading}
              </div>
              <nav aria-label={`${col.heading} links`}>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.links.map(link => (
                    <li key={link}>
                      <Link href="#" style={{
                        fontSize: 13.5, color: tokens.textTertiary, textDecoration: "none",
                        transition: "color 0.15s",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.color = tokens.textSecondary)}
                        onMouseLeave={e => (e.currentTarget.style.color = tokens.textTertiary)}
                      >
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          ))}
        </div>

        <div className="h-divider" style={{ marginBottom: 24 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: tokens.textTertiary, fontFamily: "Geist Mono, monospace" }}>
            © 2024 TieTiePhish, Inc. All rights reserved.
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            {["Privacy", "Terms", "Security"].map(item => (
              <Link key={item} href="#" style={{ fontSize: 13, color: tokens.textTertiary, textDecoration: "none" }}>{item}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────
// PAGE ROOT
// ─────────────────────────────────────────────────────────
export default function HomePageClient() {
  return (
    <>
      <GlobalStyles />
      <a href="#main-content" style={{
        position: "absolute", top: -40, left: 0, zIndex: 9999,
        background: tokens.accentBlue, color: "white", padding: "8px 16px",
        textDecoration: "none", borderRadius: "0 0 8px 0",
        transition: "top 0.2s",
      }}
        onFocus={e => (e.currentTarget.style.top = "0")}
        onBlur={e => (e.currentTarget.style.top = "-40px")}
      >
        Skip to main content
      </a>

      <ScrollProgress />
      <AmbientBg />
      <Nav />

      <main id="main-content">
        <HeroSection />
        <TrustedBy />
        <MetricsStrip />
        <FeaturesSection />
        <WorkflowSection />
        <DeveloperSection />
        <TestimonialsSection />
        <PricingSection />
        <FinalCTA />
      </main>

      <Footer />
    </>
  );
}
