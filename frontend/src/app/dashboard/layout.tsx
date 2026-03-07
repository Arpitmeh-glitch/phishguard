"use client";

/*
 * FIX 1: "use client" is REQUIRED here and must be the very first line —
 * before any imports. This file uses:
 *   - React hooks (useEffect, useState)
 *   - Next.js navigation hooks (usePathname, useRouter)
 *   - Zustand store (useAuthStore)
 *   - localStorage (browser-only API)
 * All of these are illegal in Server Components. In Next.js 14 App Router,
 * layout.tsx files are Server Components by default. Without "use client"
 * the Vercel build compiler throws during static analysis because it detects
 * hook usage in a server context — even if it works locally via dev-mode
 * lenience.
 *
 * FIX 2: localStorage must be guarded by typeof window !== "undefined".
 * Vercel runs a Node.js build step that pre-renders/statically analyses pages.
 * localStorage does not exist in Node.js. Accessing it at module level or
 * during SSR causes a ReferenceError that only surfaces in production builds,
 * not in `next dev` (which skips static pre-rendering).
 *
 * FIX 3: useAuthStore must only be called inside the component body, never
 * at module level. Zustand's useStore hook calls React's useSyncExternalStore
 * internally — calling it outside a component throws in the build pipeline.
 */

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

  /*
   * FIX 4: Use a dedicated `mounted` state to prevent hydration mismatch.
   * On the server (and during Next.js static build), there is no auth state.
   * Rendering the full sidebar immediately would cause a React hydration
   * mismatch between server HTML and client HTML. Showing a neutral loading
   * state until the client has mounted and checked auth is the correct pattern.
   */
  const [mounted,  setMounted]  = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setMounted(true);

    /*
     * FIX 5: localStorage access is wrapped in a mounted useEffect.
     * This guarantees it only runs in the browser after hydration —
     * never during the Node.js build or SSR pass.
     */
    const token = localStorage.getItem("access_token");
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

  /*
   * FIX 6: Render nothing (or a neutral shell) until the component has
   * mounted on the client. This prevents the server from rendering
   * auth-gated UI that would mismatch the client's initial render.
   */
  if (!mounted) {
    return (
      <div
        className="min-h-screen grid-bg flex items-center justify-center"
        style={{ background: "#050810" }}
      />
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: "rgba(0,245,255,0.3)", borderTopColor: "var(--neon-cyan)" }}
          />
          <div className="font-mono text-sm" style={{ color: "var(--neon-cyan)" }}>
            Authenticating...
          </div>
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
                <span
                  className="text-xs font-mono uppercase tracking-wider"
                  style={{ color: "#8892b0" }}
                >
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
