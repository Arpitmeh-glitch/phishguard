"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Shield, Globe, MessageSquare, FileSearch,
  History, LogOut, BarChart3, Users, Activity,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { clsx } from "clsx";

const navItems = [
  { href: "/dashboard",          icon: BarChart3,     label: "Dashboard"       },
  { href: "/dashboard/url",      icon: Globe,         label: "URL Scanner"     },
  { href: "/dashboard/message",  icon: MessageSquare, label: "Message Scanner" },
  { href: "/dashboard/file",     icon: FileSearch,    label: "File Scanner"    },
  { href: "/dashboard/history",  icon: History,       label: "Scan History"    },
];

// FIXED: Admin nav items only shown to admin/analyst roles.
// /dashboard/admin/logs page is now created so this link actually works.
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
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    fetchUser().finally(() => {
      setChecking(false);
      // Read fresh state after fetchUser resolves
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
          <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
          <div className="text-neon-cyan font-mono text-sm">Authenticating...</div>
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
    <div className="min-h-screen flex bg-cyber-dark">
      {/* Sidebar */}
      <aside className="w-60 border-r border-cyber-border flex flex-col bg-cyber-card shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-cyber-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-neon-cyan" />
            </div>
            <span className="font-display font-bold text-base text-text-primary">
              Phish<span className="text-neon-cyan">Guard</span>
            </span>
          </div>
        </div>

        {/* User info */}
        {user && (
          <div className="px-5 py-4 border-b border-cyber-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                <span className="text-neon-cyan font-mono text-xs font-bold">
                  {user.username?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div>
                <div className="text-text-primary text-xs font-medium">{user.username}</div>
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
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono transition-all",
                  active
                    ? "bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan"
                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          {/* Admin section — only admin or analyst can see this */}
          {(user?.role === "admin" || user?.role === "analyst") && (
            <>
              <div className="pt-3 pb-1 px-3">
                <span className="text-text-secondary text-xs font-mono uppercase tracking-wider">Admin</span>
              </div>
              {adminItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono transition-all",
                      active
                        ? "bg-neon-yellow/10 border border-neon-yellow/20 text-neon-yellow"
                        : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                    )}
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
        <div className="p-3 border-t border-cyber-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono text-text-secondary hover:text-neon-red hover:bg-neon-red/5 transition-all w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
