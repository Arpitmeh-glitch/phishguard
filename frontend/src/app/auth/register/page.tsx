"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, AlertCircle, Eye, EyeOff, CheckSquare, Square, Check } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";

function PasswordStrengthRow({ label, met }: { label: string; met: boolean }) {
  return (
    <span
      className="flex items-center gap-1 text-xs font-mono transition-colors"
      style={{ color: met ? "var(--neon-green)" : "#8892b0" }}
    >
      <Check className="w-2.5 h-2.5" style={{ opacity: met ? 1 : 0.3 }} />
      {label}
    </span>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [form, setForm]                 = useState({ email: "", username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError]               = useState("");

  const pwChecks = {
    length:    form.password.length >= 8,
    uppercase: /[A-Z]/.test(form.password),
    digit:     /[0-9]/.test(form.password),
  };

  /*
   * FIX: e.preventDefault() is called first — mandatory to stop native form POST.
   * FIX: terms_accepted is sent to backend (was missing, causing silent 422 errors).
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.email || !form.username || !form.password) {
      setError("All fields are required");
      return;
    }
    if (!pwChecks.length || !pwChecks.uppercase || !pwChecks.digit) {
      setError("Password does not meet requirements");
      return;
    }
    if (!termsAccepted) {
      setError("You must accept the Terms of Service to register");
      return;
    }

    try {
      await register(form.email, form.username, form.password, termsAccepted);
      toast.success("Account created. Please sign in.");
      router.push("/auth/login");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let msg = "Registration failed";
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail) && detail[0]?.msg) {
        msg = detail[0].msg.replace("Value error, ", "");
      }
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center px-4 py-8">
      {/* Background orb */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 0, pointerEvents: "none" }}
        aria-hidden="true"
      >
        <div
          className="absolute rounded-full"
          style={{
            top: "33%", right: "25%",
            width: "16rem", height: "16rem",
            background: "radial-gradient(circle, #bf5af2, transparent)",
            filter: "blur(80px)",
            opacity: 0.06,
          }}
        />
      </div>

      <div className="w-full max-w-md" style={{ position: "relative", zIndex: 10 }}>
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
          <p className="font-mono text-sm mt-1" style={{ color: "#8892b0" }}>Create analyst account</p>
        </div>

        <div className="cyber-card p-8">
          <div className="scanner-line" />
          <h2 className="font-display text-xl font-semibold mb-6" style={{ color: "#e8eaf0" }}>Register</h2>

          {error && (
            <div
              className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm font-mono"
              style={{ background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.3)", color: "var(--neon-red)" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-2" style={{ color: "#8892b0" }}>
                Email Address
              </label>
              <input
                type="email"
                className="scan-input"
                placeholder="analyst@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-2" style={{ color: "#8892b0" }}>
                Username
              </label>
              <input
                type="text"
                className="scan-input"
                placeholder="analyst_01"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
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
                  placeholder="Min 8 chars, uppercase + number"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
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
              {form.password.length > 0 && (
                <div className="mt-2 flex gap-3 flex-wrap">
                  <PasswordStrengthRow label="8+ chars"  met={pwChecks.length} />
                  <PasswordStrengthRow label="Uppercase" met={pwChecks.uppercase} />
                  <PasswordStrengthRow label="Number"    met={pwChecks.digit} />
                </div>
              )}
            </div>

            {/* Terms of Service — required by backend */}
            <button
              type="button"
              onClick={() => setTermsAccepted(!termsAccepted)}
              className="flex items-start gap-2.5 text-left w-full mt-1"
              style={{ cursor: "pointer" }}
            >
              <div className="mt-0.5 shrink-0">
                {termsAccepted
                  ? <CheckSquare className="w-4 h-4" style={{ color: "var(--neon-cyan)" }} />
                  : <Square className="w-4 h-4" style={{ color: "#8892b0" }} />
                }
              </div>
              <span className="text-xs font-mono leading-relaxed" style={{ color: "#8892b0" }}>
                I accept the{" "}
                <span style={{ color: "var(--neon-cyan)" }}>Terms of Service</span>
                {" "}and agree to the platform&apos;s usage policies
              </span>
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-cyber w-full py-3 mt-2 text-sm"
            >
              {isLoading ? "Creating account..." : "→  Create Account"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm font-mono" style={{ color: "#8892b0" }}>Already registered? </span>
            <Link href="/auth/login" className="text-sm font-mono hover:underline" style={{ color: "var(--neon-cyan)" }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
