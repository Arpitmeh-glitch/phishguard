"use client";
import Link from "next/link";
import { Shield, Zap, Lock, Globe, MessageSquare, FileSearch, ChevronRight, Activity } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: Globe,
    title: "URL Phishing Detection",
    description: "RandomForest ML model trained on millions of URLs. Detects phishing with 95%+ accuracy.",
    color: "var(--neon-cyan)",
    glow: "rgba(0,245,255,0.15)",
    border: "rgba(0,245,255,0.3)",
  },
  {
    icon: MessageSquare,
    title: "SMS Fraud Detection",
    description: "Hybrid rule-based + AI classification catches OTP theft, prize scams, bank fraud.",
    color: "var(--neon-green)",
    glow: "rgba(0,255,136,0.15)",
    border: "rgba(0,255,136,0.3)",
  },
  {
    icon: FileSearch,
    title: "File Content Scanner",
    description: "Upload emails, documents, logs. Encrypted storage with AES-256 and background scanning.",
    color: "var(--neon-purple)",
    glow: "rgba(191,90,242,0.15)",
    border: "rgba(191,90,242,0.3)",
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    description: "JWT auth, RBAC, AES-256 encryption, bcrypt hashing, rate limiting, audit logs.",
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

export default function LandingPage() {
  return (
    <div className="min-h-screen grid-bg relative overflow-hidden">

      {/* FIXED: Background orbs — pointer-events:none + opacity corrected.
          opacity-8 was not a valid Tailwind class (opaque orbs sat over text).
          Using inline style opacity instead of the invalid utility class. */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div
          className="absolute top-0 left-0 w-96 h-96 rounded-full"
          style={{
            background: "radial-gradient(circle, #00f5ff, transparent)",
            filter: "blur(80px)",
            opacity: 0.08,
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-96 h-96 rounded-full"
          style={{
            background: "radial-gradient(circle, #bf5af2, transparent)",
            filter: "blur(80px)",
            opacity: 0.06,
          }}
        />
      </div>

      {/* All content sections use relative + z-10 to sit above background */}

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-cyber-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-neon-cyan" />
          </div>
          <span className="font-display font-bold text-lg text-text-primary tracking-tight">
            Phish<span className="text-neon-cyan">Guard</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* FIXED: Using Next.js <Link> for all navigation — previously these
              were <a> tags or misconfigured which caused no navigation. */}
          <Link
            href="/auth/login"
            className="text-text-secondary hover:text-text-primary transition-colors text-sm font-mono"
          >
            Sign In
          </Link>
          <Link href="/auth/register" className="btn-cyber text-sm">
            Get Started →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neon-cyan/20 bg-neon-cyan/5 mb-8">
            <Activity className="w-3.5 h-3.5 text-neon-cyan animate-pulse" />
            <span className="text-xs font-mono text-neon-cyan tracking-wider">LIVE THREAT DETECTION</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-bold text-text-primary leading-tight mb-6">
            Detect <span className="neon-text-cyan">Phishing</span>.<br />
            Stop <span className="neon-text-red">Fraud</span>.<br />
            Stay <span className="neon-text-green">Safe</span>.
          </h1>

          <p className="text-text-secondary text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Enterprise-grade cybersecurity platform combining machine learning and AI to detect
            phishing URLs, SMS fraud, and malicious files in real time.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/register"
              className="btn-cyber text-sm px-8 py-3.5 inline-flex items-center gap-2"
            >
              Start Scanning Free
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 border border-cyber-border text-text-secondary font-mono px-8 py-3.5 rounded-lg hover:border-text-secondary hover:text-text-primary transition-all text-sm"
            >
              View Dashboard Demo
            </Link>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="cyber-card p-5 text-center">
              <div className="font-display text-3xl font-bold neon-text-cyan mb-1">{stat.value}</div>
              <div className="text-text-secondary text-xs font-mono tracking-wider uppercase">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Features — FIXED: "Three Layers of Protection" heading was dim because
          the section lacked z-10 relative positioning in the original. All
          sections now explicitly carry relative z-10. Feature card icons use
          inline style with direct CSS var references (not var(--neon-{color})
          string interpolation which was breaking for purple/yellow). */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 py-16">
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl font-bold text-text-primary mb-3">
            Three Layers of Protection
          </h2>
          <p className="text-text-secondary font-mono text-sm">
            Built for security analysts, enterprises, and developers
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="cyber-card p-6 group hover:border-neon-cyan/30 transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
                  style={{ background: f.glow, borderColor: f.border }}
                >
                  <f.icon className="w-5 h-5" style={{ color: f.color }} />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-text-primary mb-2">{f.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-8 py-16 text-center">
        <div className="cyber-card p-12">
          <div className="scanner-line" />
          <Zap className="w-10 h-10 text-neon-cyan mx-auto mb-4" />
          <h2 className="font-display text-3xl font-bold text-text-primary mb-4">
            Ready to protect your organization?
          </h2>
          <p className="text-text-secondary mb-8 font-mono text-sm">
            Free tier available. No credit card required. Enterprise plans available.
          </p>
          <Link href="/auth/register" className="btn-cyber text-base px-10 py-3.5">
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-cyber-border px-8 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-text-secondary text-xs font-mono">
          <span>© 2024 PhishGuard. Enterprise Cybersecurity Platform.</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}
