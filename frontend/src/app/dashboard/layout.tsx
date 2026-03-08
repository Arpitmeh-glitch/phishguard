"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Globe, MessageSquare, FileSearch,
  History, LogOut, BarChart3, Users, Activity,
  Wifi, ScrollText, Info, Menu, X,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";

const navItems = [
  { href: "/dashboard",          icon: BarChart3,     label: "Dashboard"           },
  { href: "/dashboard/url",      icon: Globe,         label: "URL Scanner"         },
  { href: "/dashboard/message",  icon: MessageSquare, label: "Message Scanner"     },
  { href: "/dashboard/file",     icon: FileSearch,    label: "File Scanner"        },
  { href: "/dashboard/threat",   icon: Wifi,          label: "Live Threat"         },
  { href: "/dashboard/history",  icon: History,       label: "Scan History"        },
];

const bottomItems = [
  { href: "/dashboard/about", icon: Info,       label: "About"          },
  { href: "/dashboard/tos",   icon: ScrollText, label: "Terms of Service" },
];

const adminItems = [
  { href: "/dashboard/admin",      icon: Users,    label: "User Management" },
  { href: "/dashboard/admin/logs", icon: Activity, label: "Audit Logs"      },
];

function NavLink({
  href, icon: Icon, label, active, color = "cyan", onClick,
}: {
  href: string; icon: React.ElementType; label: string; active: boolean;
  color?: "cyan" | "yellow"; onClick?: () => void;
}) {
  const activeStyles =
    color === "yellow"
      ? { background: "rgba(255,214,10,0.1)", border: "1px solid rgba(255,214,10,0.2)", color: "#ffd60a" }
      : { background: "rgba(0,245,255,0.1)", border: "1px solid rgba(0,245,255,0.2)", color: "#00f5ff" };

  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono transition-all"
      style={active ? activeStyles : { color: "#8892b0", border: "1px solid transparent" }}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

function SidebarContent({
  user, pathname, onNavigate, onLogout,
}: {
  user: any; pathname: string; onNavigate?: () => void; onLogout: () => void;
}) {
  const roleColors = {
    admin:   { bg: "rgba(255,214,10,0.1)",  color: "#ffd60a",  border: "rgba(255,214,10,0.3)"  },
    analyst: { bg: "rgba(191,90,242,0.1)",  color: "#bf5af2",  border: "rgba(191,90,242,0.3)"  },
    user:    { bg: "rgba(0,245,255,0.1)",   color: "#00f5ff",  border: "rgba(0,245,255,0.3)"   },
  };
  const rc = roleColors[user?.role as keyof typeof roleColors] ?? roleColors.user;

  return (
    <div className="flex flex-col h-full" style={{ background: "#0c1120", borderRight: "1px solid #1a2540" }}>
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid #1a2540" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center border"
            style={{ background: "rgba(0,245,255,0.1)", borderColor: "rgba(0,245,255,0.3)" }}
          >
            <Shield className="w-3.5 h-3.5" style={{ color: "#00f5ff" }} />
          </div>
          <span className="font-display font-bold text-base" style={{ color: "#e8eaf0" }}>
            Phish<span style={{ color: "#00f5ff" }}>Guard</span>
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
              <span className="font-mono text-xs font-bold" style={{ color: "#00f5ff" }}>
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

      {/* Main nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            active={pathname === item.href}
            onClick={onNavigate}
          />
        ))}

        {/* Admin section */}
        {(user?.role === "admin" || user?.role === "analyst") && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs font-mono uppercase tracking-wider" style={{ color: "#8892b0" }}>
                Admin
              </span>
            </div>
            {adminItems.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                active={pathname === item.href}
                color="yellow"
                onClick={onNavigate}
              />
            ))}
          </>
        )}

        {/* Divider */}
        <div className="pt-3 pb-1">
          <div style={{ height: 1, background: "#1a2540" }} />
        </div>

        {/* Bottom nav links */}
        {bottomItems.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            active={pathname === item.href}
            onClick={onNavigate}
          />
        ))}
      </nav>

      {/* Sign out */}
      <div className="p-3" style={{ borderTop: "1px solid #1a2540" }}>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono transition-all w-full hover:bg-red-500/10"
          style={{ color: "#8892b0", background: "transparent", border: "none", cursor: "pointer" }}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout, fetchUser } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();

  const [mounted,      setMounted]      = useState(false);
  const [checking,     setChecking]     = useState(true);
  const [mobileOpen,   setMobileOpen]   = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("access_token");
    if (!token) { router.replace("/auth/login"); return; }
    fetchUser().finally(() => {
      setChecking(false);
      if (!useAuthStore.getState().isAuthenticated) router.replace("/auth/login");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (!mounted) {
    return <div className="min-h-screen" style={{ background: "#050810" }} />;
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050810" }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: "rgba(0,245,255,0.3)", borderTopColor: "#00f5ff" }}
          />
          <div className="font-mono text-sm" style={{ color: "#00f5ff" }}>Authenticating...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleLogout = () => { logout(); router.push("/auth/login"); };

  return (
    <div className="min-h-screen flex" style={{ background: "#050810" }}>

      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────── */}
      <aside className="hidden md:flex w-60 flex-col shrink-0 sticky top-0 h-screen">
        <SidebarContent
          user={user}
          pathname={pathname}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Mobile overlay backdrop ─────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: "rgba(5,8,16,0.8)", backdropFilter: "blur(4px)" }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile slide-in sidebar ─────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            key="mobile-sidebar"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 left-0 z-50 w-64 md:hidden"
          >
            <SidebarContent
              user={user}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              onLogout={() => { setMobileOpen(false); handleLogout(); }}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with hamburger */}
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-30"
          style={{ background: "#0c1120", borderBottom: "1px solid #1a2540" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center border"
              style={{ background: "rgba(0,245,255,0.1)", borderColor: "rgba(0,245,255,0.3)" }}
            >
              <Shield className="w-3 h-3" style={{ color: "#00f5ff" }} />
            </div>
            <span className="font-display font-bold text-sm" style={{ color: "#e8eaf0" }}>
              Phish<span style={{ color: "#00f5ff" }}>Guard</span>
            </span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg border"
            style={{ borderColor: "#1a2540", color: "#8892b0" }}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 overflow-auto" style={{ color: "#e8eaf0" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
