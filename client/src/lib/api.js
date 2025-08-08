export async function apiJson(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function listDir(rel = "") {
  const u = `/api/list?path=${encodeURIComponent(rel)}`;
  const res = await fetch(u, { credentials: "include" });
  if (res.status === 401) {
    const e = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function login(password) {
  return apiJson("/auth/login", { method: "POST", body: JSON.stringify({ password }) });
}

export async function logout() {
  return apiJson("/auth/logout", { method: "POST" });
}
