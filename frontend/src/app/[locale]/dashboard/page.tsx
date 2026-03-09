"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion, useInView, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import {
  Shield, Globe, MessageSquare, FileSearch, TrendingUp,
  AlertTriangle, CheckCircle, Activity, Clock, ArrowRight,
  Eye, Zap, Wifi, Network, Server, AlertCircle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import { userApi, threatApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useTranslations } from "next-intl";

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedCounter({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionVal = useMotionValue(0);
  const springVal = useSpring(motionVal, { duration: duration * 1000, bounce: 0 });
  const isInView = useInView(ref, { once: true });
  useEffect(() => { if (isInView) motionVal.set(value); }, [isInView, value, motionVal]);
  useEffect(() => springVal.on("change", (v) => {
    if (ref.current) ref.current.textContent = Math.round(v).toLocaleString();
  }), [springVal]);
  return <span ref={ref}>0</span>;
}

// ── Typing animation ──────────────────────────────────────────────────────────
function TypingText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setStarted(true), delay * 1000); return () => clearTimeout(t); }, [delay]);
  useEffect(() => {
    if (!started) return;
    let i = 0;
    const iv = setInterval(() => { setDisplayed(text.slice(0, ++i)); if (i >= text.length) clearInterval(iv); }, 35);
    return () => clearInterval(iv);
  }, [started, text]);
  return (
    <span>
      {displayed}
      {displayed.length < text.length && started && (
        <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} style={{ color: "#00f5ff" }}>▊</motion.span>
      )}
    </span>
  );
}

// ── System risk level widget ──────────────────────────────────────────────────
function SystemRiskBadge({ risk }: { risk: { level: string; label: string; color: string; description: string; score: number } }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="cyber-card p-5 flex items-center gap-5"
    >
      <div className="relative shrink-0">
        <svg width="70" height="70" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="35" cy="35" r="28" fill="none" stroke="#1a2540" strokeWidth="6" />
          <motion.circle
            cx="35" cy="35" r="28" fill="none"
            stroke={risk.color} strokeWidth="6"
            strokeDasharray={2 * Math.PI * 28}
            strokeDashoffset={2 * Math.PI * 28 * (1 - risk.score / 100)}
            strokeLinecap="round"
            initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - risk.score / 100) }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-xs font-bold" style={{ color: risk.color }}>{risk.score}</span>
        </div>
      </div>
      <div>
        <div className="font-mono text-xs uppercase tracking-wider mb-1" style={{ color: "#8892b0" }}>System Risk Level</div>
        <div className="font-display text-xl font-bold mb-1" style={{ color: risk.color }}>
          {risk.label}
        </div>
        <div className="font-mono text-xs leading-relaxed" style={{ color: "#8892b0" }}>
          {risk.description}
        </div>
      </div>
    </motion.div>
  );
}

// ── Top threat domains widget ─────────────────────────────────────────────────
function TopThreatsWidget({ domains }: { domains: Array<{ domain: string; hits: number; risk_level: string; risk_score: number }> }) {
  if (!domains.length) return null;
  return (
    <div className="cyber-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4" style={{ color: "#ff2d55" }} />
        <h2 className="font-display font-semibold text-sm" style={{ color: "#e8eaf0" }}>Top Threat Domains</h2>
      </div>
      <div className="space-y-2">
        {domains.map((d, i) => {
          const color = d.risk_level === "dangerous" ? "#ff2d55" : "#ffd60a";
          return (
            <motion.div key={d.domain} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 p-2.5 rounded-lg"
              style={{ background: `${color}06`, border: `1px solid ${color}20` }}>
              <div className="font-mono text-xs w-5 text-center shrink-0" style={{ color: "#8892b0" }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs truncate" style={{ color: "#e8eaf0" }}>{d.domain}</div>
                <div className="font-mono text-xs" style={{ color: "#8892b0" }}>{d.hits} hits · score {d.risk_score}</div>
              </div>
              <span className="font-mono text-xs font-bold shrink-0" style={{ color }}>
                {d.risk_level.toUpperCase()}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sublabel, delay = 0 }: {
  icon: React.ElementType; label: string; value: number | string;
  color: string; sublabel?: string; delay?: number;
}) {
  const c = ({ cyan: "#00f5ff", green: "#00ff88", red: "#ff2d55", yellow: "#ffd60a", purple: "#bf5af2" } as any)[color] ?? "#00f5ff";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className="cyber-card p-5 cursor-default"
    >
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ delay: delay + 0.15, type: "spring", stiffness: 300 }}
        className="w-9 h-9 rounded-lg flex items-center justify-center border mb-4"
        style={{ background: `${c}12`, borderColor: `${c}28` }}>
        <Icon className="w-4 h-4" style={{ color: c }} />
      </motion.div>
      <div className="font-display text-3xl font-bold mb-1" style={{ color: c }}>
        {typeof value === "number" ? <AnimatedCounter value={value} /> : value}
      </div>
      <div className="text-xs font-mono uppercase tracking-wider" style={{ color: "#8892b0" }}>{label}</div>
      {sublabel && <div className="text-xs mt-1 font-mono" style={{ color: "#8892b0", opacity: 0.6 }}>{sublabel}</div>}
    </motion.div>
  );
}

// ── SOC Quick links ───────────────────────────────────────────────────────────
function SOCCard({ icon: Icon, label, value, color, href, delay, badge }: {
  icon: React.ElementType; label: string; value: number;
  color: string; href: string; delay: number; badge?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay, duration: 0.4 }} whileHover={{ scale: 1.02 }}>
      <Link href={href} className="cyber-card p-5 flex items-center gap-4 transition-all group block" style={{ textDecoration: "none" }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center border shrink-0" style={{ background: `${color}12`, borderColor: `${color}30` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1">
          <div className="font-display text-2xl font-bold" style={{ color }}><AnimatedCounter value={value} /></div>
          <div className="text-xs font-mono" style={{ color: "#8892b0" }}>{label}</div>
        </div>
        {badge && (
          <span className="font-mono text-xs px-2 py-0.5 rounded border shrink-0"
            style={{ background: `${color}10`, borderColor: `${color}30`, color }}>
            {badge}
          </span>
        )}
        <motion.div initial={{ x: 0 }} whileHover={{ x: 4 }} style={{ color: "#8892b0" }}>
          <ArrowRight className="w-4 h-4" />
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ── Label badge ───────────────────────────────────────────────────────────────
function LabelBadge({ label }: { label: string }) {
  const cfg: Record<string, { color: string; bg: string; border: string }> = {
    PHISHING:   { color: "#ff2d55", bg: "rgba(255,45,85,0.08)",   border: "rgba(255,45,85,0.25)"   },
    FRAUD:      { color: "#ff2d55", bg: "rgba(255,45,85,0.08)",   border: "rgba(255,45,85,0.25)"   },
    SUSPICIOUS: { color: "#ffd60a", bg: "rgba(255,214,10,0.08)",  border: "rgba(255,214,10,0.25)"  },
    SAFE:       { color: "#00ff88", bg: "rgba(0,255,136,0.08)",   border: "rgba(0,255,136,0.25)"   },
  };
  const c = cfg[label] ?? { color: "#8892b0", bg: "transparent", border: "#1a2540" };
  return <span className="text-xs font-mono px-1.5 py-0.5 rounded border" style={{ ...c }}>{label}</span>;
}

function ScanTypeIcon({ type }: { type: string }) {
  if (type === "url")     return <Globe className="w-3.5 h-3.5" style={{ color: "#00f5ff" }} />;
  if (type === "message") return <MessageSquare className="w-3.5 h-3.5" style={{ color: "#00ff88" }} />;
  if (type === "file")    return <FileSearch className="w-3.5 h-3.5" style={{ color: "#bf5af2" }} />;
  return <Activity className="w-3.5 h-3.5" style={{ color: "#8892b0" }} />;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const mockTrend = [
  { date: "Mon", scans: 12, threats: 3 },
  { date: "Tue", scans: 19, threats: 5 },
  { date: "Wed", scans: 8,  threats: 1 },
  { date: "Thu", scans: 27, threats: 8 },
  { date: "Fri", scans: 34, threats: 12 },
  { date: "Sat", scans: 15, threats: 2 },
  { date: "Sun", scans: 22, threats: 7 },
];

// ── Main SOC Dashboard ────────────────────────────────────────────────────────
export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuthStore();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => userApi.stats().then((r) => r.data),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["user-history-recent"],
    queryFn: () => userApi.history(1, 8).then((r) => r.data),
  });

  const { data: systemRiskData } = useQuery({
    queryKey: ["system-risk"],
    queryFn: () => threatApi.systemRisk().then((r) => r.data),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: topDomainsData } = useQuery({
    queryKey: ["top-threat-domains"],
    queryFn: () => threatApi.topDomains(5).then((r) => r.data),
    staleTime: 60000,
  });

  const recentScans = historyData?.items ?? [];
  const recentThreats = recentScans.filter((s: any) =>
    s.label === "PHISHING" || s.label === "FRAUD" || s.label === "SUSPICIOUS"
  );

  const pieData = stats
    ? [
        { name: "Safe",       value: stats.safe ?? 0,             color: "#00ff88" },
        { name: "Threats",    value: stats.threats_detected ?? 0, color: "#ff2d55" },
        { name: "Suspicious", value: stats.suspicious ?? 0,       color: "#ffd60a" },
      ]
    : [];

  const systemRisk = systemRiskData?.system_risk;
  const topDomains = topDomainsData?.domains ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-7xl">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center gap-2 mb-2">
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 2.5 }}>
            <Activity className="w-4 h-4" style={{ color: "#00f5ff" }} />
          </motion.div>
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: "#00f5ff" }}>SOC Dashboard</span>
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
            className="w-1.5 h-1.5 rounded-full ml-1" style={{ background: "#00ff88" }}
          />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}
          className="font-display text-2xl lg:text-3xl font-bold" style={{ color: "#e8eaf0" }}
        >
          {t("welcome")},{" "}
          <span style={{ color: "#00f5ff" }}><TypingText text={user?.username ?? "Analyst"} delay={0.3} /></span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="font-mono text-sm mt-1" style={{ color: "#8892b0" }}
        >
          Security Operations Center · Real-time threat monitoring &amp; incident response
        </motion.p>
      </div>

      {/* ── Threat banner ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {!statsLoading && (stats?.threats_detected ?? 0) > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-xl border flex items-center gap-3"
            style={{ borderColor: "rgba(255,45,85,0.25)", background: "rgba(255,45,85,0.06)" }}
          >
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
              <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#ff2d55" }} />
            </motion.div>
            <span className="font-mono text-xs" style={{ color: "#ff2d55" }}>
              {stats?.threats_detected} threat{stats?.threats_detected !== 1 ? "s" : ""} detected
              ({stats?.threat_rate}% threat rate)
            </span>
            <Link href="/dashboard/history" className="ml-auto shrink-0">
              <motion.span className="font-mono text-xs underline" style={{ color: "#ff2d55" }} whileHover={{ opacity: 0.7 }}>
                View History →
              </motion.span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── System risk + top threats row ─────────────────────────────── */}
      {(systemRisk || topDomains.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-4 mb-8">
          {systemRisk && <SystemRiskBadge risk={systemRisk} />}
          {topDomains.length > 0 && <TopThreatsWidget domains={topDomains} />}
        </div>
      )}

      {/* ── Stats grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Shield}        label={t("totalScans")}      value={statsLoading ? 0 : (stats?.total_scans ?? 0)}      color="cyan"   delay={0}    />
        <StatCard icon={AlertTriangle} label={t("threatsDetected")} value={statsLoading ? 0 : (stats?.threats_detected ?? 0)} color="red"    delay={0.07} sublabel={`${stats?.threat_rate ?? 0}% rate`} />
        <StatCard icon={CheckCircle}   label={t("safeItems")}     value={statsLoading ? 0 : (stats?.safe ?? 0)}             color="green"  delay={0.14} />
        <StatCard icon={TrendingUp}    label="Suspicious"       value={statsLoading ? 0 : (stats?.suspicious ?? 0)}       color="yellow" delay={0.21} />
      </div>

      {/* ── Charts row ───────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="cyber-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold text-sm" style={{ color: "#e8eaf0" }}>Scan Activity (7 days)</h2>
              <p className="text-xs font-mono mt-0.5" style={{ color: "#8892b0" }}>Scans vs threats detected</p>
            </div>
            <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 3 }} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00f5ff" }} />
              <span className="font-mono text-xs" style={{ color: "#8892b0" }}>Live</span>
            </motion.div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={mockTrend}>
              <defs>
                <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00f5ff" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00f5ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ff2d55" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ff2d55" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#8892b0" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#8892b0" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={{ background: "#0c1120", border: "1px solid #1a2540", borderRadius: "8px", fontFamily: "JetBrains Mono", fontSize: "12px", color: "#e8eaf0" }} labelStyle={{ color: "#e8eaf0" }} />
              <Area type="monotone" dataKey="scans"   stroke="#00f5ff" fill="url(#scanGrad)"   strokeWidth={2} name="Scans"   />
              <Area type="monotone" dataKey="threats" stroke="#ff2d55" fill="url(#threatGrad)" strokeWidth={2} name="Threats" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }} className="cyber-card p-5">
          <div className="mb-4">
            <h2 className="font-display font-semibold text-sm" style={{ color: "#e8eaf0" }}>Breakdown</h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: "#8892b0" }}>Results distribution</p>
          </div>
          {pieData.some((d) => d.value > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={pieData} innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.85} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {pieData.map((d) => (
                  <motion.div key={d.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      <span style={{ color: "#8892b0" }}>{d.name}</span>
                    </div>
                    <span style={{ color: d.color }}>{d.value}</span>
                  </motion.div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-44 gap-2">
              <Eye className="w-6 h-6" style={{ color: "#8892b0" }} />
              <span className="text-xs font-mono" style={{ color: "#8892b0" }}>No scan data yet</span>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── SOC quick actions grid ────────────────────────────────────── */}
      <div className="mb-4">
        <h2 className="font-display font-semibold text-sm mb-3" style={{ color: "#8892b0" }}>SCANNERS</h2>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <SOCCard icon={Globe}         label="URL Scans"     value={stats?.url_scans     ?? 0} color="#00f5ff" href="/dashboard/url"     delay={0.35} />
        <SOCCard icon={MessageSquare} label="Message Scans" value={stats?.message_scans ?? 0} color="#00ff88" href="/dashboard/message" delay={0.42} />
        <SOCCard icon={FileSearch}    label="File Scans"    value={stats?.file_scans    ?? 0} color="#bf5af2" href="/dashboard/file"    delay={0.49} />
      </div>

      <div className="mb-4">
        <h2 className="font-display font-semibold text-sm mb-3" style={{ color: "#8892b0" }}>MONITORING</h2>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <SOCCard icon={Wifi}    label="Live Threat Detection" value={0} color="#ff2d55"  href="/dashboard/threat"    delay={0.56} badge="LIVE" />
        <SOCCard icon={Shield}  label="Security Incidents"    value={0} color="#ffd60a"  href="/dashboard/incidents" delay={0.63} />
        <SOCCard icon={Network} label="Network Scanner"       value={0} color="#00f5ff"  href="/dashboard/network"   delay={0.70} />
      </div>

      {/* ── Recent activity ────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent scans */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="cyber-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-sm" style={{ color: "#e8eaf0" }}>Recent Scans</h2>
              <p className="text-xs font-mono mt-0.5" style={{ color: "#8892b0" }}>Your last 8 submissions</p>
            </div>
            <Link href="/dashboard/history" className="font-mono text-xs hover:opacity-70 transition-opacity" style={{ color: "#00f5ff" }}>
              View all →
            </Link>
          </div>

          {historyLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: "#050810" }}>
                  <div className="w-5 h-5 rounded bg-cyber-border animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 bg-cyber-border rounded animate-pulse" style={{ width: "65%" }} />
                    <div className="h-2 bg-cyber-border rounded animate-pulse" style={{ width: "40%" }} />
                  </div>
                  <div className="w-14 h-5 bg-cyber-border rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : recentScans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Zap className="w-6 h-6" style={{ color: "#8892b0" }} />
              <p className="font-mono text-xs" style={{ color: "#8892b0" }}>No scans yet — run your first scan</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentScans.map((scan: any, i: number) => (
                <motion.div
                  key={scan.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55 + i * 0.04 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg transition-colors hover:bg-white/[0.02]"
                >
                  <ScanTypeIcon type={scan.scan_type} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate" style={{ color: "#e8eaf0" }}>{scan.input_data}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-2.5 h-2.5" style={{ color: "#8892b0" }} />
                      <span className="font-mono text-xs" style={{ color: "#8892b0" }}>{timeAgo(scan.created_at)}</span>
                    </div>
                  </div>
                  <LabelBadge label={scan.label} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent threats */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="cyber-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-sm" style={{ color: "#e8eaf0" }}>Recent Threats</h2>
              <p className="text-xs font-mono mt-0.5" style={{ color: "#8892b0" }}>Phishing, fraud &amp; suspicious detections</p>
            </div>
            <Link href="/dashboard/history" className="font-mono text-xs hover:opacity-70 transition-opacity" style={{ color: "#ff2d55" }}>
              View all →
            </Link>
          </div>

          {historyLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border" style={{ borderColor: "rgba(255,45,85,0.15)", background: "rgba(255,45,85,0.04)" }}>
                  <div className="h-2.5 bg-cyber-border rounded animate-pulse mb-2" style={{ width: "70%" }} />
                  <div className="h-2 bg-cyber-border rounded animate-pulse" style={{ width: "45%" }} />
                </div>
              ))}
            </div>
          ) : recentThreats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CheckCircle className="w-6 h-6" style={{ color: "#00ff88" }} />
              <p className="font-mono text-xs" style={{ color: "#8892b0" }}>No threats detected — you're all clear</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentThreats.slice(0, 6).map((scan: any, i: number) => {
                const isPhishing = scan.label === "PHISHING" || scan.label === "FRAUD";
                const color = isPhishing ? "#ff2d55" : "#ffd60a";
                const bg    = isPhishing ? "rgba(255,45,85,0.06)" : "rgba(255,214,10,0.06)";
                const border = isPhishing ? "rgba(255,45,85,0.2)" : "rgba(255,214,10,0.2)";
                return (
                  <motion.div
                    key={scan.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.05 }}
                    className="p-3 rounded-lg border"
                    style={{ borderColor: border, background: bg }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" style={{ color }} />
                        <span className="font-mono text-xs truncate" style={{ color: "#e8eaf0" }}>{scan.input_data}</span>
                      </div>
                      <LabelBadge label={scan.label} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="font-mono text-xs" style={{ color }}>
                        {(scan.confidence * 100).toFixed(0)}% confidence
                      </span>
                      <span className="font-mono text-xs" style={{ color: "#8892b0" }}>{timeAgo(scan.created_at)}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
