export async function apiJson(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { ...(opts.body && !opts.form ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) },
    redirect: "follow",
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

// SPA login: post urlencoded to /login; cookie will be set via redirect response
export async function login(password) {
  const form = new URLSearchParams({ password });
  const res = await fetch("/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "follow",
  });
  if (!res.ok && !res.redirected) throw new Error(`HTTP ${res.status}`);
  return true;
}

export async function logout() {
  // server implements GET /logout
  const res = await fetch("/logout", { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return true;
}

export async function listDir(rel = "") {
  const url = rel ? `/api/list?path=${encodeURIComponent(rel)}` : "/api/list";
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401) {
    const e = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
