"use client";
import { useState } from "react";
import { Globe, Shield, AlertTriangle, CheckCircle, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { scanApi } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

interface ScanResult {
  scan_id: string;
  label: "SAFE" | "SUSPICIOUS" | "PHISHING";
  confidence: number;
  reasons: string[];
  detection_mode: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// ResultCard
// ---------------------------------------------------------------------------
// Verdict color/icon is determined SOLELY by result.label (3 tiers):
//   SAFE       → green  (neon-green)
//   SUSPICIOUS → yellow (neon-yellow / amber)
//   PHISHING   → red    (neon-red)
//
// Confidence is displayed as Math.round(result.confidence * 100) + "%"
// because the API returns a decimal (e.g. 0.96 → 96%).
// ---------------------------------------------------------------------------

function ResultCard({ result }: { result: ScanResult }) {
  const label = result.label;                          // "SAFE" | "SUSPICIOUS" | "PHISHING"
  const conf  = Math.round(result.confidence * 100);  // decimal → percentage

  // Derive per-tier style tokens
  const isPhishing   = label === "PHISHING";
  const isSuspicious = label === "SUSPICIOUS";
  const isSafe       = label === "SAFE";

  const borderColor = isPhishing
    ? "border-l-neon-red"
    : isSuspicious
    ? "border-l-yellow-400"
    : "border-l-neon-green";

  const iconBg = isPhishing
    ? "bg-neon-red/10 border-neon-red/30"
    : isSuspicious
    ? "bg-yellow-400/10 border-yellow-400/30"
    : "bg-neon-green/10 border-neon-green/30";

  const textColor = isPhishing
    ? "text-neon-red"
    : isSuspicious
    ? "text-yellow-400"
    : "text-neon-green";

  const barGradient = isPhishing
    ? "linear-gradient(90deg, #ff2d55, #ff6b88)"
    : isSuspicious
    ? "linear-gradient(90deg, #facc15, #fde68a)"
    : "linear-gradient(90deg, #00ff88, #00ffaa)";

  const reasonBg = isPhishing
    ? "bg-neon-red/5 border border-neon-red/10"
    : isSuspicious
    ? "bg-yellow-400/5 border border-yellow-400/10"
    : "bg-neon-green/5 border border-neon-green/10";

  const chevronColor = isPhishing
    ? "text-neon-red"
    : isSuspicious
    ? "text-yellow-400"
    : "text-neon-green";

  const Icon = isPhishing
    ? AlertTriangle
    : isSuspicious
    ? AlertCircle
    : CheckCircle;

  return (
    <div className={clsx("cyber-card p-6 mt-6 border-l-4", borderColor)}>
      {/* Verdict */}
      <div className="flex items-center gap-4 mb-5">
        <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center border", iconBg)}>
          <Icon className={clsx("w-6 h-6", textColor)} />
        </div>
        <div>
          <div className={clsx("font-display text-2xl font-bold", textColor)}>
            {label}
          </div>
          <div className="text-text-secondary text-xs font-mono">
            Mode: {result.detection_mode}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className={clsx("font-display text-3xl font-bold", textColor)}>
            {conf}%
          </div>
          <div className="text-text-secondary text-xs font-mono">confidence</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="progress-bar mb-5">
        <div
          className="progress-fill"
          style={{ width: `${conf}%`, background: barGradient }}
        />
      </div>

      {/* Reasons */}
      {result.reasons.length > 0 && (
        <div>
          <div className="text-text-secondary text-xs font-mono uppercase tracking-wider mb-3">
            Detection Reasons ({result.reasons.length})
          </div>
          <div className="space-y-2">
            {result.reasons.map((reason, i) => (
              <div key={i} className={clsx("flex items-start gap-2.5 p-3 rounded-lg text-sm font-mono", reasonBg)}>
                <ChevronRight className={clsx("w-3.5 h-3.5 mt-0.5 shrink-0", chevronColor)} />
                <span style={{ color: "#e8eaf0" }} className="text-xs">{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSafe && result.reasons.length === 0 && (
        <div className="p-3 rounded-lg bg-neon-green/5 border border-neon-green/10 text-neon-green text-xs font-mono">
          ✓ No phishing indicators detected. URL appears legitimate.
        </div>
      )}
    </div>
  );
}

export default function URLScanPage() {
  const [url, setUrl]       = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (u: string) => scanApi.url(u).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Scan complete: ${data.label}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Scan failed");
    },
  });

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-neon-cyan" />
          <span className="text-neon-cyan font-mono text-xs uppercase tracking-widest">URL Analysis</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-text-primary">URL Phishing Scanner</h1>
        <p className="text-text-secondary font-mono text-sm mt-1">
          RandomForest ML model • Real-time analysis • 95%+ accuracy
        </p>
      </div>

      <div className="cyber-card p-6">
        <div className="scanner-line" />
        <label className="block text-text-secondary text-xs font-mono uppercase tracking-wider mb-3">
          Enter URL to analyze
        </label>
        <div className="flex gap-3">
          <input
            type="url"
            className="scan-input flex-1"
            placeholder="https://example.com/login?redirect=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && url && mutate(url)}
          />
          <button
            className="btn-cyber px-6 shrink-0"
            onClick={() => mutate(url)}
            disabled={!url || isPending}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {[
            "http://login-paypal-secure.xyz/account",
            "https://google.com",
            "http://192.168.1.1/verify-account-now",
          ].map((sample) => (
            <button
              key={sample}
              onClick={() => setUrl(sample)}
              className="text-xs font-mono text-text-secondary border border-cyber-border px-2 py-1 rounded hover:border-neon-cyan/30 hover:text-neon-cyan transition-all"
            >
              {sample.slice(0, 35)}...
            </button>
          ))}
        </div>
      </div>

      {isPending && (
        <div className="cyber-card p-8 mt-6 text-center">
          <div className="scanner-line" />
          <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mx-auto mb-3" />
          <div className="text-neon-cyan font-mono text-sm">Analyzing URL...</div>
          <div className="text-text-secondary font-mono text-xs mt-1">Extracting features · Running ML model</div>
        </div>
      )}

      {result && !isPending && <ResultCard result={result} />}
    </div>
  );
}
