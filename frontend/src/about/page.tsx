"use client";

import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  Shield,
  Link2,
  MessageSquare,
  FileSearch,
  Cpu,
  Users,
  Clock,
  Github,
  Linkedin,
  ExternalLink,
  ChevronDown,
  AlertTriangle,
  Lock,
  Database,
  Zap,
} from "lucide-react";

// ─── PARTICLE SYSTEM ────────────────────────────────────────────────────────
function CyberGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
      {/* Radial fade */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,255,255,0.08) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

function FloatingParticles() {
  const particles = Array.from({ length: 22 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 8 + 6,
    delay: Math.random() * 4,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-cyan-400"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: 0.3,
            boxShadow: `0 0 ${p.size * 3}px rgba(0,255,255,0.8)`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.15, 0.5, 0.15],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ─── SCROLL REVEAL WRAPPER ───────────────────────────────────────────────────
function RevealSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ─── SECTION LABEL ───────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px w-8 bg-cyan-500" />
      <span
        className="text-cyan-400 text-xs font-mono tracking-[0.3em] uppercase"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
      >
        {text}
      </span>
      <div className="h-px w-8 bg-cyan-500" />
    </div>
  );
}

// ─── FEATURE CARD ────────────────────────────────────────────────────────────
const features = [
  {
    icon: Link2,
    title: "URL Scanner",
    desc: "Analyzes suspicious links and detects phishing patterns using heuristic and ML-based engines.",
    color: "from-cyan-500/20 to-cyan-400/5",
    glow: "rgba(0,255,255,0.25)",
  },
  {
    icon: MessageSquare,
    title: "Message Scanner",
    desc: "Detects scam messages, fraud patterns, and social engineering attempts in real time.",
    color: "from-sky-500/20 to-sky-400/5",
    glow: "rgba(56,189,248,0.25)",
  },
  {
    icon: FileSearch,
    title: "File Scanner",
    desc: "Upload suspicious files for deep inspection and potential threat extraction.",
    color: "from-teal-500/20 to-teal-400/5",
    glow: "rgba(20,184,166,0.25)",
  },
  {
    icon: Cpu,
    title: "Detection Engine",
    desc: "ML models combined with rule-based logic for accurate, layered threat analysis.",
    color: "from-cyan-500/20 to-cyan-400/5",
    glow: "rgba(0,255,255,0.25)",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    desc: "Distinct dashboards for Users, Analysts, and Admins — each with tailored tooling.",
    color: "from-sky-500/20 to-sky-400/5",
    glow: "rgba(56,189,248,0.25)",
  },
  {
    icon: Clock,
    title: "Scan History",
    desc: "Full audit trail of past scans. Review, compare, and export results anytime.",
    color: "from-teal-500/20 to-teal-400/5",
    glow: "rgba(20,184,166,0.25)",
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const Icon = feature.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{
        y: -6,
        boxShadow: `0 0 32px ${feature.glow}, 0 0 64px ${feature.glow.replace("0.25", "0.1")}`,
      }}
      className="relative rounded-xl border border-cyan-900/50 bg-gray-950/80 p-6 cursor-default overflow-hidden group"
      style={{ backdropFilter: "blur(12px)" }}
    >
      {/* Gradient bg */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
      />
      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
        <div
          className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-cyan-500/60 to-transparent"
          style={{ transform: "translateX(0)" }}
        />
        <div
          className="absolute top-0 right-0 h-px w-full bg-gradient-to-l from-cyan-500/60 to-transparent"
        />
      </div>

      <div className="relative z-10">
        <div className="mb-4 inline-flex items-center justify-center w-11 h-11 rounded-lg border border-cyan-800/60 bg-cyan-950/60">
          <Icon className="w-5 h-5 text-cyan-400" />
        </div>
        <h3
          className="text-white font-semibold text-base mb-2"
          style={{ fontFamily: "'Syne', 'Space Grotesk', sans-serif" }}
        >
          {feature.title}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
      </div>
    </motion.div>
  );
}

// ─── TECH BADGE ──────────────────────────────────────────────────────────────
const techStack = [
  { name: "FastAPI", icon: Zap, color: "from-emerald-500 to-teal-500" },
  { name: "Next.js", icon: ExternalLink, color: "from-gray-300 to-white" },
  { name: "TailwindCSS", icon: ExternalLink, color: "from-cyan-400 to-sky-500" },
  { name: "PostgreSQL", icon: Database, color: "from-blue-400 to-indigo-500" },
  { name: "JWT Auth", icon: Lock, color: "from-amber-400 to-orange-500" },
  { name: "ML Models", icon: Cpu, color: "from-violet-400 to-purple-500" },
];

function TechBadge({
  tech,
  index,
}: {
  tech: (typeof techStack)[0];
  index: number;
}) {
  const Icon = tech.icon;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      whileHover={{ scale: 1.08 }}
      animate={{
        y: [0, -4, 0],
      }}
      className="relative flex items-center gap-2 px-4 py-2.5 rounded-full border border-cyan-900/50 bg-gray-950/70 cursor-default"
      style={{
        animationDelay: `${index * 0.3}s`,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className={`w-2 h-2 rounded-full bg-gradient-to-br ${tech.color}`}
        style={{ boxShadow: "0 0 6px currentColor" }}
      />
      <span
        className="text-gray-200 text-sm font-medium"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {tech.name}
      </span>
    </motion.div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
export default function AboutPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <main
      className="min-h-screen bg-gray-950 text-white overflow-x-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden"
      >
        <CyberGrid />
        <FloatingParticles />

        {/* Glow orb */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse, rgba(0,255,255,0.07) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 text-center max-w-3xl mx-auto"
        >
          {/* Shield icon */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
            className="inline-flex items-center justify-center mb-8"
          >
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "rgba(0,255,255,0.15)",
                  filter: "blur(16px)",
                  transform: "scale(1.4)",
                }}
              />
              <div className="relative w-20 h-20 rounded-2xl border border-cyan-500/40 bg-cyan-950/60 flex items-center justify-center">
                <Shield className="w-10 h-10 text-cyan-400" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-3"
          >
            <SectionLabel text="Cybersecurity Platform" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl md:text-7xl font-black mb-6 tracking-tight"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            About{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage: "linear-gradient(135deg, #00ffff 0%, #0ea5e9 50%, #06b6d4 100%)",
                filter: "drop-shadow(0 0 20px rgba(0,255,255,0.4))",
              }}
            >
              PhishGuard
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.7 }}
            className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto"
          >
            PhishGuard is an advanced phishing detection platform that analyzes{" "}
            <span className="text-cyan-300">URLs</span>,{" "}
            <span className="text-cyan-300">messages</span>, and{" "}
            <span className="text-cyan-300">files</span> to detect malicious threats
            using machine learning and rule-based analysis.
          </motion.p>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-gray-600"
          >
            <span className="text-xs font-mono tracking-widest uppercase">Scroll</span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-4 md:px-8 lg:px-16">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,255,255,0.03) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto">
          <RevealSection className="text-center mb-16">
            <SectionLabel text="Core Capabilities" />
            <h2
              className="text-3xl md:text-5xl font-black text-white mb-4"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Platform Features
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Every component of PhishGuard is engineered to detect, analyze, and
              neutralize phishing threats across multiple vectors.
            </p>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <FeatureCard key={f.title} feature={f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CREATOR ───────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-4">
        <div className="relative z-10 max-w-4xl mx-auto">
          <RevealSection className="text-center mb-16">
            <SectionLabel text="The Builder" />
            <h2
              className="text-3xl md:text-5xl font-black text-white"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              About the Creator
            </h2>
          </RevealSection>

          <RevealSection>
            <motion.div
              className="relative rounded-2xl p-px overflow-hidden"
              whileHover={{ scale: 1.005 }}
              transition={{ duration: 0.3 }}
            >
              {/* Animated gradient border */}
              <motion.div
                className="absolute inset-0 rounded-2xl"
                animate={{
                  background: [
                    "linear-gradient(0deg, #00ffff, #0ea5e9, #06b6d4, #00ffff)",
                    "linear-gradient(180deg, #00ffff, #0ea5e9, #06b6d4, #00ffff)",
                    "linear-gradient(360deg, #00ffff, #0ea5e9, #06b6d4, #00ffff)",
                  ],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                style={{ opacity: 0.5 }}
              />

              <div
                className="relative rounded-2xl bg-gray-950/95 p-8 md:p-12"
                style={{ backdropFilter: "blur(16px)" }}
              >
                <div className="flex flex-col md:flex-row items-start gap-8">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "rgba(0,255,255,0.2)",
                          filter: "blur(20px)",
                          transform: "scale(1.2)",
                        }}
                      />
                      <div className="relative w-24 h-24 rounded-full border-2 border-cyan-500/60 bg-gradient-to-br from-cyan-950 to-gray-900 flex items-center justify-center text-3xl font-black text-cyan-400"
                        style={{ fontFamily: "'Syne', sans-serif" }}>
                        AM
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <h3
                        className="text-2xl md:text-3xl font-black text-white"
                        style={{ fontFamily: "'Syne', sans-serif" }}
                      >
                        Arpit Mehrotra
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono border border-cyan-800/60 text-cyan-400 bg-cyan-950/40">
                        B.Tech CSE · UPES
                      </span>
                    </div>
                    <p className="text-cyan-500 text-sm font-mono mb-5">
                      Cybersecurity Enthusiast · Ethical Hacking
                    </p>

                    <div className="space-y-3 text-gray-400 text-sm leading-relaxed mb-7">
                      <p>
                        Arpit Mehrotra is a B.Tech Computer Science student at{" "}
                        <span className="text-gray-200">UPES</span>, currently in
                        Semester 2, with a strong passion for cybersecurity and ethical
                        hacking.
                      </p>
                      <p>
                        He built PhishGuard as a practical cybersecurity platform to
                        explore{" "}
                        <span className="text-cyan-300">phishing detection</span>,{" "}
                        <span className="text-cyan-300">
                          secure authentication systems
                        </span>
                        , and{" "}
                        <span className="text-cyan-300">
                          machine learning-based threat analysis
                        </span>
                        .
                      </p>
                      <p>
                        His goal is to pursue a future career in cybersecurity, focusing
                        on <span className="text-gray-200">threat intelligence</span>,{" "}
                        <span className="text-gray-200">malware analysis</span>, and{" "}
                        <span className="text-gray-200">security engineering</span>.
                      </p>
                    </div>

                    {/* Social links */}
                    <div className="flex gap-3">
                      {[
                        { icon: Github, label: "GitHub" },
                        { icon: Linkedin, label: "LinkedIn" },
                      ].map(({ icon: Icon, label }) => (
                        <motion.button
                          key={label}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.97 }}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-900/60 bg-cyan-950/30 text-gray-300 text-sm hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </RevealSection>
        </div>
      </section>

      {/* ── TECH STACK ────────────────────────────────────────────────────── */}
      <section className="relative py-24 px-4">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(0,255,255,0.04) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <RevealSection>
            <SectionLabel text="Built With" />
            <h2
              className="text-3xl md:text-5xl font-black text-white mb-12"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Technology Stack
            </h2>
          </RevealSection>

          <div className="flex flex-wrap justify-center gap-3">
            {techStack.map((tech, i) => (
              <TechBadge key={tech.name} tech={tech} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── TERMS ─────────────────────────────────────────────────────────── */}
      <section className="relative py-24 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <RevealSection>
            <div className="rounded-2xl border border-cyan-900/40 bg-gray-950/70 p-8 md:p-10" style={{ backdropFilter: "blur(12px)" }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-lg border border-cyan-800/60 bg-cyan-950/60 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-xs font-mono text-cyan-500 uppercase tracking-widest">Legal</p>
                  <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
                    Terms of Service
                  </h2>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  {
                    title: "Educational & Security Use Only",
                    desc: "PhishGuard is intended for educational and security analysis purposes. Any misuse of the platform is strictly prohibited.",
                  },
                  {
                    title: "No Misuse",
                    desc: "Users must not leverage PhishGuard to facilitate illegal activity, harass others, or circumvent security systems.",
                  },
                  {
                    title: "Legal Content",
                    desc: "All uploaded content must comply with applicable legal standards. You are solely responsible for the material you submit.",
                  },
                  {
                    title: "Activity Logging",
                    desc: "Platform activity may be logged for security, audit, and quality assurance purposes.",
                  },
                ].map(({ title, desc }, i) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    className="flex gap-4 py-4 border-b border-gray-800/60 last:border-0"
                  >
                    <div className="w-1 rounded-full bg-gradient-to-b from-cyan-500 to-cyan-900 flex-shrink-0 self-stretch" />
                    <div>
                      <p className="text-gray-100 font-medium text-sm mb-1">{title}</p>
                      <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── DISCLAIMER ────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20">
        <div className="max-w-3xl mx-auto">
          <RevealSection>
            <motion.div
              className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-6 md:p-8"
              whileHover={{ borderColor: "rgba(245,158,11,0.3)" }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg border border-amber-700/50 bg-amber-950/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3
                    className="text-amber-300 font-bold text-lg mb-2"
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  >
                    Disclaimer
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    PhishGuard is a{" "}
                    <span className="text-amber-300">
                      cybersecurity research and analysis tool
                    </span>
                    . Detection results are informational and should not be considered
                    guaranteed security advice. Always verify suspicious content through
                    multiple sources and consult a qualified security professional when
                    necessary.
                  </p>
                </div>
              </div>
            </motion.div>
          </RevealSection>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="relative border-t border-gray-900 py-12 px-4">
        <CyberGrid />
        <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-cyan-800/60 bg-cyan-950/60 flex items-center justify-center">
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <span
              className="text-white font-bold text-lg"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              PhishGuard
            </span>
          </div>

          <div className="text-center">
            <p className="text-gray-600 text-sm">
              Created by{" "}
              <span className="text-cyan-500 font-medium">Arpit Mehrotra</span>
            </p>
            <p className="text-gray-700 text-xs mt-0.5 font-mono">
              © 2026 PhishGuard · All rights reserved.
            </p>
          </div>

          <div className="flex gap-2">
            {[Github, Linkedin].map((Icon, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.1, color: "#00ffff" }}
                className="w-9 h-9 rounded-lg border border-gray-800 bg-gray-900/50 flex items-center justify-center text-gray-500 hover:border-cyan-800/60 transition-colors"
              >
                <Icon className="w-4 h-4" />
              </motion.button>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
