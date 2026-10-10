const API_BASE = "/api";

export const AUTH_EXPIRED_EVENT = "auth:expired";

// Endpoints whose 401s are expected and handled by the auth layer itself
// (bad credentials, the initial session probe, logout).
const AUTH_ENDPOINTS = ["/auth/login", "/auth/signup", "/auth/me", "/auth/logout"];

let authExpiredHandled = false;

export function resetAuthExpired() {
  authExpiredHandled = false;
}

// A 401 from any other endpoint means the session expired mid-use. Clear the
// stale token and tell the app once (many queries can fail at the same time),
// so it can send the user to the login page instead of rendering empty tables.
export function handleUnauthorized(url) {
  if (AUTH_ENDPOINTS.some((p) => url.startsWith(p))) return;
  if (authExpiredHandled) return;
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  authExpiredHandled = true;
  localStorage.removeItem("auth_token");
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

// Server errors carry a short `message` (or `error`) plus an optional
// human-readable `detail`; show both so users see "Forbidden: Admin access is
// required..." rather than a bare "Forbidden" or "Request failed: 409".
export function buildErrorMessage(data, status) {
  const primary = data?.message || data?.error;
  const detail = typeof data?.detail === "string" ? data.detail : "";
  if (primary && detail && detail !== primary) return `${primary}: ${detail}`;
  return primary || detail || `Request failed: ${status}`;
}

async function toApiError(res, url) {
  const data = await res.json().catch(() => ({ message: res.statusText }));
  if (res.status === 401) handleUnauthorized(url);
  const err = new Error(buildErrorMessage(data, res.status));
  err.name = "ApiError";
  err.status = res.status;
  err.data = data;
  return err;
}

async function request(url, options = {}) {
  const token = localStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) throw await toApiError(res, url);

  return res.json();
}

function createEntityProxy(entityName) {
  return {
    async list(sort, limit) {
      const params = new URLSearchParams();
      if (sort) params.set("sort", sort);
      if (limit) params.set("limit", String(limit));
      return request(`/entities/${entityName}?${params}`);
    },

    async filter(filters, sort, limit) {
      return request(`/entities/${entityName}/filter`, {
        method: "POST",
        body: JSON.stringify({ filters, sort, limit }),
      });
    },

    async get(id) {
      return request(`/entities/${entityName}/${id}`);
    },

    async create(data) {
      return request(`/entities/${entityName}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async bulkCreate(items) {
      return request(`/entities/${entityName}/bulk`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
    },

    async update(id, data) {
      return request(`/entities/${entityName}/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },

    async delete(id) {
      return request(`/entities/${entityName}/${id}`, {
        method: "DELETE",
      });
    },

    subscribe(callback, intervalMs = 5000) {
      let active = true;
      // Track the last-seen updated_date per row so we only emit rows that
      // actually changed since the previous poll. Consumers expect one event per
      // changed item shaped as { type, id, data } (data is the single row).
      const lastSeen = new Map();
      const poll = async () => {
        if (!active) return;
        try {
          const items = await request(`/entities/${entityName}?sort=-updated_date&limit=50`);
          for (const item of items) {
            if (item?.id == null) continue;
            const stamp = item.updated_date || item.created_date || "";
            if (lastSeen.get(item.id) !== stamp) {
              lastSeen.set(item.id, stamp);
              callback({ type: "update", id: item.id, data: item });
            }
          }
        } catch (e) {}
        if (active) setTimeout(poll, intervalMs);
      };
      setTimeout(poll, intervalMs);
      return () => { active = false; };
    },
  };
}

const entityHandler = {
  get(target, prop) {
    if (prop in target) return target[prop];
    return createEntityProxy(prop);
  },
};

export const base44 = {
  entities: new Proxy({}, entityHandler),

  auth: {
    async me() {
      return request("/auth/me");
    },

    async login(email, password) {
      const result = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (result.token) {
        localStorage.setItem("auth_token", result.token);
      }
      resetAuthExpired();
      return result;
    },

    async signup(email, password, full_name) {
      const result = await request("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name }),
      });
      if (result.token) {
        localStorage.setItem("auth_token", result.token);
      }
      resetAuthExpired();
      return result;
    },

    async logout() {
      localStorage.removeItem("auth_token");
      await request("/auth/logout", { method: "POST" }).catch(() => {});
    },

    redirectToLogin(returnUrl) {
      window.location.href = `/login?returnUrl=${encodeURIComponent(returnUrl || window.location.href)}`;
    },
  },

  integrations: {
    Core: {
      async InvokeLLM(params) {
        return request("/integrations/ai/invoke", {
          method: "POST",
          body: JSON.stringify(params),
        });
      },

      async SendEmail(params) {
        return request("/integrations/email/send", {
          method: "POST",
          body: JSON.stringify(params),
        });
      },

      async UploadFile(fileOrObj) {
        const actualFile = fileOrObj?.file || fileOrObj;
        const formData = new FormData();
        formData.append("file", actualFile);
        const token = localStorage.getItem("auth_token");
        const res = await fetch(`${API_BASE}/integrations/file/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          body: formData,
        });
        if (!res.ok) throw await toApiError(res, "/integrations/file/upload");
        return res.json();
      },

      async ExtractDataFromUploadedFile(params) {
        return request("/integrations/ai/invoke", {
          method: "POST",
          body: JSON.stringify({
            prompt: `Extract structured data from the following file content: ${JSON.stringify(params)}`,
            response_json_schema: params.response_json_schema,
          }),
        });
      },
    },
  },

  functions: {
    async invoke(functionName, params = {}) {
      const result = await request(`/functions/${functionName}`, {
        method: "POST",
        body: JSON.stringify(params),
      });
      return { data: result };
    },
  },

  storage: {
    getFileUrl(path) {
      return `${API_BASE}/storage/${path}`;
    },
  },
};
