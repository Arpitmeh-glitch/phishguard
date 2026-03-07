"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";

const DEMO_ACCOUNTS = [
  { label: "Admin",   email: "admin@phishguard.io",   password: "Admin123!", role: "admin",   color: "#ffd60a" },
  { label: "Analyst", email: "analyst@phishguard.io", password: "Analyst1!", role: "analyst", color: "#bf5af2" },
  { label: "User",    email: "user@phishguard.io",    password: "User1234!", role: "user",    color: "#00f5ff" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");

  /*
   * FIX: e.preventDefault() is the critical first call — without it the browser
   * performs a native form POST which reloads the page, discarding all state.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }
    try {
      await login(email, password);
      toast.success("Access granted");
      router.push("/dashboard");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Authentication failed";
      setError(msg);
      toast.error(msg);
    }
  };

  const loginAsDemo = async (demo: typeof DEMO_ACCOUNTS[0]) => {
    setError("");
    try {
      await login(demo.email, demo.password);
      toast.success(`Signed in as ${demo.label}`);
      router.push("/dashboard");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Demo login failed — make sure the server is running";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center px-4 py-8">
      {/* Background orb — pointer-events:none, behind all content */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 0, pointerEvents: "none" }}
        aria-hidden="true"
      >
        <div
          className="absolute rounded-full"
          style={{
            top: "25%", left: "25%",
            width: "16rem", height: "16rem",
            background: "radial-gradient(circle, #00f5ff, transparent)",
            filter: "blur(80px)",
            opacity: 0.08,
          }}
        />
      </div>

      <div className="w-full max-w-md" style={{ position: "relative", zIndex: 10 }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
            style={{ background: "rgba(0,245,255,0.1)", borderColor: "rgba(0,245,255,0.3)" }}
          >
            <Shield className="w-7 h-7" style={{ color: "var(--neon-cyan)" }} />
          </div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "#e8eaf0" }}>
            Phish<span style={{ color: "var(--neon-cyan)" }}>Guard</span>
          </h1>
          <p className="font-mono text-sm mt-1" style={{ color: "#8892b0" }}>Secure access portal</p>
        </div>

        {/* Demo accounts */}
        <div className="cyber-card p-4 mb-4">
          <div
            className="text-xs font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5"
            style={{ color: "#8892b0" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse inline-block"
              style={{ background: "var(--neon-green)" }}
            />
            Demo Accounts — Click to sign in instantly
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((demo) => (
              /*
               * FIX: type="button" prevents these from accidentally submitting
               * the login form if they're rendered inside a <form>.
               * These are standalone buttons — they call loginAsDemo directly.
               */
              <button
                key={demo.label}
                type="button"
                onClick={() => loginAsDemo(demo)}
                disabled={isLoading}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all hover:scale-105 disabled:opacity-50"
                style={{
                  background: `${demo.color}08`,
                  borderColor: `${demo.color}30`,
                  cursor: isLoading ? "not-allowed" : "pointer",
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold"
                  style={{ background: `${demo.color}15`, color: demo.color }}
                >
                  {demo.label[0]}
                </div>
                <div className="text-xs font-mono font-medium" style={{ color: demo.color }}>
                  {demo.label}
                </div>
                <div className="text-xs font-mono" style={{ color: "#8892b0", opacity: 0.7 }}>
                  {demo.role}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 border-t pt-3" style={{ borderColor: "#1a2540" }}>
            <div className="text-xs font-mono space-y-0.5" style={{ color: "#8892b0" }}>
              {DEMO_ACCOUNTS.map((d) => (
                <div key={d.email} className="flex gap-2 flex-wrap">
                  <span style={{ color: d.color }}>{d.label}:</span>
                  <span>{d.email}</span>
                  <span style={{ opacity: 0.4 }}>/</span>
                  <span>{d.password}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Login form */}
        <div className="cyber-card p-8">
          <div className="scanner-line" />
          <h2 className="font-display text-xl font-semibold mb-6" style={{ color: "#e8eaf0" }}>
            Sign in manually
          </h2>

          {error && (
            <div
              className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm font-mono"
              style={{ background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.3)", color: "var(--neon-red)" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/*
           * FIX: onSubmit handler with e.preventDefault() is the correct pattern.
           * The form does NOT have action= set, which would cause native submission.
           * noValidate disables browser validation popups (we validate manually).
           */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-2" style={{ color: "#8892b0" }}>
                Email Address
              </label>
              <input
                type="email"
                className="scan-input"
                placeholder="analyst@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-2" style={{ color: "#8892b0" }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="scan-input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#8892b0" }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-cyber w-full py-3 mt-2 text-sm"
            >
              {isLoading ? "Authenticating..." : "→  Access System"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm font-mono" style={{ color: "#8892b0" }}>New analyst? </span>
            <Link href="/auth/register" className="text-sm font-mono hover:underline" style={{ color: "var(--neon-cyan)" }}>
              Create account
            </Link>
          </div>
        </div>

        <p className="text-center text-xs font-mono mt-4" style={{ color: "#8892b0", opacity: 0.5 }}>
          Protected by JWT · AES-256 · bcrypt
        </p>
      </div>
    </div>
  );
}
