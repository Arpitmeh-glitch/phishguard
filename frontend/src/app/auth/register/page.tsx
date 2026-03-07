"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, AlertCircle, Eye, EyeOff, CheckSquare, Square } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    // FIX: Explicitly prevent default — stops page reload on form submit
    e.preventDefault();
    setError("");

    // FIX: Validate terms accepted client-side with clear error message
    if (!termsAccepted) {
      setError("You must accept the Terms of Service to register");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(form.password)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[0-9]/.test(form.password)) {
      setError("Password must contain at least one digit");
      return;
    }

    try {
      // FIX: Pass termsAccepted to the register call so backend receives it
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
    }
  };

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full opacity-6"
          style={{ background: "radial-gradient(circle, #bf5af2, transparent)", filter: "blur(80px)" }} />
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { key: "email", label: "Email Address", type: "email", placeholder: "analyst@company.com" },
              { key: "username", label: "Username", type: "text", placeholder: "analyst_01" },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  className="scan-input"
                  placeholder={field.placeholder}
                  value={form[field.key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  required
                />
              </div>
            ))}

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
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-neon-cyan transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-1.5 flex gap-3 text-xs font-mono">
                <span className={form.password.length >= 8 ? "text-neon-green" : "text-text-secondary"}>8+ chars</span>
                <span className={/[A-Z]/.test(form.password) ? "text-neon-green" : "text-text-secondary"}>Uppercase</span>
                <span className={/[0-9]/.test(form.password) ? "text-neon-green" : "text-text-secondary"}>Number</span>
              </div>
            </div>

            {/* FIX: Terms of Service checkbox — backend requires terms_accepted=true */}
            <div>
              <button
                type="button"
                onClick={() => setTermsAccepted(!termsAccepted)}
                className="flex items-start gap-2.5 text-left w-full group"
              >
                <div className="mt-0.5 shrink-0 text-neon-cyan">
                  {termsAccepted
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4 text-text-secondary group-hover:text-neon-cyan transition-colors" />
                  }
                </div>
                <span className="text-xs font-mono text-text-secondary">
                  I accept the{" "}
                  <span className="text-neon-cyan">Terms of Service</span>
                  {" "}and agree to the platform's usage policies
                </span>
              </button>
            </div>

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
