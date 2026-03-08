"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Shield, Zap, Lock, Globe, MessageSquare, FileSearch, ChevronRight, Activity, User } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "URL Phishing Detection",
    description: "RandomForest ML model trained on 68,000+ URLs. 23-feature extraction including entropy, TLD risk, subdomain abuse, and brand impersonation detection.",
    color: "var(--neon-cyan)",
    glow: "rgba(0,245,255,0.15)",
    border: "rgba(0,245,255,0.3)",
  },
  {
    icon: MessageSquare,
    title: "SMS Fraud Detection",
    description: "Hybrid rule-based + AI classification catches OTP theft, prize scams, bank fraud. Supports English, Hindi, and Hinglish.",
    color: "var(--neon-green)",
    glow: "rgba(0,255,136,0.15)",
    border: "rgba(0,255,136,0.3)",
  },
  {
    icon: FileSearch,
    title: "File Content Scanner",
    description: "Upload emails, documents, logs. Encrypted storage with AES-256 and background phishing signature scanning.",
    color: "var(--neon-purple)",
    glow: "rgba(191,90,242,0.15)",
    border: "rgba(191,90,242,0.3)",
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    description: "JWT auth, RBAC, AES-256 encryption, bcrypt hashing, per-IP rate limiting, account lockout, and full audit logs.",
    color: "var(--neon-yellow)",
    glow: "rgba(255,214,10,0.15)",
    border: "rgba(255,214,10,0.3)",
  },
];

const stats = [
  { label: "URLs Analyzed",      value: "2.4M+" },
  { label: "Threats Blocked",    value: "187K+" },
  { label: "Detection Accuracy", value: "97.2%" },
  { label: "Avg Response Time",  value: "<200ms" },
];

// ── Fancy "About Creator" animated button ─────────────────────────────────────
function CreatorButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Static fallback during SSR (no framer-motion, avoids hydration mismatch)
  if (!mounted) {
    return (
      <Link
        href="/creator"
        className="font-mono text-sm"
        style={{ color: "#8892b0", textDecoration: "none" }}
      >
        About Creator
      </Link>
    );
  }

  return (
    <Link href="/creator" style={{ textDecoration: "none" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ scale: 1.07, y: -1, boxShadow: "0 0 28px rgba(0,245,255,0.35)" }}
        whileTap={{ scale: 0.96 }}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 18px",
          borderRadius: 10,
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        {/* Spinning conic-gradient border ring */}
        <motion.div
          aria-hidden
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute", inset: -2, borderRadius: 12, zIndex: 0,
            background: "conic-gradient(from 0deg, #00f5ff, #a78bfa, #14b8a6, #38bdf8, #00f5ff)",
          }}
        />
        {/* Dark inner fill */}
        <div style={{
          position: "absolute", inset: 1, borderRadius: 9, zIndex: 1,
          background: "linear-gradient(135deg, #0d1628, #070c18)",
        }} />
        {/* Ambient glow pulse */}
        <motion.div
          aria-hidden
          animate={{ opacity: [0.2, 0.55, 0.2] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: 0, borderRadius: 10, zIndex: 1,
            background: "radial-gradient(ellipse at 50% 50%, rgba(0,245,255,0.1), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        {/* Icon */}
        <User
          size={13}
          style={{ position: "relative", zIndex: 2, flexShrink: 0, color: "#00f5ff" }}
        />
        {/* Gradient text */}
        <span style={{
          position: "relative", zIndex: 2,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600,
          letterSpacing: "0.04em",
          background: "linear-gradient(90deg, #00f5ff 0%, #a78bfa 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 0 6px rgba(0,245,255,0.4))",
        }}>
          About Creator
        </span>
      </motion.div>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen grid-bg relative overflow-hidden">

      {/* Background orbs */}
      <div className="fixed inset-0" style={{ zIndex: 0, pointerEvents: "none" }} aria-hidden="true">
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full" style={{ background: "radial-gradient(circle, #00f5ff, transparent)", filter: "blur(80px)", opacity: 0.08 }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full" style={{ background: "radial-gradient(circle, #bf5af2, transparent)", filter: "blur(80px)", opacity: 0.06 }} />
      </div>

      {/* ── Nav ── */}
      <nav className="relative flex items-center justify-between px-8 py-5 border-b border-cyber-border" style={{ zIndex: 10 }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ background: "rgba(0,245,255,0.1)", borderColor: "rgba(0,245,255,0.3)" }}>
            <Shield className="w-4 h-4" style={{ color: "var(--neon-cyan)" }} />
          </div>
          <span className="font-display font-bold text-lg tracking-tight" style={{ color: "#e8eaf0" }}>
            Phish<span style={{ color: "var(--neon-cyan)" }}>Guard</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <CreatorButton />
          <Link href="/auth/login" className="transition-colors text-sm font-mono hover:text-white" style={{ color: "#8892b0" }}>
            Sign In
          </Link>
          <Link href="/auth/register" className="btn-cyber text-sm">
            Get Started →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative max-w-6xl mx-auto px-8 pt-24 pb-16" style={{ zIndex: 10 }}>
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8" style={{ border: "1px solid rgba(0,245,255,0.2)", background: "rgba(0,245,255,0.05)" }}>
            <Activity className="w-3.5 h-3.5 animate-pulse" style={{ color: "var(--neon-cyan)" }} />
            <span className="text-xs font-mono tracking-wider" style={{ color: "var(--neon-cyan)" }}>LIVE THREAT DETECTION</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6" style={{ color: "#e8eaf0" }}>
            Detect <span className="neon-text-cyan">Phishing</span>.<br />
            Stop <span className="neon-text-red">Fraud</span>.<br />
            Stay <span className="neon-text-green">Safe</span>.
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: "#8892b0" }}>
            Enterprise-grade cybersecurity platform combining machine learning and AI to detect phishing URLs, SMS fraud, and malicious files in real time.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/register" className="btn-cyber text-sm px-8 py-3">
              Start Scanning Free<ChevronRight className="w-4 h-4 ml-2" />
            </Link>
            <Link href="/auth/login" className="inline-flex items-center gap-2 font-mono px-8 py-3 rounded-lg transition-all text-sm" style={{ border: "1px solid #1a2540", color: "#8892b0" }}>
              View Dashboard Demo
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20">
          {stats.map((stat) => (
            <div key={stat.label} className="cyber-card p-5 text-center">
              <div className="font-display text-3xl font-bold neon-text-cyan mb-1">{stat.value}</div>
              <div className="text-xs font-mono tracking-wider uppercase" style={{ color: "#8892b0" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative max-w-6xl mx-auto px-8 py-16" style={{ zIndex: 10 }}>
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl font-bold mb-3" style={{ color: "#e8eaf0" }}>Three Layers of Protection</h2>
          <p className="font-mono text-sm" style={{ color: "#8892b0" }}>Built for security analysts, enterprises, and developers</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f) => (
            <div key={f.title} className="cyber-card p-6 transition-all duration-300" style={{ cursor: "default" }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border" style={{ background: f.glow, borderColor: f.border }}>
                  <f.icon className="w-5 h-5" style={{ color: f.color }} />
                </div>
                <div>
                  <h3 className="font-display font-semibold mb-2" style={{ color: "#e8eaf0" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#8892b0" }}>{f.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative max-w-4xl mx-auto px-8 py-16 text-center" style={{ zIndex: 10 }}>
        <div className="cyber-card p-12">
          <div className="scanner-line" />
          <Zap className="w-10 h-10 mx-auto mb-4" style={{ color: "var(--neon-cyan)" }} />
          <h2 className="font-display text-3xl font-bold mb-4" style={{ color: "#e8eaf0" }}>Ready to protect your organization?</h2>
          <p className="mb-8 font-mono text-sm" style={{ color: "#8892b0" }}>Free tier available. No credit card required. Enterprise plans available.</p>
          <Link href="/auth/register" className="btn-cyber text-base px-10 py-3">Create Free Account</Link>
        </div>
      </section>

      <footer className="relative border-t border-cyber-border px-8 py-6" style={{ zIndex: 10 }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs font-mono" style={{ color: "#8892b0" }}>
          <span>© 2025 PhishGuard. Enterprise Cybersecurity Platform.</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--neon-green)" }} />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}
