import { createSseParser } from "../lib/sseParser.js";

const API_BASE = "/api";

export const AUTH_EXPIRED_EVENT = "auth:expired";
// Fired when the server says the account is awaiting approval or disabled, so
// the auth layer can re-check and route accordingly.
export const ACCOUNT_STATUS_EVENT = "auth:account-status";

// Endpoints whose 401s are expected and handled by the auth layer itself
// (bad credentials, the initial session probe, logout, reset links).
const AUTH_ENDPOINTS = ["/auth/"];

// The session lives in an httpOnly cookie. Older builds also kept the token in
// localStorage, where any script on the page could read it; drop that copy.
try {
  if (typeof localStorage !== "undefined") localStorage.removeItem("auth_token");
} catch {
  /* storage unavailable */
}

let authExpiredHandled = false;

export function resetAuthExpired() {
  authExpiredHandled = false;
}

// A 401 from any other endpoint means the session expired mid-use. Tell the
// app once (many queries can fail at the same time), so it can send the user
// to the login page instead of rendering empty tables.
export function handleUnauthorized(url) {
  if (AUTH_ENDPOINTS.some((p) => url.startsWith(p))) return;
  if (authExpiredHandled) return;
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  authExpiredHandled = true;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

const ACCOUNT_STATUS_CODES = new Set(["account_pending", "account_disabled"]);

export function handleAccountStatus(url, data) {
  if (!ACCOUNT_STATUS_CODES.has(data?.code)) return;
  if (AUTH_ENDPOINTS.some((p) => url.startsWith(p))) return;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACCOUNT_STATUS_EVENT, { detail: { code: data.code } }));
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
  if (res.status === 403) handleAccountStatus(url, data);
  const err = new Error(buildErrorMessage(data, res.status));
  err.name = "ApiError";
  err.status = res.status;
  err.data = data;
  return err;
}

async function request(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
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

    async options() {
      return request("/auth/options");
    },

    async login(email, password) {
      const result = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      resetAuthExpired();
      return result;
    },

    async signup(email, password, full_name) {
      const result = await request("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name }),
      });
      resetAuthExpired();
      return result;
    },

    async logout() {
      await request("/auth/logout", { method: "POST" }).catch(() => {});
    },

    async logoutEverywhere() {
      await request("/auth/logout-all", { method: "POST" });
    },

    async changePassword(current_password, new_password) {
      return request("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password, new_password }),
      });
    },

    async forgotPassword(email) {
      return request("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },

    async tokenInfo(token) {
      return request(`/auth/token-info?token=${encodeURIComponent(token)}`);
    },

    async resetPassword(token, password, full_name) {
      const result = await request("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password, full_name }),
      });
      resetAuthExpired();
      return result;
    },

    redirectToLogin(returnUrl) {
      window.location.href = `/login?returnUrl=${encodeURIComponent(returnUrl || window.location.href)}`;
    },
  },

  // Admin user management (server/routes/adminUsers.ts).
  admin: {
    users: {
      list: () => request("/admin/users"),
      pendingCount: () => request("/admin/users/pending-count"),
      activity: (limit = 50) => request(`/admin/users/activity?limit=${limit}`),
      invite: (data) => request("/admin/users/invite", { method: "POST", body: JSON.stringify(data) }),
      update: (id, data) => request(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      approve: (id) => request(`/admin/users/${id}/approve`, { method: "POST" }),
      disable: (id, reason) => request(`/admin/users/${id}/disable`, { method: "POST", body: JSON.stringify({ reason }) }),
      enable: (id) => request(`/admin/users/${id}/enable`, { method: "POST" }),
      resetLink: (id) => request(`/admin/users/${id}/reset-link`, { method: "POST" }),
      revokeSessions: (id) => request(`/admin/users/${id}/revoke-sessions`, { method: "POST" }),
      remove: (id) => request(`/admin/users/${id}`, { method: "DELETE" }),
    },
  },

  // Best-effort audit trail for the user's own actions (exports, imports,
  // scoring runs). The server records who and from where; failures are ignored.
  audit: {
    async record(event_type, details = {}) {
      try {
        await request("/audit", { method: "POST", body: JSON.stringify({ event_type, details }) });
      } catch (e) {
        console.warn("Audit logging failed:", e?.message || e);
      }
    },
  },

  // The AI Assistant (server/routes/assistant.ts). Conversations belong to the
  // signed-in user; answers stream back as server-sent events.
  assistant: {
    status: () => request("/assistant/status"),
    listConversations: () => request("/assistant/conversations"),
    createConversation: (title) => request("/assistant/conversations", { method: "POST", body: JSON.stringify({ title }) }),
    getConversation: (id) => request(`/assistant/conversations/${id}`),
    renameConversation: (id, title) => request(`/assistant/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    async deleteConversation(id) {
      const url = `/assistant/conversations/${id}`;
      const res = await fetch(`${API_BASE}${url}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw await toApiError(res, url);
    },
    confirmAction: (id) => request(`/assistant/actions/${id}/confirm`, { method: "POST" }),
    cancelAction: (id) => request(`/assistant/actions/${id}/cancel`, { method: "POST" }),
    /**
     * Sends a question and calls onEvent(name, data) for each streamed event
     * until the answer ends. Abort with `signal` to stop the answer.
     */
    async streamMessage(conversationId, text, { signal, onEvent }) {
      const url = `/assistant/conversations/${conversationId}/messages`;
      const res = await fetch(`${API_BASE}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ text }),
        credentials: "include",
        signal,
      });
      if (!res.ok) throw await toApiError(res, url);
      const parser = createSseParser(({ event, data }) => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }
        onEvent(event, parsed);
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.end();
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
        const res = await fetch(`${API_BASE}/integrations/file/upload`, {
          method: "POST",
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
