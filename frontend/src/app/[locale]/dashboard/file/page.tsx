"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Bug, Upload, FileText, AlertTriangle, Loader2,
  ShieldCheck, ShieldAlert, ShieldX,
  ChevronDown, ChevronUp, AlertCircle, Info, Link2,
  MessageSquareWarning, Zap, ScanLine,
  FlaskConical, Microscope, BrainCircuit,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanLabel = "SAFE" | "SUSPICIOUS" | "PHISHING" | "FRAUD";

interface ScanStatusData {
  file_id: string;
  status: "pending" | "processing" | "done" | "error";
  progress: number;
  message: string;
  // Populated only when status === "done"
  result_label?: ScanLabel;
  result_reasons?: string[];
  confidence?: number;
  threats_found?: number;
  urls_found?: number;
  messages_found?: number;
}

// ─── Finding severity classifier ──────────────────────────────────────────────
//
// Tier system (highest wins):
//   CRITICAL  — malware-grade: VT hit, executable in archive, macro, base64
//               payload, high entropy (packed/encrypted binary indicator)
//   DANGER    — known-bad patterns: JS in PDF, phishing, fraud, launch action
//   WARNING   — elevated risk: suspicious keywords, embedded objects, AI flag
//   OK        — explicit clean verdict
//   INFO      — everything else

type FindingTier = "critical" | "danger" | "warning" | "ok" | "info";

const CRITICAL_TERMS = [
  "virustotal",
  "executable",
  "macro",
  "vba",
  "base64 payload",
  "high entropy",
  "packed",
  "encrypted payload",
  "malicious engine",
];

const DANGER_TERMS = [
  "malicious",
  "javascript",
  "launch action",
  "phishing",
  "fraud",
  "/js ",
  "auto-open",
  "obfuscat",
];

const WARNING_TERMS = [
  "suspicious",
  "high risk",
  "high-risk",
  "embedded",
  "uri object",
  "[ai]",
  "credit card",
  "wire transfer",
  "bitcoin",
];

function classifyFinding(text: string): FindingTier {
  const t = text.toLowerCase();

  // ── Safe-verdict guard — checked FIRST, before any keyword scan ──────────
  // The backend emits "File is clean: No suspicious content, macros, or
  // dangerous URLs detected." which contains "macros" and would otherwise
  // trip the CRITICAL path.  Any string that explicitly states the file is
  // clean must short-circuit here and never be reclassified by later terms.
  if (
    t.startsWith("file is clean") ||
    t.includes("no suspicious content") ||
    t.includes("no threats detected")
  ) return "ok";

  if (CRITICAL_TERMS.some((k) => t.includes(k))) return "critical";
  if (DANGER_TERMS.some((k) => t.includes(k)))   return "danger";
  if (WARNING_TERMS.some((k) => t.includes(k)))  return "warning";
  if (t.includes("clean") || t.includes("no suspicious") || t.includes("safe")) return "ok";
  return "info";
}

// Icon per tier
const FINDING_ICON: Record<FindingTier, React.ReactNode> = {
  critical: <Bug          className="w-3.5 h-3.5 flex-shrink-0 text-red-400"    />,
  danger:   <ShieldX      className="w-3.5 h-3.5 flex-shrink-0 text-red-400"    />,
  warning:  <AlertCircle  className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />,
  ok:       <ShieldCheck  className="w-3.5 h-3.5 flex-shrink-0 text-green-400"  />,
  info:     <Info         className="w-3.5 h-3.5 flex-shrink-0 text-blue-400"   />,
};

// Row background tint per tier
const FINDING_ROW_CLASS: Record<FindingTier, string> = {
  critical: "border-red-500/25 bg-red-500/[0.07]",
  danger:   "border-red-400/20 bg-red-400/[0.05]",
  warning:  "border-yellow-400/20 bg-yellow-400/[0.05]",
  ok:       "border-green-400/20 bg-green-400/[0.05]",
  info:     "border-white/5 bg-white/[0.03]",
};

// Text colour per tier
const FINDING_TEXT_CLASS: Record<FindingTier, string> = {
  critical: "text-red-300 font-semibold",
  danger:   "text-red-300",
  warning:  "text-yellow-300",
  ok:       "text-green-300",
  info:     "text-blue-300",
};

// Severity badge label (only shown for critical / danger)
const FINDING_BADGE: Partial<Record<FindingTier, { label: string; cls: string }>> = {
  critical: { label: "CRITICAL", cls: "bg-red-500/20 text-red-300 border border-red-500/30" },
  danger:   { label: "HIGH",     cls: "bg-red-400/15 text-red-300 border border-red-400/25" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Verdict banner shown when scan is done */
function VerdictBanner({ label, confidence }: { label: ScanLabel; confidence?: number }) {
  const configs = {
    SAFE: {
      bg: "bg-green-500/10", border: "border-green-500/40",
      glow: "shadow-[0_0_28px_rgba(34,197,94,0.18)]", textColor: "text-green-400",
      Icon: ShieldCheck,
      headline: "No Threats Detected",
      sub: "Static analysis, entropy checks, and VirusTotal all returned clean.",
    },
    SUSPICIOUS: {
      bg: "bg-yellow-500/10", border: "border-yellow-500/40",
      glow: "shadow-[0_0_28px_rgba(234,179,8,0.18)]", textColor: "text-yellow-400",
      Icon: ShieldAlert,
      headline: "Suspicious Indicators Found",
      sub: "One or more heuristics triggered. Review findings before opening.",
    },
    PHISHING: {
      bg: "bg-red-500/10", border: "border-red-500/40",
      glow: "shadow-[0_0_28px_rgba(239,68,68,0.20)]", textColor: "text-red-400",
      Icon: Bug,
      headline: "Malware / Phishing Detected",
      sub: "Active threat signatures confirmed. Do not execute or open this file.",
    },
    FRAUD: {
      bg: "bg-red-500/10", border: "border-red-500/40",
      glow: "shadow-[0_0_28px_rgba(239,68,68,0.20)]", textColor: "text-red-400",
      Icon: ShieldX,
      headline: "Fraudulent Content Detected",
      sub: "File contains deceptive or social-engineering content.",
    },
  } as const;

  const c = configs[label] ?? configs.SAFE;
  const { Icon } = c;

  return (
    <div className={clsx("cyber-card p-5 border", c.bg, c.border, c.glow)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={clsx("p-2.5 rounded-xl border", c.bg, c.border)}>
            <Icon className={clsx("w-6 h-6", c.textColor)} />
          </div>
          <div>
            <div className={clsx("font-display font-bold text-lg leading-tight", c.textColor)}>
              {c.headline}
            </div>
            <div className="text-text-secondary font-mono text-xs mt-0.5">{c.sub}</div>
          </div>
        </div>
        {confidence !== undefined && (
          <div className="text-right flex-shrink-0">
            <div className={clsx("font-display font-bold text-xl tabular-nums", c.textColor)}>
              {Math.round(confidence * 100)}%
            </div>
            <div className="text-text-secondary font-mono text-xs">confidence</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Stat chips row */
function StatChips({ urlsFound, messagesFound, threatsFound }: {
  urlsFound: number; messagesFound: number; threatsFound: number;
}) {
  const chips = [
    { icon: <Link2 className="w-3 h-3" />, label: "URLs scanned", value: urlsFound, accent: "text-purple-400" },
    { icon: <MessageSquareWarning className="w-3 h-3" />, label: "Messages analysed", value: messagesFound, accent: "text-blue-400" },
    { icon: <Zap className="w-3 h-3" />, label: "Threats found", value: threatsFound, accent: threatsFound > 0 ? "text-red-400" : "text-green-400" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {chips.map((chip) => (
        <div key={chip.label} className="cyber-card p-3 text-center">
          <div className={clsx("flex items-center justify-center gap-1 mb-0.5", chip.accent)}>
            {chip.icon}
            <span className="font-display font-bold text-base tabular-nums">{chip.value}</span>
          </div>
          <div className="text-text-secondary font-mono text-xs">{chip.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Expandable "Detailed Analysis" accordion with severity-parsed findings */
function DetailsAccordion({ reasons }: { reasons: string[] }) {
  const [open, setOpen] = useState(false);

  // Count findings per tier for the header summary badge
  const tierCounts = reasons.reduce<Record<FindingTier, number>>(
    (acc, r) => { acc[classifyFinding(r)]++; return acc; },
    { critical: 0, danger: 0, warning: 0, ok: 0, info: 0 }
  );
  const hasCritical = tierCounts.critical > 0;
  const hasDanger   = !hasCritical && tierCounts.danger > 0;

  return (
    <div className="cyber-card overflow-hidden border border-cyber-border">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-white/5 transition-colors duration-150"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-sm font-semibold text-text-primary tracking-wide">
            Detailed Analysis
          </span>
          {/* Critical/high count chip */}
          {hasCritical && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
              {tierCounts.critical} CRITICAL
            </span>
          )}
          {hasDanger && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-red-400/15 text-red-300 border border-red-400/25">
              {tierCounts.danger} HIGH
            </span>
          )}
          <span className="font-mono text-[10px] text-text-secondary opacity-50">
            {reasons.length} finding{reasons.length !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-text-secondary ml-2 flex-shrink-0">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {/* Body */}
      <div
        className={clsx(
          "transition-all duration-300 ease-in-out overflow-hidden",
          open ? "max-h-[640px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="border-t border-cyber-border px-5 py-4 space-y-2">
          {reasons.length === 0 ? (
            <p className="font-mono text-xs text-text-secondary italic">No findings recorded.</p>
          ) : (
            reasons.map((reason, idx) => {
              const tier  = classifyFinding(reason);
              const badge = FINDING_BADGE[tier];
              return (
                <div
                  key={idx}
                  className={clsx(
                    "flex items-start gap-2.5 rounded-md px-3 py-2 border",
                    FINDING_ROW_CLASS[tier]
                  )}
                >
                  <span className="mt-0.5">{FINDING_ICON[tier]}</span>
                  <span className={clsx("font-mono text-xs leading-relaxed flex-1", FINDING_TEXT_CLASS[tier])}>
                    {reason}
                  </span>
                  {badge && (
                    <span className={clsx("font-mono text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 uppercase tracking-wider", badge.cls)}>
                      {badge.label}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Full inline result panel */
function ScanResultPanel({ scanStatus }: { scanStatus: ScanStatusData }) {
  const label   = (scanStatus.result_label ?? "SAFE") as ScanLabel;
  const reasons = scanStatus.result_reasons ?? [];
  return (
    <div className="mt-6 space-y-3">
      <VerdictBanner label={label} confidence={scanStatus.confidence} />
      <StatChips
        urlsFound={scanStatus.urls_found ?? 0}
        messagesFound={scanStatus.messages_found ?? 0}
        threatsFound={scanStatus.threats_found ?? 0}
      />
      <DetailsAccordion reasons={reasons} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FileScanPage() {
  const t = useTranslations("scan.file");
  const [result, setResult] = useState<any>(null);
  const [file,   setFile]   = useState<File | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (f: File) => scanApi.file(f).then((r) => r.data),
    onSuccess: (data) => { setResult(data); toast.success(t("uploadSuccess")); },
    onError: (err: any) => { toast.error(err?.response?.data?.detail || "Upload failed"); },
  });

  const { data: scanStatus } = useQuery<ScanStatusData>({
    queryKey: ["fileStatus", result?.file_id],
    queryFn: () => scanApi.fileStatus(result.file_id).then((res) => res.data),
    enabled: !!result?.file_id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === "done" || status === "error") ? false : 1000;
    },
  });

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) { setFile(accepted[0]); setResult(null); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 10 * 1024 * 1024,
    accept: {
      "text/plain":        [".txt"],
      "text/html":         [".html", ".htm"],
      "text/csv":          [".csv"],
      "application/json":  [".json"],
      "message/rfc822":    [".eml"],
      "application/pdf":   [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/zip":   [".zip"],
    },
  });

  const progress   = scanStatus?.progress ?? 0;
  const isDone     = scanStatus?.status === "done";
  const isError    = scanStatus?.status === "error";
  const isScanning = !!result && !isDone && !isError;
  const statusMsg  = scanStatus?.message ?? "Initializing sandbox...";

  return (
    <div className="p-8 max-w-3xl">

      {/* ── Hero header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <ScanLine className="w-4 h-4" style={{ color: "#bf5af2" }} />
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: "#bf5af2" }}>
            Malware Sandbox
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Malware &amp; Phishing Sandbox
        </h1>
        <p className="text-text-secondary font-mono text-sm mt-1">
          VirusTotal integration · Zero-day payload detection · Macro &amp; entropy analysis
        </p>
      </div>

      {/* ── Drop zone ── */}
      {!isDone && (
        <div
          {...getRootProps()}
          className={clsx(
            "cyber-card p-10 text-center cursor-pointer transition-all duration-200 border-dashed",
            isDragActive
              ? "border-purple-400/60 bg-purple-400/5"
              : file
              ? "border-purple-400/30 bg-purple-400/5"
              : "border-cyber-border hover:border-purple-400/40"
          )}
        >
          <input {...getInputProps()} />
          <div className="scanner-line" />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-400/10 border border-purple-400/30 flex items-center justify-center">
                <FileText className="w-6 h-6" style={{ color: "#bf5af2" }} />
              </div>
              <div>
                <div className="text-text-primary font-mono text-sm">{file.name}</div>
                <div className="text-text-secondary text-xs font-mono mt-1">
                  {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
                </div>
              </div>
              {!result && (
                <div className="text-xs font-mono" style={{ color: "#bf5af2" }}>
                  Click or drop to replace
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-cyber-dark border border-cyber-border flex items-center justify-center">
                <Upload className="w-6 h-6 text-text-secondary" />
              </div>
              <div>
                <div className="text-text-primary font-mono text-sm mb-1">
                  {isDragActive ? "Drop file to detonate..." : "Drag & drop or click to upload"}
                </div>
                <div className="text-text-secondary text-xs font-mono">
                  .pdf · .docx · .xlsx · .zip · .txt · .html · .csv · .json · Max 10MB
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Capability cards ── */}
      {!result && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            {
              Icon:  FlaskConical,
              label: "Static Analysis",
              desc:  "SHA-256 · VT hash lookup · entropy scoring",
            },
            {
              Icon:  Microscope,
              label: "Deep Inspection",
              desc:  "Macros · EXEs in ZIP · base64 payloads",
            },
            {
              Icon:  BrainCircuit,
              label: "AI Threat Eval",
              desc:  "LLM classification of extracted strings",
            },
          ].map(({ Icon, label, desc }) => (
            <div key={label} className="cyber-card p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: "#bf5af2" }} />
                <div className="text-text-primary text-xs font-mono">{label}</div>
              </div>
              <div className="text-text-secondary text-xs font-mono opacity-60">{desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Submit ── */}
      {file && !result && (
        <button
          className="btn-cyber w-full py-3.5 mt-5 text-sm"
          style={{ borderColor: "rgba(191,90,242,0.4)", color: "#bf5af2" }}
          onClick={() => mutate(file)}
          disabled={isPending}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Uploading & Encrypting...
            </span>
          ) : (
            "→  Detonate in Sandbox"
          )}
        </button>
      )}

      {/* ── Progress tracker ── */}
      {result && isScanning && (
        <div
          className={clsx(
            "cyber-card p-6 mt-6 border-l-4 transition-colors duration-300",
            isError ? "border-l-red-500" : "border-l-purple-500"
          )}
        >
          <div className="flex items-center gap-3 mb-4">
            {isError ? (
              <AlertTriangle className="w-6 h-6 text-red-500" />
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            )}
            <div>
              <div className="font-display font-bold text-text-primary">
                {isError ? "Sandbox Error" : "Detonating in Sandbox…"}
              </div>
              <div className="text-text-secondary text-xs font-mono">File ID: {result.file_id}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className={clsx(isError ? "text-red-400" : "text-text-secondary")}>
                {statusMsg}
              </span>
              <span style={{ color: "#bf5af2" }}>{progress}%</span>
            </div>
            <div className="w-full bg-cyber-dark rounded-full h-1.5 overflow-hidden border border-cyber-border">
              <div
                className={clsx(
                  "h-1.5 transition-all duration-500 ease-out",
                  isError ? "bg-red-500" : "bg-purple-500"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Inline result panel ── */}
      {isDone && scanStatus && (
        <>
          <div className="flex items-center gap-2 mt-6 mb-1 px-1">
            <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#bf5af2" }} />
            <span className="font-mono text-xs text-text-secondary truncate">
              {file?.name ?? result.filename ?? "Uploaded file"}
            </span>
            <span className="font-mono text-xs text-text-secondary opacity-40 flex-shrink-0">
              · {result.file_id?.slice(0, 8)}…
            </span>
          </div>

          <ScanResultPanel scanStatus={scanStatus} />

          <button
            className="btn-cyber w-full py-3 mt-4 text-xs font-mono"
            style={{ borderColor: "rgba(191,90,242,0.25)", color: "#bf5af2" }}
            onClick={() => { setResult(null); setFile(null); }}
          >
            ↩  Submit another sample
          </button>
        </>
      )}
    </div>
  );
}
