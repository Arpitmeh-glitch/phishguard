"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Shield, Globe, MessageSquare, FileSearch,
  History, LogOut, BarChart3, Users, Activity,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";

const navItems = [
  { href: "/dashboard",          icon: BarChart3,     label: "Dashboard"       },
  { href: "/dashboard/url",      icon: Globe,         label: "URL Scanner"     },
  { href: "/dashboard/message",  icon: MessageSquare, label: "Message Scanner" },
  { href: "/dashboard/file",     icon: FileSearch,    label: "File Scanner"    },
  { href: "/dashboard/history",  icon: History,       label: "Scan History"    },
];

const adminItems = [
  { href: "/dashboard/admin",      icon: Users,    label: "User Management" },
  { href: "/dashboard/admin/logs", icon: Activity, label: "Audit Logs"      },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout, fetchUser } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    fetchUser().finally(() => {
      setChecking(false);
      if (!useAuthStore.getState().isAuthenticated) {
        router.replace("/auth/login");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: "rgba(0,245,255,0.3)", borderTopColor: "var(--neon-cyan)" }}
          />
          <div className="font-mono text-sm" style={{ color: "var(--neon-cyan)" }}>Authenticating...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  const roleColors = {
    admin:   { bg: "rgba(255,214,10,0.1)",  color: "#ffd60a",  border: "rgba(255,214,10,0.3)"  },
    analyst: { bg: "rgba(191,90,242,0.1)",  color: "#bf5af2",  border: "rgba(191,90,242,0.3)"  },
    user:    { bg: "rgba(0,245,255,0.1)",   color: "#00f5ff",  border: "rgba(0,245,255,0.3)"   },
  };
  const rc = roleColors[user?.role as keyof typeof roleColors] ?? roleColors.user;

  return (
    <div className="min-h-screen flex" style={{ background: "#050810" }}>
      {/* Sidebar */}
      <aside
        className="w-60 flex flex-col shrink-0"
        style={{
          background: "#0c1120",
          borderRight: "1px solid #1a2540",
        }}
      >
        {/* Logo */}
        <div className="px-5 py-5" style={{ borderBottom: "1px solid #1a2540" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center border"
              style={{ background: "rgba(0,245,255,0.1)", borderColor: "rgba(0,245,255,0.3)" }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: "var(--neon-cyan)" }} />
            </div>
            <span className="font-display font-bold text-base" style={{ color: "#e8eaf0" }}>
              Phish<span style={{ color: "var(--neon-cyan)" }}>Guard</span>
            </span>
          </div>
        </div>

        {/* User info */}
        {user && (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid #1a2540" }}>
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center border"
                style={{ background: "rgba(0,245,255,0.1)", borderColor: "rgba(0,245,255,0.2)" }}
              >
                <span className="font-mono text-xs font-bold" style={{ color: "var(--neon-cyan)" }}>
                  {user.username?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div>
                <div className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{user.username}</div>
                <div
                  className="text-xs font-mono px-1.5 py-0.5 rounded mt-0.5 inline-block"
                  style={{ background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}
                >
                  {user.role?.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono transition-all"
                style={
                  active
                    ? {
                        background: "rgba(0,245,255,0.1)",
                        border: "1px solid rgba(0,245,255,0.2)",
                        color: "var(--neon-cyan)",
                      }
                    : {
                        color: "#8892b0",
                        border: "1px solid transparent",
                      }
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          {/* Admin section */}
          {(user?.role === "admin" || user?.role === "analyst") && (
            <>
              <div className="pt-3 pb-1 px-3">
                <span className="text-xs font-mono uppercase tracking-wider" style={{ color: "#8892b0" }}>
                  Admin
                </span>
              </div>
              {adminItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono transition-all"
                    style={
                      active
                        ? {
                            background: "rgba(255,214,10,0.1)",
                            border: "1px solid rgba(255,214,10,0.2)",
                            color: "#ffd60a",
                          }
                        : {
                            color: "#8892b0",
                            border: "1px solid transparent",
                          }
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Sign out */}
        <div className="p-3" style={{ borderTop: "1px solid #1a2540" }}>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono transition-all w-full"
            style={{ color: "#8892b0", background: "transparent", border: "none", cursor: "pointer" }}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto" style={{ color: "#e8eaf0" }}>
        {children}
      </main>
    </div>
  );
}
