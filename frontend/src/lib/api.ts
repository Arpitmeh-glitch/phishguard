import axios from "axios";

// ✅ FIX 1: Clean base URL (remove trailing slash if exists)
const rawBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// ✅ FIX 2: Always use full backend path explicitly
export const api = axios.create({
  baseURL: rawBase, // e.g. https://...railway.app OR http://127.0.0.1:8000
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

// ─────────────────────────────────────────
// Request interceptor — attach token
// ─────────────────────────────────────────

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

// ─────────────────────────────────────────
// Response interceptor — refresh token
// ─────────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) throw new Error("No refresh token");

        const { data } = await axios.post(
          `${rawBase}/api/v1/auth/refresh`,
          { refresh_token: refreshToken }
        );

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

// ─────────────────────────────────────────
// Auth (✅ FIXED PATHS)
// ─────────────────────────────────────────

export const authApi = {
  register: (data: {
    email: string;
    username: string;
    password: string;
    terms_accepted: boolean;
  }) =>
    api.post("/api/v1/auth/register", data),

  login: (data: { email: string; password: string }) =>
    api.post("/api/v1/auth/login", {
      email: data.email,
      password: data.password,
    }),

  refresh: (refresh_token: string) =>
    api.post("/api/v1/auth/refresh", { refresh_token }),

  me: () => api.get("/api/v1/auth/me"),
};
// Scans
export const scanApi = {
  url: (url: string) => api.post("/scan/url", { url }),
  message: (message: string) => api.post("/scan/message", { message }),
  file: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    // WHY we delete Content-Type here:
    //
    // The axios instance is created with a default
    //   headers: { "Content-Type": "application/json" }
    // That default survives into every request's config.headers object,
    // even for FormData bodies.  axios's automatic multipart detection
    // only strips Content-Type from per-request headers, not from
    // instance-level defaults that have already been merged in.
    //
    // The request interceptor above (line ~36) receives a config whose
    // headers already contain "Content-Type: application/json", so it
    // returns that header intact — and FastAPI sees the wrong content
    // type, cannot find the 'file' form field, and responds HTTP 422.
    //
    // Passing `headers: { "Content-Type": undefined }` in the per-request
    // config overrides the instance default for this call only, which lets
    // the browser set `multipart/form-data; boundary=<...>` automatically.
    return api.post("/scan/file", fd, {
      headers: { "Content-Type": undefined },
    });
  },
  fileStatus: (fileId: string) => api.get(`/scan/file/${fileId}/status`),
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
// Agent endpoints
export const agentApi = {
  // These are placeholders. We will update them based on your actual backend routes!
  list: () => api.get("/agent"),
  status: (agentId: string) => api.get(`/agent/${agentId}/status`),
};