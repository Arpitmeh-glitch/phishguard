"use client";
import { useState } from "react";
import { Globe, Shield, AlertTriangle, CheckCircle, ChevronRight, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { scanApi } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

interface ScanResult {
  scan_id: string;
  label: string;
  confidence: number;
  reasons: string[];
  detection_mode: string;
  created_at: string;
}

function ResultCard({ result }: { result: ScanResult }) {
  const isPhishing = result.label === "PHISHING";
  const conf = Math.round(result.confidence * 100);

  return (
    <div className={clsx(
      "cyber-card p-6 mt-6 border-l-4",
      isPhishing ? "border-l-neon-red" : "border-l-neon-green"
    )}>
      {/* Verdict */}
      <div className="flex items-center gap-4 mb-5">
        <div className={clsx(
          "w-12 h-12 rounded-xl flex items-center justify-center border",
          isPhishing
            ? "bg-neon-red/10 border-neon-red/30"
            : "bg-neon-green/10 border-neon-green/30"
        )}>
          {isPhishing
            ? <AlertTriangle className="w-6 h-6 text-neon-red" />
            : <CheckCircle className="w-6 h-6 text-neon-green" />
          }
        </div>
        <div>
          <div className={clsx(
            "font-display text-2xl font-bold",
            isPhishing ? "text-neon-red" : "text-neon-green"
          )}>
            {result.label}
          </div>
          <div className="text-text-secondary text-xs font-mono">
            Mode: {result.detection_mode}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className={clsx(
            "font-display text-3xl font-bold",
            isPhishing ? "text-neon-red" : "text-neon-green"
          )}>
            {conf}%
          </div>
          <div className="text-text-secondary text-xs font-mono">confidence</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="progress-bar mb-5">
        <div
          className="progress-fill"
          style={{
            width: `${conf}%`,
            background: isPhishing
              ? "linear-gradient(90deg, #ff2d55, #ff6b88)"
              : "linear-gradient(90deg, #00ff88, #00ffaa)",
          }}
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
              <div key={i} className={clsx(
                "flex items-start gap-2.5 p-3 rounded-lg text-sm font-mono",
                isPhishing ? "bg-neon-red/5 border border-neon-red/10" : "bg-neon-green/5 border border-neon-green/10"
              )}>
                <ChevronRight className={clsx("w-3.5 h-3.5 mt-0.5 shrink-0", isPhishing ? "text-neon-red" : "text-neon-green")} />
                <span style={{ color: "#e8eaf0" }} className=" text-xs">{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.label === "SAFE" && result.reasons.length === 0 && (
        <div className="p-3 rounded-lg bg-neon-green/5 border border-neon-green/10 text-neon-green text-xs font-mono">
          ✓ No phishing indicators detected. URL appears legitimate.
        </div>
      )}
    </div>
  );
}

export default function URLScanPage() {
  const [url, setUrl] = useState("");
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
