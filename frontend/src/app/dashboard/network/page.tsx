"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network, Wifi, Monitor, Smartphone, Printer, Server,
  Router, HelpCircle, RefreshCw, Shield, AlertTriangle,
  CheckCircle, Clock, Info, Cpu, Camera, Tv, Box,
  GitBranch, Terminal, Key, ChevronDown, ChevronUp,
} from "lucide-react";
import { threatApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Device {
  ip: string;
  mac: string;
  hostname: string;
  vendor: string;
  device_type: string;
  is_gateway: boolean;
  is_this_machine: boolean;
  status: string;
  scan_method: string;
  open_ports: number[];
}

interface ScanResponse {
  devices: Device[];
  total: number;
  scan_mode:
    | "arp_full"
    | "arp_kernel"
    | "tcp_probe"
    | "self_only"
    | "container"
    | "error";
  error_type: string | null;
  scanned_subnet: string | null;
  interface: string | null;
  total_hosts_probed: number;
  duration_seconds: number;
  scanned_at: string;
  permission_required: boolean;
  instructions: string | null;
}

// ── Scan mode config ──────────────────────────────────────────────────────────

const MODE_CFG = {
  arp_full: {
    label: "Full ARP Scan",
    color: "#00ff88",
    Icon: CheckCircle,
    desc: "Complete discovery — every device on the subnet with MAC address",
  },
  arp_kernel: {
    label: "Kernel ARP Cache",
    color: "#00f5ff",
    Icon: Info,
    desc: "Devices from /proc/net/arp — only recently-communicated hosts visible",
  },
  tcp_probe: {
    label: "TCP Probe Mode",
    color: "#ffd60a",
    Icon: Network,
    desc: "Port-based discovery — no MAC addresses (root required for full scan)",
  },
  self_only: {
    label: "Limited — Self Only",
    color: "#ff6b35",
    Icon: AlertTriangle,
    desc: "Only this machine reported — see instructions below",
  },
  container: {
    label: "Container Environment",
    color: "#ff6b35",
    Icon: Box,
    desc: "Running inside a container — no LAN broadcast domain available",
  },
  error: {
    label: "Scan Error",
    color: "#ff2d55",
    Icon: AlertTriangle,
    desc: "Scanner encountered an unexpected error",
  },
} as const;

// ── Device icon ───────────────────────────────────────────────────────────────

function DeviceIcon({
  type,
  vendor,
  isGateway,
}: {
  type: string;
  vendor: string;
  isGateway: boolean;
}) {
  const t = (type + " " + vendor).toLowerCase();
  const cls = "w-5 h-5";
  if (isGateway || t.includes("router") || t.includes("gateway"))
    return <Router className={cls} style={{ color: "#00f5ff" }} />;
  if (t.includes("this machine") || t.includes("backend"))
    return <Shield className={cls} style={{ color: "#00f5ff" }} />;
  if (t.includes("mac computer") || t.includes("macbook"))
    return <Monitor className={cls} style={{ color: "#e8eaf0" }} />;
  if (t.includes("iphone") || t.includes("ipad") || t.includes("android") || t.includes("mobile"))
    return <Smartphone className={cls} style={{ color: "#bf5af2" }} />;
  if (t.includes("printer"))
    return <Printer className={cls} style={{ color: "#ffd60a" }} />;
  if (t.includes("server") || t.includes("nas"))
    return <Server className={cls} style={{ color: "#ff6b35" }} />;
  if (t.includes("camera"))
    return <Camera className={cls} style={{ color: "#ff2d55" }} />;
  if (t.includes("tv") || t.includes("chromecast") || t.includes("roku"))
    return <Tv className={cls} style={{ color: "#00ff88" }} />;
  if (t.includes("raspberry"))
    return <Cpu className={cls} style={{ color: "#ff6b35" }} />;
  if (t.includes("network") || t.includes("cisco") || t.includes("ubiquiti"))
    return <GitBranch className={cls} style={{ color: "#00f5ff" }} />;
  if (t.includes("virtual") || t.includes("vmware"))
    return <Box className={cls} style={{ color: "#8892b0" }} />;
  if (t.includes("windows") || t.includes("laptop") || t.includes("computer"))
    return <Monitor className={cls} style={{ color: "#00ff88" }} />;
  if (t.includes("apple"))
    return <Monitor className={cls} style={{ color: "#e8eaf0" }} />;
  return <HelpCircle className={cls} style={{ color: "#8892b0" }} />;
}

// ── Radar animation ───────────────────────────────────────────────────────────

function Radar() {
  return (
    <div className="flex flex-col items-center py-20 gap-6">
      <div className="relative" style={{ width: 120, height: 120 }}>
        {/* Static rings */}
        {[1, 0.67, 0.33].map((scale, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border"
            style={{
              borderColor: `rgba(0,245,255,${0.12 - i * 0.03})`,
              transform: `scale(${scale})`,
              top: `${(1 - scale) * 50}%`,
              left: `${(1 - scale) * 50}%`,
              width: `${scale * 100}%`,
              height: `${scale * 100}%`,
            }}
          />
        ))}
        {/* Spinning beam */}
        <motion.div
          className="absolute inset-0 rounded-full overflow-hidden"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 75%, rgba(0,245,255,0.30) 100%)",
              borderRadius: "50%",
            }}
          />
        </motion.div>
        {/* Centre dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            className="w-3 h-3 rounded-full"
            style={{ background: "#00f5ff" }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          />
        </div>
        {/* Blip dots */}
        {[
          { top: "22%", left: "66%", delay: 0.5 },
          { top: "65%", left: "24%", delay: 1.1 },
          { top: "74%", left: "70%", delay: 1.7 },
        ].map((pos, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{ background: "#00ff88", top: pos.top, left: pos.left }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.3, 0.4] }}
            transition={{ repeat: Infinity, duration: 2.2, delay: pos.delay }}
          />
        ))}
      </div>
      <div className="text-center">
        <p className="font-mono text-sm font-semibold mb-1" style={{ color: "#00f5ff" }}>
          Scanning local network…
        </p>
        <p className="font-mono text-xs" style={{ color: "#8892b0" }}>
          Sending ARP broadcasts · probing hosts · resolving hostnames
        </p>
      </div>
    </div>
  );
}

// ── Instructions accordion ────────────────────────────────────────────────────

function Instructions({
  text,
  permRequired,
}: {
  text: string;
  permRequired: boolean;
}) {
  const [open, setOpen] = useState(true);
  const color = permRequired ? "#ff6b35" : "#00f5ff";
  const borderColor = permRequired
    ? "rgba(255,107,53,0.3)"
    : "rgba(0,245,255,0.2)";
  const bg = permRequired
    ? "rgba(255,107,53,0.04)"
    : "rgba(0,245,255,0.03)";

  const lines = text.split("\n");

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 rounded-xl border overflow-hidden"
      style={{ borderColor, background: bg }}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <Key className="w-4 h-4 shrink-0" style={{ color }} />
        <span className="flex-1 font-mono text-xs font-semibold" style={{ color }}>
          {permRequired
            ? "Elevated privileges required for full scanning"
            : "Scan information"}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "#8892b0" }} />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "#8892b0" }} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-4 pb-4 pt-1 border-t"
              style={{ borderColor }}
            >
              <div className="mt-3 space-y-1.5">
                {lines.map((line, i) => {
                  const t = line.trim();
                  if (!t) return <div key={i} className="h-1" />;
                  if (t.startsWith("sudo") || t.startsWith("docker")) {
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs"
                        style={{
                          background: "#050810",
                          border: "1px solid #1a2540",
                          color: "#00f5ff",
                        }}
                      >
                        <Terminal className="w-3 h-3 shrink-0" style={{ color: "#8892b0" }} />
                        {t}
                      </div>
                    );
                  }
                  if (t.startsWith("•")) {
                    return (
                      <div key={i} className="flex items-start gap-2 font-mono text-xs" style={{ color: "#8892b0" }}>
                        <span style={{ color }}>•</span>
                        <span>{t.slice(1).trim()}</span>
                      </div>
                    );
                  }
                  return (
                    <p key={i} className="font-mono text-xs" style={{ color: "#8892b0" }}>
                      {t}
                    </p>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Scan mode banner ──────────────────────────────────────────────────────────

function ModeBanner({ data }: { data: ScanResponse }) {
  const cfg = MODE_CFG[data.scan_mode] ?? MODE_CFG.error;
  const { Icon } = cfg;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 rounded-xl border"
      style={{
        borderColor: `${cfg.color}30`,
        background: `${cfg.color}07`,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" style={{ color: cfg.color }} />
        <span
          className="font-mono text-xs font-semibold uppercase tracking-wider"
          style={{ color: cfg.color }}
        >
          {cfg.label}
        </span>
      </div>
      <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
        {cfg.desc}
      </span>
      <div className="ml-auto flex items-center gap-3 flex-wrap">
        {data.scanned_subnet && (
          <span
            className="font-mono text-xs px-2 py-0.5 rounded border"
            style={{
              background: "rgba(0,245,255,0.06)",
              borderColor: "rgba(0,245,255,0.18)",
              color: "#00f5ff",
            }}
          >
            {data.scanned_subnet}
          </span>
        )}
        {data.interface && (
          <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
            {data.interface}
          </span>
        )}
        <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
          {data.duration_seconds.toFixed(1)}s
        </span>
        <span
          className="font-mono text-xs font-semibold"
          style={{ color: cfg.color }}
        >
          {data.total} device{data.total !== 1 ? "s" : ""}
        </span>
      </div>
    </motion.div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ data }: { data: ScanResponse }) {
  const unknown = data.devices.filter(
    (d) => !d.is_gateway && !d.is_this_machine && d.vendor === "Unknown Vendor"
  ).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {[
        { label: "Devices Found",   value: data.total,                   color: "#00f5ff", Icon: Network    },
        { label: "Unknown Vendor",  value: unknown,                      color: "#ffd60a", Icon: HelpCircle },
        { label: "Hosts Probed",    value: data.total_hosts_probed,      color: "#8892b0", Icon: Wifi       },
        { label: "Scan Time",       value: `${data.duration_seconds.toFixed(1)}s`, color: "#8892b0", Icon: Clock, isStr: true },
      ].map(({ label, value, color, Icon: Ic, isStr }) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="cyber-card p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center border"
              style={{ background: `${color}10`, borderColor: `${color}28` }}
            >
              <Ic className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <span
              className="font-mono text-xs uppercase tracking-wider"
              style={{ color: "#8892b0" }}
            >
              {label}
            </span>
          </div>
          <div className="font-display text-2xl font-bold" style={{ color }}>
            {isStr ? value : Number(value)}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Device table row ──────────────────────────────────────────────────────────

function DeviceRow({ device, index }: { device: Device; index: number }) {
  const trusted = device.is_gateway || device.is_this_machine;
  const unknownVendor =
    !trusted && (device.vendor === "Unknown Vendor" || device.vendor.startsWith("Unknown"));

  const rowColor = device.is_this_machine
    ? "#00f5ff"
    : device.is_gateway
    ? "#00ff88"
    : unknownVendor
    ? "#ffd60a"
    : "#00f5ff";

  // status badge
  const statusLabel = trusted
    ? "Trusted"
    : unknownVendor
    ? "Unknown"
    : "Known";
  const statusColor = trusted
    ? "#00ff88"
    : unknownVendor
    ? "#ffd60a"
    : "#8892b0";

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.5) }}
      className="border-b last:border-0 hover:bg-white/[0.015] transition-colors"
      style={{ borderColor: "rgba(26,37,64,0.5)" }}
    >
      {/* Icon */}
      <td className="px-4 py-3 w-12">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center border"
          style={{
            background: `${rowColor}10`,
            borderColor: `${rowColor}28`,
          }}
        >
          <DeviceIcon
            type={device.device_type}
            vendor={device.vendor}
            isGateway={device.is_gateway}
          />
        </div>
      </td>

      {/* IP + badges */}
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: "#e8eaf0" }}
          >
            {device.ip}
          </span>
          {device.is_this_machine && (
            <span
              className="font-mono px-1.5 py-0.5 rounded border"
              style={{
                fontSize: "9px",
                color: "#00f5ff",
                borderColor: "rgba(0,245,255,0.35)",
                background: "rgba(0,245,255,0.08)",
              }}
            >
              YOU
            </span>
          )}
          {device.is_gateway && (
            <span
              className="font-mono px-1.5 py-0.5 rounded border"
              style={{
                fontSize: "9px",
                color: "#00ff88",
                borderColor: "rgba(0,255,136,0.35)",
                background: "rgba(0,255,136,0.08)",
              }}
            >
              GATEWAY
            </span>
          )}
        </div>
      </td>

      {/* MAC */}
      <td className="px-3 py-3 hidden sm:table-cell">
        <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
          {device.mac}
        </span>
      </td>

      {/* Hostname */}
      <td className="px-3 py-3 hidden md:table-cell" style={{ maxWidth: 200 }}>
        <span
          className="font-mono text-xs block truncate"
          style={{ color: "#e8eaf0", maxWidth: 200 }}
        >
          {device.hostname !== device.ip ? device.hostname : "—"}
        </span>
      </td>

      {/* Vendor */}
      <td className="px-3 py-3 hidden lg:table-cell">
        <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
          {device.vendor}
        </span>
      </td>

      {/* Device type */}
      <td className="px-3 py-3">
        <span
          className="font-mono text-xs px-2 py-1 rounded border whitespace-nowrap"
          style={{
            background: `${rowColor}08`,
            borderColor: `${rowColor}22`,
            color: rowColor,
          }}
        >
          {device.device_type}
        </span>
      </td>

      {/* Status */}
      <td className="px-3 py-3 hidden sm:table-cell whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor }}
          />
          <span className="font-mono text-xs" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>
      </td>

      {/* Open ports (TCP mode) */}
      <td className="px-3 py-3 hidden xl:table-cell">
        <div className="flex gap-1 flex-wrap">
          {device.open_ports.slice(0, 4).map((p) => (
            <span
              key={p}
              className="font-mono text-xs px-1 rounded"
              style={{
                background: "rgba(0,245,255,0.06)",
                border: "1px solid rgba(0,245,255,0.15)",
                color: "#00f5ff",
              }}
            >
              {p}
            </span>
          ))}
          {device.open_ports.length > 4 && (
            <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
              +{device.open_ports.length - 4}
            </span>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

// ── Idle state ────────────────────────────────────────────────────────────────

function IdleState({ onScan }: { onScan: () => void }) {
  return (
    <div className="cyber-card p-16 text-center">
      <motion.div
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ repeat: Infinity, duration: 3 }}
        className="mx-auto mb-6"
      >
        <Network className="w-16 h-16 mx-auto" style={{ color: "#1a2540" }} />
      </motion.div>
      <p className="font-mono text-sm mb-1" style={{ color: "#8892b0" }}>
        Ready to scan
      </p>
      <p
        className="font-mono text-xs mb-8"
        style={{ color: "#8892b0", opacity: 0.6 }}
      >
        Click "Start Scan" to discover devices on your local network
      </p>
      <button
        onClick={onScan}
        className="mx-auto flex items-center gap-2 px-6 py-2.5 rounded-xl font-mono text-sm border transition-all"
        style={{
          background: "rgba(0,245,255,0.1)",
          borderColor: "rgba(0,245,255,0.35)",
          color: "#00f5ff",
        }}
      >
        <Network className="w-4 h-4" />
        Start Scan
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NetworkScannerPage() {
  const [triggered, setTriggered] = useState(false);

  const { data, isFetching, refetch } = useQuery<ScanResponse>({
    queryKey: ["network-scan"],
    queryFn: () => threatApi.networkScan().then((r) => r.data),
    enabled: false,      // only run on demand
    staleTime: Infinity, // never auto-refetch
    retry: 0,
  });

  const handleScan = useCallback(() => {
    setTriggered(true);
    refetch();
  }, [refetch]);

  const lastScanTime = data?.scanned_at
    ? new Date(data.scanned_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="p-6 max-w-6xl">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <motion.div
            animate={isFetching ? { rotate: 360 } : {}}
            transition={
              isFetching
                ? { repeat: Infinity, duration: 3, ease: "linear" }
                : { duration: 0 }
            }
          >
            <Network className="w-4 h-4" style={{ color: "#00f5ff" }} />
          </motion.div>
          <span
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: "#00f5ff" }}
          >
            Network Discovery
          </span>
          {data?.scan_mode === "arp_full" && !isFetching && (
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-1.5 h-1.5 rounded-full ml-1"
              style={{ background: "#00ff88" }}
            />
          )}
        </div>
        <h1
          className="font-display text-2xl font-bold"
          style={{ color: "#e8eaf0" }}
        >
          Network Scanner
        </h1>
        <p className="font-mono text-sm mt-1" style={{ color: "#8892b0" }}>
          ARP-based local network discovery · detect devices · identify
          unknowns
        </p>
      </div>

      {/* ── Control card ────────────────────────────────────────────────── */}
      <div className="cyber-card p-5 mb-6">
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <p
              className="font-mono text-sm font-semibold mb-1"
              style={{ color: "#e8eaf0" }}
            >
              Local Network Scan
            </p>
            <p
              className="font-mono text-xs leading-relaxed"
              style={{ color: "#8892b0" }}
            >
              Sends ARP broadcast frames to every host in your subnet. Falls
              back to kernel ARP cache or TCP probing if raw sockets are
              unavailable. Root/sudo unlocks full ARP scanning with MAC
              addresses.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {lastScanTime && !isFetching && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: "#8892b0" }} />
                <span
                  className="font-mono text-xs"
                  style={{ color: "#8892b0" }}
                >
                  {lastScanTime}
                </span>
              </div>
            )}
            <button
              onClick={handleScan}
              disabled={isFetching}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-sm border transition-all disabled:opacity-60"
              style={{
                background: isFetching
                  ? "rgba(0,245,255,0.05)"
                  : "rgba(0,245,255,0.1)",
                borderColor: "rgba(0,245,255,0.35)",
                color: "#00f5ff",
              }}
            >
              {isFetching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <Network className="w-4 h-4" />
                  {triggered ? "Rescan" : "Start Scan"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Strategy ladder */}
        <div
          className="mt-4 pt-4 border-t flex flex-wrap gap-x-6 gap-y-1"
          style={{ borderColor: "#1a2540" }}
        >
          {[
            { n: "①", text: "Raw ARP broadcast (root + ethernet/WiFi)", color: "#00ff88" },
            { n: "②", text: "Kernel ARP cache /proc/net/arp", color: "#00f5ff" },
            { n: "③", text: "TCP connect probe (no root, no MACs)", color: "#ffd60a" },
            { n: "④", text: "Interface self-report (always succeeds)", color: "#8892b0" },
          ].map(({ n, text, color }) => (
            <div key={n} className="flex items-center gap-1.5">
              <span
                className="font-mono text-xs font-bold"
                style={{ color }}
              >
                {n}
              </span>
              <span className="font-mono text-xs" style={{ color: "#8892b0" }}>
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {/* Scanning */}
        {isFetching && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="cyber-card overflow-hidden">
              <Radar />
            </div>
          </motion.div>
        )}

        {/* Results */}
        {!isFetching && data && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Mode banner */}
            <ModeBanner data={data} />

            {/* Instructions */}
            {data.instructions && (
              <Instructions
                text={data.instructions}
                permRequired={data.permission_required}
              />
            )}

            {/* Summary cards */}
            {data.total > 0 && <SummaryCards data={data} />}

            {/* Table or empty */}
            {data.total === 0 ? (
              <div className="cyber-card p-10 text-center">
                <Network
                  className="w-8 h-8 mx-auto mb-3"
                  style={{ color: "#8892b0" }}
                />
                <p
                  className="font-mono text-sm"
                  style={{ color: "#8892b0" }}
                >
                  No devices found.
                </p>
                <p
                  className="font-mono text-xs mt-1"
                  style={{ color: "#8892b0", opacity: 0.6 }}
                >
                  Check the instructions above for how to enable scanning.
                </p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="cyber-card overflow-hidden"
              >
                {/* Table header */}
                <div
                  className="flex items-center gap-2 px-4 py-2.5 border-b"
                  style={{
                    borderColor: "#1a2540",
                    background: "rgba(5,8,16,0.7)",
                  }}
                >
                  <span
                    className="font-mono text-xs uppercase tracking-wider"
                    style={{ color: "#8892b0" }}
                  >
                    {data.total} device{data.total !== 1 ? "s" : ""} discovered
                  </span>
                  {data.scan_mode === "arp_full" && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "#00ff88" }}
                      />
                      <span
                        className="font-mono text-xs"
                        style={{ color: "#00ff88" }}
                      >
                        ARP verified
                      </span>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "rgba(5,8,16,0.4)" }}>
                        {[
                          { label: "",            cls: "w-14 px-4" },
                          { label: "IP Address",  cls: "px-3" },
                          { label: "MAC",         cls: "px-3 hidden sm:table-cell" },
                          { label: "Hostname",    cls: "px-3 hidden md:table-cell" },
                          { label: "Vendor",      cls: "px-3 hidden lg:table-cell" },
                          { label: "Device",      cls: "px-3" },
                          { label: "Status",      cls: "px-3 hidden sm:table-cell" },
                          { label: "Ports",       cls: "px-3 hidden xl:table-cell" },
                        ].map(({ label, cls }) => (
                          <th
                            key={label || "_icon"}
                            className={`py-2.5 text-left font-mono text-xs uppercase tracking-wider ${cls}`}
                            style={{
                              color: "#8892b0",
                              borderBottom: "1px solid #1a2540",
                            }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.devices.map((d, i) => (
                        <DeviceRow key={d.ip} device={d} index={i} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-t"
                  style={{
                    borderColor: "#1a2540",
                    background: "rgba(5,8,16,0.5)",
                  }}
                >
                  <div
                    className="flex items-center gap-4 flex-wrap font-mono text-xs"
                    style={{ color: "#8892b0" }}
                  >
                    <span>
                      Subnet:{" "}
                      <span style={{ color: "#00f5ff" }}>
                        {data.scanned_subnet ?? "N/A"}
                      </span>
                    </span>
                    <span>
                      Interface:{" "}
                      <span style={{ color: "#e8eaf0" }}>
                        {data.interface ?? "N/A"}
                      </span>
                    </span>
                    <span>
                      Probed:{" "}
                      <span style={{ color: "#e8eaf0" }}>
                        {data.total_hosts_probed} hosts
                      </span>
                    </span>
                  </div>
                  <span
                    className="font-mono text-xs"
                    style={{ color: "#8892b0" }}
                  >
                    {data.duration_seconds.toFixed(2)}s
                  </span>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Idle */}
        {!isFetching && !data && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <IdleState onScan={handleScan} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── How it works ────────────────────────────────────────────────── */}
      {data && data.total > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-5 p-4 rounded-xl border"
          style={{
            borderColor: "rgba(0,245,255,0.08)",
            background: "rgba(0,245,255,0.02)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <Info
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: "#00f5ff" }}
            />
            <p
              className="font-mono text-xs leading-relaxed"
              style={{ color: "#8892b0" }}
            >
              <span
                className="font-semibold"
                style={{ color: "#00f5ff" }}
              >
                How it works —{" "}
              </span>
              The scanner sends ARP (Address Resolution Protocol) broadcast
              packets to every IP in your subnet. Devices that reply reveal
              their MAC address, which is used to identify the hardware vendor
              via an embedded OUI table. Hostnames are resolved via reverse
              DNS. Device type is classified using hostname keywords, vendor
              name, and open port fingerprints. Devices labelled{" "}
              <span style={{ color: "#ffd60a" }}>Unknown</span> have no
              vendor entry — these may be unrecognised IoT devices or
              unauthorised hosts and should be investigated.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
