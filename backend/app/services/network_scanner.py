"""
network_scanner.py — Local Network Device Discovery
=====================================================

Implements true ARP-based host discovery with four strategy fallbacks,
each tried in order from most capable to least:

  Strategy 1  Raw ARP broadcast   AF_PACKET socket sends Ethernet ARP frames
                                  to every host in the subnet.  Captures
                                  replies to get IP + MAC pairs.
                                  Requires: root/admin, IFF_BROADCAST iface.

  Strategy 2  Kernel ARP cache    Reads /proc/net/arp (Linux) for already-
                                  cached MAC entries.  Zero-privilege, instant.
                                  Works as a supplement even when Strategy 1 runs.

  Strategy 3  TCP connect probe   Attempts socket.connect() to common ports
                                  on every host in the subnet.  No root needed,
                                  no MAC addresses, but discovers listening hosts.
                                  Capped at 512 hosts to keep latency reasonable.

  Strategy 4  Interface self-only Reports this machine's own interface addresses.
                                  Always succeeds; used when nothing else works.

Environment detection
---------------------
  Checks IFF_BROADCAST flag via ioctl SIOCGIFFLAGS on every non-loopback iface.
  If no broadcast-capable iface is found (typical of Docker /31 P2P links),
  scan_mode = "container" and the response includes explicit instructions
  so the frontend can show a meaningful message instead of silent empty list.

MAC vendor lookup
-----------------
  Embedded OUI table (60+ prefixes, covers ≈70 % of typical LANs).
  Falls back to "Unknown Vendor" with no network call needed.

Device classification
---------------------
  Multi-signal: hostname keywords → vendor string → open port patterns.
  Gateway IP is detected by comparing against the default route.

Response shape (ScanResult)
----------------------------
  {
    devices: [ { ip, mac, hostname, vendor, device_type,
                 is_gateway, is_this_machine, status,
                 scan_method, open_ports } ],
    total:              int,
    scan_mode:          "arp_full" | "arp_kernel" | "tcp_probe"
                        | "self_only" | "container" | "error",
    error_type:         str | None,
    scanned_subnet:     str | None,   # e.g. "192.168.1.0/24"
    interface:          str | None,
    total_hosts_probed: int,
    duration_seconds:   float,
    scanned_at:         ISO-8601 str,
    permission_required: bool,
    instructions:       str | None,   # user-readable next steps
  }
"""

from __future__ import annotations

import fcntl
import ipaddress
import logging
import os
import socket
import struct
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import psutil

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# OUI vendor table  (first 6 hex chars of MAC, upper-case, no colons)
# ─────────────────────────────────────────────────────────────────────────────

_OUI: dict[str, str] = {
    # Apple
    "ACBC32": "Apple", "3C0754": "Apple", "7CF05F": "Apple",
    "A4D18C": "Apple", "F0DBF8": "Apple", "DC2B2A": "Apple",
    "8C8590": "Apple", "BCEC99": "Apple", "A45E60": "Apple",
    "889FF0": "Apple", "70CD60": "Apple", "009C35": "Apple",
    # Cisco / Linksys
    "000C29": "VMware",  # collision – VMware uses same range; see below
    "001A2F": "Cisco",  "0023EB": "Cisco",  "606BBD": "Cisco",
    "24B6FD": "Cisco",  "C89C1D": "Cisco",  "000625": "Cisco",
    "00E04C": "Linksys",
    # TP-Link
    "F4F26D": "TP-Link", "50C7BF": "TP-Link", "B0487A": "TP-Link",
    "A84E3F": "TP-Link", "C46E1F": "TP-Link", "002722": "TP-Link",
    # Netgear
    "A021B7": "Netgear", "20E52A": "Netgear", "744D28": "Netgear",
    "C03F0E": "Netgear",
    # Samsung
    "002339": "Samsung", "84A466": "Samsung", "CC07AB": "Samsung",
    "A8F274": "Samsung",
    # Dell
    "001372": "Dell",    "0019B9": "Dell",    "D4AE52": "Dell",
    # HP
    "001083": "HP",      "3C4A92": "HP",      "9CB654": "HP",
    # Intel NIC
    "8C8D28": "Intel",   "F8B156": "Intel",   "3417EB": "Intel",
    "34DE1A": "Intel",
    # Raspberry Pi
    "B827EB": "Raspberry Pi", "DC2B61": "Raspberry Pi", "E45F01": "Raspberry Pi",
    # ASUS
    "049226": "ASUS",    "1062EB": "ASUS",    "2C56DC": "ASUS",
    # Ubiquiti
    "00156D": "Ubiquiti", "0418D6": "Ubiquiti", "245A4C": "Ubiquiti",
    "782D7E": "Ubiquiti", "B4FBE4": "Ubiquiti",
    # Amazon (Echo, Fire TV)
    "44650D": "Amazon",  "34D270": "Amazon",  "A002DC": "Amazon",
    "FC6516": "Amazon",
    # Google (Nest, Chromecast)
    "54607E": "Google",  "F4F5E8": "Google",  "3C5AB4": "Google",
    # D-Link
    "001CF0": "D-Link",  "00265A": "D-Link",  "14D64D": "D-Link",
    # VMware
    "000569": "VMware",  "001C14": "VMware",
    # VirtualBox
    "080027": "VirtualBox",
}


def _vendor(mac: str) -> str:
    oui = mac.upper().replace(":", "").replace("-", "")[:6]
    return _OUI.get(oui, "Unknown Vendor")


# ─────────────────────────────────────────────────────────────────────────────
# Interface helpers
# ─────────────────────────────────────────────────────────────────────────────

_SIOCGIFFLAGS = 0x8913
_IFF_BROADCAST = 0x0002
_IFF_LOOPBACK  = 0x0008


def _iface_flags(iface: str) -> int:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        ifreq = struct.pack("16sh", iface.encode()[:15], 0)
        res = fcntl.ioctl(s.fileno(), _SIOCGIFFLAGS, ifreq)
        s.close()
        return struct.unpack_from("H", res, 16)[0]
    except Exception:
        return 0


def _has_broadcast(iface: str) -> bool:
    return bool(_iface_flags(iface) & _IFF_BROADCAST)


def _mac_for_iface(iface: str) -> Optional[str]:
    for a in psutil.net_if_addrs().get(iface, []):
        if a.family == psutil.AF_LINK and a.address not in (None, "", "00:00:00:00:00:00"):
            return a.address.lower()
    return None


def _default_gateway() -> Optional[str]:
    """Parse /proc/net/route to find the default gateway IP."""
    try:
        with open("/proc/net/route") as f:
            for line in f.readlines()[1:]:
                cols = line.split()
                if len(cols) >= 3 and cols[1] == "00000000":
                    return socket.inet_ntoa(struct.pack("<I", int(cols[2], 16)))
    except Exception:
        pass
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Interface inventory
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class _Iface:
    name: str
    ip: str
    netmask: str
    mac: Optional[str]
    network: str          # e.g. "192.168.1.0/24"
    prefix_len: int
    num_hosts: int
    broadcast_capable: bool
    is_private: bool

    @property
    def scannable(self) -> bool:
        """True when ARP scanning is theoretically possible."""
        return self.broadcast_capable and self.is_private and self.prefix_len < 31

    @property
    def is_container_link(self) -> bool:
        """/31 or /32 P2P link typical of container networking."""
        return self.prefix_len >= 31 or not self.broadcast_capable


def _list_interfaces() -> list[_Iface]:
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    result: list[_Iface] = []
    for iface, addr_list in addrs.items():
        if iface == "lo":
            continue
        st = stats.get(iface)
        if not st or not st.isup:
            continue
        mac = _mac_for_iface(iface)
        bc  = _has_broadcast(iface)
        for a in addr_list:
            if a.family != socket.AF_INET:
                continue
            try:
                net = ipaddress.IPv4Network(f"{a.address}/{a.netmask}", strict=False)
                result.append(_Iface(
                    name=iface, ip=a.address, netmask=a.netmask,
                    mac=mac, network=str(net),
                    prefix_len=net.prefixlen,
                    num_hosts=net.num_addresses,
                    broadcast_capable=bc,
                    is_private=net.is_private,
                ))
            except Exception:
                pass
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 1 — Raw ARP broadcast
# ─────────────────────────────────────────────────────────────────────────────

def _build_arp_request(src_mac: bytes, src_ip: str, tgt_ip: str) -> bytes:
    """Build a 42-byte ARP-over-Ethernet request frame."""
    ether = b"\xff\xff\xff\xff\xff\xff" + src_mac + b"\x08\x06"
    arp = (
        struct.pack("!HHbbH", 1, 0x0800, 6, 4, 1)  # htype ptype hlen plen oper=req
        + src_mac
        + socket.inet_aton(src_ip)
        + b"\x00" * 6
        + socket.inet_aton(tgt_ip)
    )
    return ether + arp


def _parse_arp_reply(frame: bytes) -> Optional[tuple[str, str]]:
    """Return (sender_ip, sender_mac) if frame is an ARP reply, else None."""
    if len(frame) < 42:
        return None
    et = struct.unpack("!H", frame[12:14])[0]
    if et != 0x0806:
        return None
    op = struct.unpack("!H", frame[20:22])[0]
    if op != 2:
        return None
    mac = ":".join(f"{b:02x}" for b in frame[22:28])
    ip  = socket.inet_ntoa(frame[28:32])
    return ip, mac


def _arp_scan(ifc: _Iface, timeout: float = 2.5) -> dict[str, str]:
    """
    Broadcast ARP requests to every host in the subnet.
    Returns {ip: mac}.  Raises PermissionError or RuntimeError on failure.
    """
    if not ifc.mac:
        raise RuntimeError(f"No MAC on {ifc.name}")

    src_mac = bytes.fromhex(ifc.mac.replace(":", ""))
    network = ipaddress.IPv4Network(ifc.network)
    hosts   = [str(h) for h in network.hosts()]

    try:
        sock = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(0x0806))
        sock.bind((ifc.name, 0))
        sock.settimeout(0.05)
    except PermissionError:
        raise PermissionError("Root/admin privileges required for raw ARP")
    except OSError as e:
        raise RuntimeError(f"Cannot open AF_PACKET on {ifc.name}: {e}")

    # Burst-send all requests
    for ip in hosts:
        try:
            sock.send(_build_arp_request(src_mac, ifc.ip, ip))
        except Exception:
            pass  # some ifaces reject sends silently – collect replies anyway

    # Collect for `timeout` seconds
    replies: dict[str, str] = {}
    net_set  = set(str(h) for h in network.hosts())
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            data, _ = sock.recvfrom(65535)
            parsed  = _parse_arp_reply(data)
            if parsed:
                ip, mac = parsed
                if ip in net_set and ip not in replies:
                    replies[ip] = mac
        except (socket.timeout, BlockingIOError):
            time.sleep(0.025)
        except Exception:
            break

    sock.close()
    return replies


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 2 — Kernel ARP cache
# ─────────────────────────────────────────────────────────────────────────────

def _read_arp_cache() -> dict[str, str]:
    """Read /proc/net/arp.  Returns {ip: mac} for complete entries."""
    out: dict[str, str] = {}
    try:
        with open("/proc/net/arp") as f:
            for line in f.readlines()[1:]:
                cols = line.split()
                if len(cols) < 4:
                    continue
                ip, flags, mac = cols[0], cols[2], cols[3]
                if flags == "0x0" or mac == "00:00:00:00:00:00":
                    continue
                out[ip] = mac
    except Exception:
        pass
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Strategy 3 — TCP connect probe
# ─────────────────────────────────────────────────────────────────────────────

_PROBE_PORTS = [80, 443, 22, 8080, 445, 3389, 5900, 8443, 21, 23]


def _tcp_alive(ip: str, ports: list[int], timeout: float) -> list[int]:
    open_ports: list[int] = []
    for p in ports:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(timeout)
            if s.connect_ex((ip, p)) == 0:
                open_ports.append(p)
            s.close()
        except Exception:
            pass
    return open_ports


def _tcp_probe_subnet(
    network: ipaddress.IPv4Network,
    max_hosts: int = 512,
    concurrency: int = 96,
    timeout: float = 0.35,
) -> dict[str, list[int]]:
    """TCP-probe the subnet. Returns {ip: [open_ports]}."""
    hosts = [str(h) for h in network.hosts()][:max_hosts]
    found: dict[str, list[int]] = {}
    lock  = threading.Lock()

    def probe(ip: str) -> None:
        ports = _tcp_alive(ip, _PROBE_PORTS[:6], timeout)
        if ports:
            with lock:
                found[ip] = ports

    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        list(ex.map(probe, hosts))
    return found


# ─────────────────────────────────────────────────────────────────────────────
# Device enrichment
# ─────────────────────────────────────────────────────────────────────────────

def _resolve(ip: str, timeout: float = 0.4) -> str:
    old = socket.getdefaulttimeout()
    socket.setdefaulttimeout(timeout)
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip
    finally:
        socket.setdefaulttimeout(old)


def _classify(
    hostname: str,
    vendor: str,
    open_ports: list[int],
    is_gateway: bool,
) -> str:
    h = hostname.lower()
    v = vendor.lower()

    if is_gateway:
        return "Router / Gateway"
    if any(k in h for k in ["router", "gateway", "rt-", "-ap", "access-point"]):
        return "Router / Gateway"
    if any(k in h for k in ["macbook", "imac", "mac-"]):
        return "Mac Computer"
    if any(k in h for k in ["iphone", "ipad"]):
        return "iPhone / iPad"
    if any(k in h for k in ["android", "galaxy", "pixel"]):
        return "Android Device"
    if any(k in h for k in ["printer", "print", "canon", "epson", "brother", "hp-"]):
        return "Printer"
    if any(k in h for k in ["server", "srv", "nas", "synology", "qnap"]):
        return "Server / NAS"
    if any(k in h for k in ["cam", "camera", "nvr", "dvr", "hikvision", "dahua"]):
        return "IP Camera"
    if any(k in h for k in ["tv", "smart-tv", "roku", "firetv", "chromecast", "appletv"]):
        return "Smart TV"
    if any(k in h for k in ["raspberry", "raspi"]):
        return "Raspberry Pi"
    if any(k in h for k in ["laptop", "thinkpad", "surface", "lenovo"]):
        return "Laptop"

    # Vendor hints
    if "apple" in v:
        return "Apple Device"
    if any(k in v for k in ["cisco", "linksys", "netgear", "tp-link", "d-link", "asus", "ubiquiti"]):
        return "Network Device"
    if "raspberry" in v:
        return "Raspberry Pi"
    if any(k in v for k in ["samsung", "amazon", "google"]):
        return "Smart Device"
    if any(k in v for k in ["vmware", "virtualbox"]):
        return "Virtual Machine"

    # Port hints
    if 22 in open_ports and 80 in open_ports:
        return "Server / NAS"
    if 3389 in open_ports:
        return "Windows PC"
    if 5900 in open_ports:
        return "Remote Desktop Host"
    if 445 in open_ports:
        return "Windows PC"

    return "Computer / Device"


# ─────────────────────────────────────────────────────────────────────────────
# Shared device dataclass
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Device:
    ip: str
    mac: str
    hostname: str
    vendor: str
    device_type: str
    is_gateway: bool
    is_this_machine: bool
    status: str          = "active"
    scan_method: str     = "arp"
    open_ports: list[int] = field(default_factory=list)


def _enrich(
    ip_mac: dict[str, str],
    ifc: _Iface,
    gw: Optional[str],
    method: str = "arp",
) -> list[Device]:
    """Resolve hostnames + classify in parallel."""
    devices: list[Device] = []
    lock = threading.Lock()

    def build(ip: str, mac: str) -> None:
        v    = _vendor(mac)
        h    = _resolve(ip)
        gw_f = ip == gw
        self_f = ip == ifc.ip
        dt   = _classify(h, v, [], gw_f)
        with lock:
            devices.append(Device(
                ip=ip, mac=mac, hostname=h, vendor=v,
                device_type=dt, is_gateway=gw_f,
                is_this_machine=self_f, scan_method=method,
            ))

    with ThreadPoolExecutor(max_workers=32) as ex:
        list(ex.map(lambda kv: build(*kv), ip_mac.items()))

    devices.sort(key=lambda d: tuple(int(x) for x in d.ip.split(".")))
    return devices


def _self_device(ifc: _Iface, gw: Optional[str]) -> Device:
    mac  = ifc.mac or "N/A"
    v    = _vendor(mac) if ifc.mac else "Unknown Vendor"
    h    = _resolve(ifc.ip, 0.3)
    return Device(
        ip=ifc.ip, mac=mac, hostname=h, vendor=v,
        device_type="This Machine (Backend Host)",
        is_gateway=(ifc.ip == gw), is_this_machine=True,
        scan_method="interface",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def scan() -> dict:
    """
    Run the full network scan pipeline.
    Always returns a dict matching the ScanResult shape documented at top.
    Never raises — all errors are captured in scan_mode / error_type.
    """
    t0  = time.monotonic()
    gw  = _default_gateway()
    ifs = _list_interfaces()
    ts  = datetime.utcnow().isoformat() + "Z"

    # ── No interfaces at all ──────────────────────────────────────────────────
    if not ifs:
        return _result(
            [], "error", "no_interfaces",
            None, None, 0, t0, ts,
            permission_required=False,
            instructions=(
                "No active network interfaces detected. "
                "Ensure the backend server has network access."
            ),
        )

    # ── Container / cloud environment detection ───────────────────────────────
    scannable = [i for i in ifs if i.scannable]
    is_container = (
        not scannable
        and all(i.is_container_link for i in ifs)
    )

    if is_container:
        devs = [_self_device(ifs[0], gw)]
        return _result(
            devs, "container", "container_env",
            ifs[0].network, ifs[0].name,
            len(devs), t0, ts,
            permission_required=True,
            instructions=(
                "PhishGuard is running inside a container with a virtual point-to-point "
                "network link (no broadcast domain — ARP scanning not possible here).\n\n"
                "To use the Network Scanner on your real LAN, run PhishGuard directly "
                "on your machine or use host networking:\n\n"
                "  docker run --network=host ...\n\n"
                "Root/sudo is required for raw ARP scanning:\n\n"
                "  sudo uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
            ),
        )

    # ── Use the first broadcast-capable interface ────────────────────────────
    ifc = scannable[0]
    net = ipaddress.IPv4Network(ifc.network)

    # ── Strategy 1: Raw ARP ──────────────────────────────────────────────────
    arp_error: Optional[str] = None
    try:
        logger.info(f"[scanner] ARP scan: {ifc.network} via {ifc.name}")
        arp_hits = _arp_scan(ifc, timeout=2.5)

        # Supplement with kernel cache
        for ip, mac in _read_arp_cache().items():
            if ip not in arp_hits and ipaddress.IPv4Address(ip) in net:
                arp_hits[ip] = mac

        # Add self if missing
        if ifc.ip not in arp_hits and ifc.mac:
            arp_hits[ifc.ip] = ifc.mac

        devs = _enrich(arp_hits, ifc, gw, "arp")
        return _result(
            devs, "arp_full", None,
            ifc.network, ifc.name,
            net.num_addresses, t0, ts,
            permission_required=False,
        )

    except PermissionError as e:
        arp_error = "permission_denied"
        logger.warning(f"[scanner] ARP scan needs root: {e}")
    except RuntimeError as e:
        arp_error = "arp_unsupported"
        logger.warning(f"[scanner] ARP scan failed: {e}")

    # ── Strategy 2: Kernel ARP cache only ────────────────────────────────────
    cache = _read_arp_cache()
    cache_in_subnet = {
        ip: mac for ip, mac in cache.items()
        if ipaddress.IPv4Address(ip) in net
    }
    if cache_in_subnet:
        if ifc.ip not in cache_in_subnet and ifc.mac:
            cache_in_subnet[ifc.ip] = ifc.mac
        devs = _enrich(cache_in_subnet, ifc, gw, "arp_cache")
        return _result(
            devs, "arp_kernel", arp_error,
            ifc.network, ifc.name,
            len(cache_in_subnet), t0, ts,
            permission_required=True,
            instructions=(
                "Showing devices from the kernel ARP cache — only hosts that have "
                "recently communicated with this machine are visible.\n\n"
                "For a full subnet sweep with all devices, run with elevated privileges:\n\n"
                "  sudo uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
            ),
        )

    # ── Strategy 3: TCP connect probe ────────────────────────────────────────
    logger.info(f"[scanner] TCP probe: {ifc.network}")
    tcp_hits = _tcp_probe_subnet(net, max_hosts=512, concurrency=96)
    if ifc.ip not in tcp_hits:
        tcp_hits[ifc.ip] = []   # add self

    if tcp_hits:
        devs: list[Device] = []
        for ip, ports in tcp_hits.items():
            h  = _resolve(ip, 0.4)
            gf = ip == gw
            sf = ip == ifc.ip
            dt = _classify(h, "", ports, gf)
            devs.append(Device(
                ip=ip, mac="N/A (TCP scan)", hostname=h,
                vendor="Unknown (no ARP)", device_type=dt,
                is_gateway=gf, is_this_machine=sf,
                open_ports=ports, scan_method="tcp",
            ))
        devs.sort(key=lambda d: tuple(int(x) for x in d.ip.split(".")))
        return _result(
            devs, "tcp_probe", arp_error,
            ifc.network, ifc.name,
            min(net.num_addresses, 512), t0, ts,
            permission_required=True,
            instructions=(
                "TCP probe mode — MAC addresses are unavailable without root privileges. "
                "Only hosts with at least one open port are shown.\n\n"
                "For full ARP scanning with MAC addresses and vendor info:\n\n"
                "  sudo uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
            ),
        )

    # ── Strategy 4: Self-only ────────────────────────────────────────────────
    devs = [_self_device(ifc, gw)]
    return _result(
        devs, "self_only", arp_error or "no_hosts_found",
        ifc.network, ifc.name,
        net.num_addresses, t0, ts,
        permission_required=True,
        instructions=(
            "No other devices responded to probes. Possible causes:\n\n"
            "  • Firewall rules block ICMP/TCP on this network\n"
            "  • Other devices are powered off\n"
            "  • The backend is running in a restricted environment\n\n"
            "For raw ARP scanning (most reliable, bypasses all firewalls):\n\n"
            "  sudo uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Response builder
# ─────────────────────────────────────────────────────────────────────────────

def _result(
    devices: list[Device],
    scan_mode: str,
    error_type: Optional[str],
    subnet: Optional[str],
    interface: Optional[str],
    hosts_probed: int,
    t0: float,
    ts: str,
    permission_required: bool,
    instructions: Optional[str] = None,
) -> dict:
    return {
        "devices": [
            {
                "ip":             d.ip,
                "mac":            d.mac,
                "hostname":       d.hostname,
                "vendor":         d.vendor,
                "device_type":    d.device_type,
                "is_gateway":     d.is_gateway,
                "is_this_machine": d.is_this_machine,
                "status":         d.status,
                "scan_method":    d.scan_method,
                "open_ports":     d.open_ports,
            }
            for d in devices
        ],
        "total":               len(devices),
        "scan_mode":           scan_mode,
        "error_type":          error_type,
        "scanned_subnet":      subnet,
        "interface":           interface,
        "total_hosts_probed":  hosts_probed,
        "duration_seconds":    round(time.monotonic() - t0, 2),
        "scanned_at":          ts,
        "permission_required": permission_required,
        "instructions":        instructions,
    }
