"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Shield, Activity, BarChart2, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";

function AdminStatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  const colors: Record<string, string> = {
    cyan: "#00f5ff", green: "#00ff88", red: "#ff2d55", yellow: "#ffd60a",
  };
  const c = colors[color];
  return (
    <div className="cyber-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-secondary text-xs font-mono uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4" style={{ color: c }} />
      </div>
      <div className="font-display text-3xl font-bold" style={{ color: c }}>{value.toLocaleString()}</div>
    </div>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats().then((r) => r.data),
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.users().then((r) => r.data),
  });

  const roleUpdate = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminApi.updateRole(userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
  });

  const toggleUser = useMutation({
    mutationFn: (userId: string) => adminApi.toggleUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User status toggled");
    },
  });

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-neon-yellow" />
          <span className="text-neon-yellow font-mono text-xs uppercase tracking-widest">Admin Console</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-text-primary">Platform Overview</h1>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="cyber-card p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <AdminStatCard icon={Users} label="Total Users" value={stats.total_users} color="cyan" />
          <AdminStatCard icon={BarChart2} label="Total Scans" value={stats.total_scans} color="cyan" />
          <AdminStatCard icon={Activity} label="Scans Today" value={stats.scans_today} color="green" />
          <AdminStatCard icon={AlertTriangle} label="Threats Detected" value={stats.phishing_detected + stats.fraud_detected} color="red" />
          <AdminStatCard icon={CheckCircle} label="Safe Scans" value={stats.safe_scans} color="green" />
          <AdminStatCard icon={Activity} label="URL Scans" value={stats.url_scans} color="cyan" />
          <AdminStatCard icon={Activity} label="Message Scans" value={stats.message_scans} color="green" />
          <AdminStatCard icon={Activity} label="File Scans" value={stats.file_scans} color="yellow" />
        </div>
      )}

      {/* Users table */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display font-semibold text-text-primary">User Management</h2>
        <span className="text-text-secondary text-xs font-mono">{usersData?.total} users</span>
      </div>

      <div className="cyber-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cyber-border">
              {["Username", "Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-mono uppercase tracking-wider text-text-secondary">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-cyber-border/50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-cyber-border rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              usersData?.items.map((user: any) => (
                <tr key={user.id} className="border-b border-cyber-border/30 hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5 text-xs font-mono text-text-primary">{user.username}</td>
                  <td className="px-5 py-3.5 text-xs font-mono text-text-secondary">{user.email}</td>
                  <td className="px-5 py-3.5">
                    <select
                      value={user.role}
                      onChange={(e) => roleUpdate.mutate({ userId: user.id, role: e.target.value })}
                      className="text-xs font-mono bg-cyber-dark border border-cyber-border rounded px-2 py-1 text-text-primary outline-none focus:border-neon-cyan/40"
                    >
                      <option value="user">user</option>
                      <option value="analyst">analyst</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={clsx(
                      "text-xs font-mono px-2 py-0.5 rounded",
                      user.is_active ? "badge-safe" : "badge-threat"
                    )}>
                      {user.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-text-secondary">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleUser.mutate(user.id)}
                      className="text-xs font-mono text-text-secondary hover:text-neon-red transition-colors border border-cyber-border hover:border-neon-red/30 px-2 py-1 rounded"
                    >
                      {user.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
