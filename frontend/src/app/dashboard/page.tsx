"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Shield, Globe, MessageSquare, FileSearch, TrendingUp, AlertTriangle, CheckCircle, Activity } from "lucide-react";
import { userApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const mockTrend = [
  { date: "Mon", scans: 12, threats: 3 },
  { date: "Tue", scans: 19, threats: 5 },
  { date: "Wed", scans: 8, threats: 1 },
  { date: "Thu", scans: 27, threats: 8 },
  { date: "Fri", scans: 34, threats: 12 },
  { date: "Sat", scans: 15, threats: 2 },
  { date: "Sun", scans: 22, threats: 7 },
];

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  sublabel,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  sublabel?: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: "var(--neon-cyan)",
    green: "var(--neon-green)",
    red: "var(--neon-red)",
    yellow: "var(--neon-yellow)",
  };
  const c = colorMap[color] || colorMap.cyan;

  return (
    <div className="cyber-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center border"
          style={{
            background: `color-mix(in srgb, ${c} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${c} 25%, transparent)`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: c }} />
        </div>
      </div>

      <div className="font-display text-3xl font-bold mb-1" style={{ color: c }}>
        {value}
      </div>

      <div className="text-xs font-mono uppercase tracking-wider" style={{ color: "#8892b0" }}>
        {label}
      </div>

      {sublabel && (
        <div className="text-xs mt-1" style={{ color: "#8892b0", opacity: 0.6 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => userApi.stats().then((r) => r.data),
  });

  const pieData = stats
    ? [
        { name: "Safe", value: stats.safe_scans || stats.safe || 0, color: "#00ff88" },
        { name: "Threats", value: stats.threats_detected || 0, color: "#ff2d55" },
        { name: "Suspicious", value: stats.suspicious || 0, color: "#ffd60a" },
      ]
    : [];

  return (
    <div>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 animate-pulse" style={{ color: "var(--neon-cyan)" }} />
            <span
              className="font-mono text-xs uppercase tracking-widest"
              style={{ color: "var(--neon-cyan)" }}
            >
              Live Dashboard
            </span>
          </div>

          <h1 className="font-display text-2xl font-bold" style={{ color: "#e8eaf0" }}>
            Welcome back, <span style={{ color: "var(--neon-cyan)" }}>{user?.username}</span>
          </h1>

          <p className="font-mono text-sm mt-1" style={{ color: "#8892b0" }}>
            Your threat detection overview
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Shield}
            label="Total Scans"
            value={isLoading ? "—" : stats?.total_scans ?? 0}
            color="cyan"
          />

          <StatCard
            icon={AlertTriangle}
            label="Threats Detected"
            value={isLoading ? "—" : stats?.threats_detected ?? 0}
            color="red"
            sublabel={`${stats?.threat_rate ?? 0}% threat rate`}
          />

          <StatCard
            icon={CheckCircle}
            label="Safe Results"
            value={isLoading ? "—" : stats?.safe ?? 0}
            color="green"
          />

          <StatCard
            icon={TrendingUp}
            label="Suspicious"
            value={isLoading ? "—" : stats?.suspicious ?? 0}
            color="yellow"
          />
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Trend */}
          <div className="cyber-card p-5 lg:col-span-2">
            <div className="mb-4">
              <h2 className="font-display font-semibold text-sm" style={{ color: "#e8eaf0" }}>
                Scan Activity (7 days)
              </h2>
              <p className="text-xs font-mono mt-0.5" style={{ color: "#8892b0" }}>
                Scans vs threats detected
              </p>
            </div>

            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={mockTrend}>
                <defs>
                  <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f5ff" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#00f5ff" stopOpacity={0} />
                  </linearGradient>

                  <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff2d55" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ff2d55" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey="date"
                  stroke="#8892b0"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                />

                <YAxis
                  stroke="#8892b0"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                />

                <Tooltip
                  contentStyle={{
                    background: "#0c1120",
                    border: "1px solid #1a2540",
                    borderRadius: "8px",
                    fontFamily: "JetBrains Mono",
                    fontSize: "12px",
                    color: "#e8eaf0",
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="scans"
                  stroke="#00f5ff"
                  fill="url(#scanGrad)"
                  strokeWidth={2}
                />

                <Area
                  type="monotone"
                  dataKey="threats"
                  stroke="#ff2d55"
                  fill="url(#threatGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pie */}
          <div className="cyber-card p-5">
            <div className="mb-4">
              <h2 className="font-display font-semibold text-sm" style={{ color: "#e8eaf0" }}>
                Scan Breakdown
              </h2>
              <p className="text-xs font-mono mt-0.5" style={{ color: "#8892b0" }}>
                Results distribution
              </p>
            </div>

            {pieData.some((d) => d.value > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={pieData} innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} opacity={0.85} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-2 mt-3">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        <span style={{ color: "#8892b0" }}>{d.name}</span>
                      </div>
                      <span style={{ color: d.color }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div
                className="flex items-center justify-center h-36 text-xs font-mono"
                style={{ color: "#8892b0" }}
              >
                No data yet
              </div>
            )}
          </div>
        </div>

        {/* Scan type cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: Globe, label: "URL Scans", value: stats?.url_scans ?? 0, color: "#00f5ff", href: "/dashboard/url" },
            { icon: MessageSquare, label: "Message Scans", value: stats?.message_scans ?? 0, color: "#00ff88", href: "/dashboard/message" },
            { icon: FileSearch, label: "File Scans", value: stats?.file_scans ?? 0, color: "#bf5af2", href: "/dashboard/file" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="cyber-card p-5 flex items-center gap-4 transition-all group"
              style={{ textDecoration: "none" }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center border shrink-0"
                style={{ background: `${item.color}12`, borderColor: `${item.color}30` }}
              >
                <item.icon className="w-5 h-5" style={{ color: item.color }} />
              </div>

              <div>
                <div className="font-display text-2xl font-bold" style={{ color: item.color }}>
                  {item.value}
                </div>

                <div className="text-xs font-mono" style={{ color: "#8892b0" }}>
                  {item.label}
                </div>
              </div>

              <div className="ml-auto transition-colors" style={{ color: "#8892b0" }}>
                →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}