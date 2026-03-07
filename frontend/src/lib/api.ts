import axios from "axios";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ||
   "https://phishguard-production-0e6b.up.railway.app") + "/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
  register: (data: { email: string; username: string; password: string }) =>
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
    // with the correct multipart boundary (e.g. multipart/form-data; boundary=----xyz).
    // Overriding it strips the boundary and causes a 422 on the server.
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

// Admin
export const adminApi = {
  stats: () => api.get("/admin/stats"),
  users: (page = 1, per_page = 20) =>
    api.get("/admin/users", { params: { page, per_page } }),
  updateRole: (userId: string, role: string) =>
    api.patch(`/admin/users/${userId}/role`, { role }),
  toggleUser: (userId: string) =>
    api.patch(`/admin/users/${userId}/toggle`),
  logs: (page = 1) => api.get("/admin/logs", { params: { page } }),
  scans: (page = 1, label?: string) => {
    const params: Record<string, unknown> = { page };
    if (label) params.label = label;
    return api.get("/admin/scans", { params });
  },
};
