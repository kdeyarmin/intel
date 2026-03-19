const API_BASE = "/api";

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

  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: res.statusText }));
    const err = new Error(data.message || `Request failed: ${res.status}`);
    err.name = "ApiError";
    err.status = res.status;
    err.data = data;
    throw err;
  }

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
      let lastCheck = new Date().toISOString();
      const poll = async () => {
        if (!active) return;
        try {
          const items = await request(`/entities/${entityName}?sort=-updated_date&limit=50`);
          if (items.length > 0) {
            callback({ type: "update", data: items });
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

      async UploadFile(file) {
        const formData = new FormData();
        formData.append("file", file);
        const token = localStorage.getItem("auth_token");
        const res = await fetch(`${API_BASE}/integrations/file/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          body: formData,
        });
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
      return request(`/functions/${functionName}`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  },

  storage: {
    getFileUrl(path) {
      return `${API_BASE}/storage/${path}`;
    },
  },
};
