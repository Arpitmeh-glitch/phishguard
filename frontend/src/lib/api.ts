import axios from "axios";

// FIX: The API base URL must NOT include /api/v1 when using docker-compose
// because next.config.js rewrites /api/* → backend:8000/api/* already.
// Previously docker-compose set NEXT_PUBLIC_API_URL=/api/v1 and api.ts
// appended /api/v1 again → requests hit /api/v1/api/v1/... (404).
//
// New logic:
//   - In docker/nginx (env var = empty or not set): use "" so all calls go
//     through the Next.js rewrite proxy (relative URLs → /api/v1/...)
//   - With explicit Railway URL: use it directly, and do NOT re-append /api/v1
const rawBase = process.env.NEXT_PUBLIC_API_URL ?? "";

// If the env var already ends with /api/v1 (old docker-compose value), strip it
// so downstream code appending /api/v1 doesn't double up.
const API_BASE = rawBase.endsWith("/api/v1")
  ? rawBase  // already correct external URL
  : rawBase === "" || rawBase === "/api/v1"
    ? "/api/v1"  // local proxy — use relative so nginx handles it
    : rawBase + "/api/v1";  // external base URL without suffix

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token =
  typeof window !== "undefined"
    ? localStorage.getItem("access_token")
    : null;

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response interceptor — handle 401 by refreshing token

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) throw new Error("No refresh token");
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (_) {
        localStorage.clear();
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  // FIX: Added terms_accepted field to register payload type
  register: (data: { email: string; username: string; password: string; terms_accepted: boolean }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }),
  me: () => api.get("/auth/me"),
};

// Scans
export const scanApi = {
  url: (url: string) => api.post("/scan/url", { url }),
  message: (message: string) => api.post("/scan/message", { message }),
  file: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    // Do NOT manually set Content-Type here — axios must auto-set it
    // with the correct multipart boundary.
    return api.post("/scan/file", fd);
  },
};

// User
export const userApi = {
  history: (page = 1, per_page = 20, scan_type?: string) => {
    const params: Record<string, unknown> = { page, per_page };
    if (scan_type) params.scan_type = scan_type;
    return api.get("/user/history", { params });
  },
  profile: () => api.get("/user/profile"),
  stats: () => api.get("/user/stats"),
};

// Threat Detection
export const threatApi = {
  // Single-domain threat analysis (unchanged)
  analyze: (domain: string, port?: number, ip?: string) =>
    api.post("/threat/analyze", { domain, port, ip }),

  // Network scanner — replaces the old /threat/live endpoint
  networkScan: () => api.get("/threat/network-scan"),
};

// Agent — local network scan results submitted by phishguard_agent.py
export const agentApi = {
  getNetworkReport: () => api.get("/agent/network-report"),
  getStatus: () => api.get("/agent/status"),
};

// Admin
export const adminApi = {
  stats: () => api.get("/admin/stats"),
  users: (page = 1, per_page = 20, params?: Record<string, unknown>) =>
    api.get("/admin/users", { params: { page, per_page, ...params } }),
  createUser: (data: { email: string; username: string; password: string; role: string }) =>
    api.post("/admin/users", data),
  deleteUser: (userId: string) =>
    api.delete(`/admin/users/${userId}`),
  updateRole: (userId: string, role: string) =>
    api.patch(`/admin/users/${userId}/role`, { role }),
  toggleUser: (userId: string) =>
    api.patch(`/admin/users/${userId}/toggle`),
  resetPassword: (userId: string, new_password: string) =>
    api.post(`/admin/users/${userId}/reset-password`, { new_password }),
  logs: (page = 1, params?: Record<string, unknown>) =>
    api.get("/admin/logs", { params: { page, per_page: 50, ...params } }),
  scans: (page = 1, label?: string) => {
    const params: Record<string, unknown> = { page };
    if (label) params.label = label;
    return api.get("/admin/scans", { params });
  },
};
