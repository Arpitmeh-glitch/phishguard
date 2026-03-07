"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { adminApi } from "@/lib/api";

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-logs", page],
    queryFn: () => adminApi.logs(page).then((r) => r.data),
  });

  const totalPages = data ? Math.ceil((data.total ?? 0) / 20) : 0;

  const actionColor = (action: string) => {
    if (action.includes("failed") || action.includes("error")) return "#ff2d55";
    if (action.includes("login") || action.includes("register"))  return "#00f5ff";
    if (action.includes("admin") || action.includes("role"))       return "#ffd60a";
    return "#8892b0";
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-neon-yellow" />
          <span className="text-neon-yellow font-mono text-xs uppercase tracking-widest">Security</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-text-primary">Audit Logs</h1>
        <p className="text-text-secondary font-mono text-sm mt-1">
          Full platform activity trail — all user and admin actions
        </p>
      </div>

      <div className="cyber-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cyber-border">
              {["Action", "User ID", "IP Address", "User Agent", "Time"].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-mono uppercase tracking-wider text-text-secondary">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-cyber-border/50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-cyber-border rounded animate-pulse" style={{ width: `${50 + j * 10}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-text-secondary font-mono text-sm">
                  No audit log entries found.
                </td>
              </tr>
            ) : (
              data.items.map((log: any) => (
                <tr key={log.id} className="border-b border-cyber-border/30 hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" style={{ color: actionColor(log.action) }} />
                      <span className="text-xs font-mono" style={{ color: actionColor(log.action) }}>
                        {log.action}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-text-secondary">
                    {log.user_id ? log.user_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-text-secondary">
                    {log.ip_address ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 max-w-xs">
                    <span className="text-xs font-mono text-text-secondary truncate block" title={log.user_agent}>
                      {log.user_agent ? log.user_agent.slice(0, 40) + "…" : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-text-secondary whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-cyber-border text-text-secondary hover:text-text-primary disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-text-secondary text-xs font-mono">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-cyber-border text-text-secondary hover:text-text-primary disabled:opacity-30 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
