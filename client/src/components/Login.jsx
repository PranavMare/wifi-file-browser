import { useState } from "react";
import { login } from "../lib/api";

export default function Login({ onAuthed }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(password);
      onAuthed?.();
    } catch (ex) {
      setErr(ex?.body?.error || ex.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Enter Password</h1>
          <p className="text-sm text-neutral-600">Access to the library is restricted.</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Password"
          autoFocus
        />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={loading || !password} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 disabled:opacity-50" type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
