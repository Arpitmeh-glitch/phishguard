"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, AlertCircle, Eye, EyeOff, CheckSquare, Square, Check } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";

function PasswordStrengthRow({ label, met }: { label: string; met: boolean }) {
  return (
    <span className={`flex items-center gap-1 text-[11px] font-mono transition-colors ${met ? "text-neon-green" : "text-text-secondary"}`}>
      <Check className="w-2.5 h-2.5" style={{ opacity: met ? 1 : 0.3 }} />
      {label}
    </span>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [form, setForm]               = useState({ email: "", username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError]             = useState("");

  const pwChecks = {
    length:    form.password.length >= 8,
    uppercase: /[A-Z]/.test(form.password),
    digit:     /[0-9]/.test(form.password),
  };

  // FIXED: e.preventDefault() stops the default HTML form POST/refresh.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!pwChecks.length || !pwChecks.uppercase || !pwChecks.digit) {
      setError("Password does not meet requirements");
      return;
    }
    // FIXED: terms_accepted is now sent to backend (it was missing before,
    // causing every registration to fail with 422 silently).
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
      {/* Background orb — FIXED: inline opacity instead of invalid opacity-6 */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div
          className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full"
          style={{
            background: "radial-gradient(circle, #bf5af2, transparent)",
            filter: "blur(80px)",
            opacity: 0.06,
          }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-neon-cyan" />
          </div>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            Phish<span className="text-neon-cyan">Guard</span>
          </h1>
          <p className="text-text-secondary font-mono text-sm mt-1">Create analyst account</p>
        </div>

        <div className="cyber-card p-8">
          <div className="scanner-line" />
          <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Register</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-neon-red/10 border border-neon-red/30 text-neon-red text-sm font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
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
              <label className="block text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
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
              <label className="block text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-neon-cyan transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Password requirements indicator */}
              {form.password.length > 0 && (
                <div className="mt-2 flex gap-3 flex-wrap">
                  <PasswordStrengthRow label="8+ chars"  met={pwChecks.length} />
                  <PasswordStrengthRow label="Uppercase" met={pwChecks.uppercase} />
                  <PasswordStrengthRow label="Number"    met={pwChecks.digit} />
                </div>
              )}
            </div>

            {/* Terms of Service — FIXED: required by backend, was missing entirely */}
            <button
              type="button"
              onClick={() => setTermsAccepted(!termsAccepted)}
              className="flex items-start gap-2.5 text-left w-full group mt-1"
            >
              <div className="mt-0.5 shrink-0 transition-colors">
                {termsAccepted
                  ? <CheckSquare className="w-4 h-4 text-neon-cyan" />
                  : <Square className="w-4 h-4 text-text-secondary group-hover:text-neon-cyan" />
                }
              </div>
              <span className="text-xs font-mono text-text-secondary leading-relaxed">
                I accept the{" "}
                <span className="text-neon-cyan">Terms of Service</span>
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
            <span className="text-text-secondary text-sm font-mono">Already registered? </span>
            <Link href="/auth/login" className="text-neon-cyan text-sm font-mono hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
