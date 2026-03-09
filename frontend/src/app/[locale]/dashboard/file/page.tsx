"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileSearch, Upload, CheckCircle, Loader2, AlertTriangle, FileText } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { scanApi } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

export default function FileScanPage() {
  const t = useTranslations("scan.file");
  const [result, setResult] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (f: File) => scanApi.file(f).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      toast.success({t("uploadSuccess")});
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Upload failed");
    },
  });

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
      setResult(null);
    }
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

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <FileSearch className="w-4 h-4" style={{ color: "#bf5af2" }} />
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: "#bf5af2" }}>File Analysis</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-text-primary">File Content Scanner</h1>
        <p className="text-text-secondary font-mono text-sm mt-1">
          AES-256 encrypted storage · Background scanning · URL & message extraction
        </p>
      </div>

      {/* Drop zone */}
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
            <div className="text-xs font-mono" style={{ color: "#bf5af2" }}>
              Click or drop to replace
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyber-dark border border-cyber-border flex items-center justify-center">
              <Upload className="w-6 h-6 text-text-secondary" />
            </div>
            <div>
              <div className="text-text-primary font-mono text-sm mb-1">
                {isDragActive ? "Drop file here..." : "Drag & drop or click to upload"}
              </div>
              <div className="text-text-secondary text-xs font-mono">
                .pdf · .docx · .xlsx · .zip · .txt · .html · .csv · .json · Max 10MB
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          { label: "Encrypted at rest", desc: "AES-256-CBC" },
          { label: "Deep analysis",     desc: "PDF, DOCX, ZIP, HTML" },
          { label: "Threat detection",  desc: "URLs · macros · payloads" },
        ].map((item) => (
          <div key={item.label} className="cyber-card p-3 text-center">
            <div className="text-text-primary text-xs font-mono">{item.label}</div>
            <div className="text-text-secondary text-xs font-mono opacity-60 mt-0.5">{item.desc}</div>
          </div>
        ))}
      </div>

      {/* Submit */}
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
            "→  Scan File"
          )}
        </button>
      )}

      {/* Result */}
      {result && (
        <div className="cyber-card p-6 mt-6 border-l-4" style={{ borderLeftColor: "#bf5af2" }}>
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-6 h-6" style={{ color: "#bf5af2" }} />
            <div>
              <div className="font-display font-bold text-text-primary">{result.filename}</div>
              <div className="text-text-secondary text-xs font-mono">File ID: {result.file_id}</div>
            </div>
          </div>

          <div className="p-3 rounded-lg font-mono text-xs" style={{ background: "rgba(191,90,242,0.08)", border: "1px solid rgba(191,90,242,0.2)", color: "#bf5af2" }}>
            {result.message}
          </div>

          <div className="mt-4 text-text-secondary text-xs font-mono flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Background scan running — check Scan History for results
          </div>
        </div>
      )}
    </div>
  );
}
