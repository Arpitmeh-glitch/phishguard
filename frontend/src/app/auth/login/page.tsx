"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@phishguard.io", password: "Admin123!", role: "admin", color: "#ffd60a" },
  { label: "Analyst", email: "analyst@phishguard.io", password: "Analyst1!", role: "analyst", color: "#bf5af2" },
  { label: "User", email: "user@phishguard.io", password: "User1234!", role: "user", color: "#00f5ff" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      toast.success("Access granted");
      router.push("/dashboard");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Authentication failed";
      setError(msg);
    }
  };

  const loginAsDemo = async (demo: typeof DEMO_ACCOUNTS[0]) => {
    setError("");
    setEmail(demo.email);
    setPassword(demo.password);
    try {
      await login(demo.email, demo.password);
      toast.success(`Signed in as ${demo.label}`);
      router.push("/dashboard");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Demo login failed — make sure the server is running");
    }
  };

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center px-4 py-8">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, #00f5ff, transparent)", filter: "blur(80px)" }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-neon-cyan" />
          </div>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            Phish<span className="text-neon-cyan">Guard</span>
          </h1>
          <p className="text-text-secondary font-mono text-sm mt-1">Secure access portal</p>
        </div>

        {/* Demo accounts */}
        <div className="cyber-card p-4 mb-4">
          <div className="text-text-secondary text-xs font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse inline-block" />
            Demo Accounts — Click to sign in instantly
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((demo) => (
              <button
                key={demo.label}
                onClick={() => loginAsDemo(demo)}
                disabled={isLoading}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all hover:scale-[1.02] disabled:opacity-50"
                style={{
                  background: `${demo.color}08`,
                  borderColor: `${demo.color}30`,
                }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold"
                  style={{ background: `${demo.color}15`, color: demo.color }}>
                  {demo.label[0]}
                </div>
                <div className="text-xs font-mono font-medium" style={{ color: demo.color }}>
                  {demo.label}
                </div>
                <div className="text-text-secondary text-[10px] font-mono opacity-60">
                  {demo.role}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-cyber-border pt-3">
            <div className="text-text-secondary text-[10px] font-mono space-y-0.5">
              {DEMO_ACCOUNTS.map((d) => (
                <div key={d.email} className="flex gap-2">
                  <span style={{ color: d.color }}>{d.label}:</span>
                  <span>{d.email}</span>
                  <span className="opacity-50">/</span>
                  <span>{d.password}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Login form */}
        <div className="cyber-card p-8">
          <div className="scanner-line" />
          <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Sign in manually</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-neon-red/10 border border-neon-red/30 text-neon-red text-sm font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                className="scan-input"
                placeholder="analyst@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="scan-input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-neon-cyan transition-colors"
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
            <span className="text-text-secondary text-sm font-mono">New analyst? </span>
            <Link href="/auth/register" className="text-neon-cyan text-sm font-mono hover:underline">
              Create account
            </Link>
          </div>
        </div>

        <p className="text-center text-text-secondary text-xs font-mono mt-4 opacity-50">
          Protected by JWT · AES-256 · bcrypt
        </p>
      </div>
    </div>
  );
}
