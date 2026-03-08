"use client";
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, AlertTriangle, CheckCircle, Shield, Wifi,
  RefreshCw, Eye, XCircle, Clock, ArrowUpRight,
} from "lucide-react";
import { threatApi } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";

type RiskLevel = "safe" | "suspicious" | "dangerous";

interface ThreatEvent {
  id: string;
  domain: string;
  port: number;
  risk_level: RiskLevel;
  reasons: string[];
  confidence: number;
  timestamp: string;
  protocol: string;
  bytes_sent: number;
  bytes_recv: number;
}

interface ThreatStats {
  total: number;
  safe: number;
  suspicious: number;
  dangerous: number;
}

const RISK_CONFIG: Record<RiskLevel, { color: string; bg: string; border: string; icon: React.ElementType; label: string }> = {
  safe:      { color: "#00ff88", bg: "rgba(0,255,136,0.08)",  border: "rgba(0,255,136,0.25)",  icon: CheckCircle,  label: "Safe"      },
  suspicious:{ color: "#ffd60a", bg: "rgba(255,214,10,0.08)",  border: "rgba(255,214,10,0.25)",  icon: AlertTriangle, label: "Suspicious" },
  dangerous: { color: "#ff2d55", bg: "rgba(255,45,85,0.08)",   border: "rgba(255,45,85,0.25)",   icon: XCircle,      label: "Dangerous"  },
};

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ElementType }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="cyber-card p-5"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center border"
          style={{ background: `${color}15`, borderColor: `${color}35` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div className="font-display text-3xl font-bold mb-1" style={{ color }}>
        {value}
      </div>
      <div className="text-xs font-mono uppercase tracking-wider" style={{ color: "#8892b0" }}>
        {label}
      </div>
    </motion.div>
  );
}

function ThreatRow({ event, index }: { event: ThreatEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = RISK_CONFIG[event.risk_level];
  const Icon = cfg.icon;

  const ts = new Date(event.timestamp);
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div
        className="cyber-card mb-2 cursor-pointer transition-all duration-200"
        style={{
          borderColor: expanded ? cfg.border : undefined,
          background: expanded ? cfg.bg : undefined,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-4 flex items-center gap-4">
          {/* Risk indicator */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0"
            style={{ background: cfg.bg, borderColor: cfg.border }}
          >
            <Icon className="w-4 h-4" style={{ color: cfg.color }} />
          </div>

          {/* Domain */}
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-medium truncate" style={{ color: "#e8eaf0" }}>
              {event.domain}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
                {event.protocol}:{event.port}
              </span>
              <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
                ↑{(event.bytes_sent / 1024).toFixed(1)}KB  ↓{(event.bytes_recv / 1024).toFixed(1)}KB
              </span>
            </div>
          </div>

          {/* Confidence */}
          <div className="text-right shrink-0">
            <div
              className="font-mono text-xs px-2 py-0.5 rounded-full border"
              style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}
            >
              {cfg.label}
            </div>
            <div className="font-mono text-xs mt-1" style={{ color: "#8892b0" }}>
              {(event.confidence * 100).toFixed(0)}% conf.
            </div>
          </div>

          {/* Time */}
          <div className="text-right shrink-0 hidden sm:block">
            <div className="flex items-center gap-1" style={{ color: "#8892b0" }}>
              <Clock className="w-3 h-3" />
              <span className="font-mono text-xs">{timeStr}</span>
            </div>
          </div>

          {/* Expand arrow */}
          <ArrowUpRight
            className="w-4 h-4 shrink-0 transition-transform"
            style={{
              color: "#8892b0",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>

        {/* Expanded reasons */}
        <AnimatePresence>
          {expanded && event.reasons.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <div
                className="px-4 pb-4 pt-0 border-t"
                style={{ borderColor: cfg.border }}
              >
                <div className="mt-3 space-y-1.5">
                  {event.reasons.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 font-mono text-xs"
                      style={{ color: cfg.color }}
                    >
                      <span className="mt-0.5 shrink-0">→</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          {expanded && event.reasons.length === 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 pb-3 pt-0 border-t"
              style={{ borderColor: cfg.border, overflow: "hidden" }}
            >
              <p className="font-mono text-xs mt-2" style={{ color: "#8892b0" }}>
                No threat indicators detected for this connection.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function LiveThreatPage() {
  const [filter, setFilter] = useState<RiskLevel | "all">("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["threat-live"],
    queryFn: () => threatApi.live(40).then((r) => r.data),
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const events: ThreatEvent[] = data?.events ?? [];
  const stats: ThreatStats = data?.stats ?? { total: 0, safe: 0, suspicious: 0, dangerous: 0 };

  const filtered = filter === "all" ? events : events.filter((e) => e.risk_level === filter);

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  const handleRefresh = useCallback(() => {
    refetch();
    toast.success("Threat feed refreshed");
  }, [refetch]);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <Wifi className="w-4 h-4" style={{ color: "#00f5ff" }} />
          </motion.div>
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: "#00f5ff" }}>
            Live Threat Detection
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold" style={{ color: "#e8eaf0" }}>
          Network Traffic Monitor
        </h1>
        <p className="text-text-secondary font-mono text-sm mt-1">
          Real-time analysis of outgoing connections, DNS lookups &amp; domain reputation
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Monitored"  value={stats.total}      color="#00f5ff"  icon={Activity}      />
        <StatCard label="Safe"             value={stats.safe}       color="#00ff88"  icon={CheckCircle}   />
        <StatCard label="Suspicious"       value={stats.suspicious} color="#ffd60a"  icon={AlertTriangle} />
        <StatCard label="Dangerous"        value={stats.dangerous}  color="#ff2d55"  icon={XCircle}       />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "safe", "suspicious", "dangerous"] as const).map((f) => {
            const isActive = filter === f;
            const cfg = f === "all" ? null : RISK_CONFIG[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-lg font-mono text-xs transition-all border"
                style={
                  isActive
                    ? {
                        background: cfg ? cfg.bg : "rgba(0,245,255,0.1)",
                        borderColor: cfg ? cfg.border : "rgba(0,245,255,0.3)",
                        color: cfg ? cfg.color : "#00f5ff",
                      }
                    : {
                        background: "transparent",
                        borderColor: "#1a2540",
                        color: "#8892b0",
                      }
                }
              >
                {f === "all" ? "All" : RISK_CONFIG[f].label}
                {f !== "all" && (
                  <span className="ml-1.5 opacity-70">
                    {f === "safe" ? stats.safe : f === "suspicious" ? stats.suspicious : stats.dangerous}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Refresh controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs" style={{ color: "#8892b0" }}>Auto-refresh</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="w-10 h-5 rounded-full transition-all relative border"
              style={{
                background: autoRefresh ? "rgba(0,245,255,0.2)" : "transparent",
                borderColor: autoRefresh ? "rgba(0,245,255,0.4)" : "#1a2540",
              }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                style={{
                  background: autoRefresh ? "#00f5ff" : "#8892b0",
                  left: autoRefresh ? "calc(100% - 18px)" : "2px",
                }}
              />
            </button>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs border transition-all"
            style={{ borderColor: "#1a2540", color: "#8892b0" }}
            disabled={isLoading}
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh
          </button>
          <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
            Updated: {lastUpdate}
          </span>
        </div>
      </div>

      {/* Event list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{ borderColor: "rgba(0,245,255,0.3)", borderTopColor: "#00f5ff" }}
            />
            <span className="font-mono text-sm" style={{ color: "#00f5ff" }}>Scanning network...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cyber-card p-10 text-center">
          <Eye className="w-8 h-8 mx-auto mb-3" style={{ color: "#8892b0" }} />
          <p className="font-mono text-sm" style={{ color: "#8892b0" }}>
            No {filter !== "all" ? filter : ""} events found.
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((event, i) => (
            <ThreatRow key={event.id} event={event} index={i} />
          ))}
        </div>
      )}

      {/* Info note */}
      <div
        className="mt-6 p-4 rounded-lg border font-mono text-xs"
        style={{ borderColor: "rgba(0,245,255,0.15)", background: "rgba(0,245,255,0.04)", color: "#8892b0" }}
      >
        <div className="flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#00f5ff" }} />
          <span>
            Live Threat Detection monitors outgoing network connections and DNS lookups for suspicious
            domains, high-entropy hostnames, known phishing patterns, and suspicious ports.
            Click any row to see detailed threat indicators.
          </span>
        </div>
      </div>
    </div>
  );
}
