import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Browser from "./components/Browser";
import Login from "./components/Login";
import { listDir, logout } from "./lib/api";

export default function App() {
  const [authed, setAuthed] = useState(null); // null=checking, true/false
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await listDir("");
        if (alive) setAuthed(true);
      } catch (e) {
        if (alive) setAuthed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (authed === null) {
    return <div className="min-h-screen grid place-items-center text-neutral-600">Checking session…</div>;
  }
  if (!authed) {
    return (
      <Login
        onAuthed={() => {
          setAuthed(true);
          navigate("/browse", { replace: true });
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/browse" replace />} />
      <Route path="/browse/*" element={<Browser />} />
      <Route path="/logout" element={<LogoutScreen onDone={() => setAuthed(false)} />} />
      <Route path="*" element={<Navigate to="/browse" replace />} />
    </Routes>
  );
}

function LogoutScreen({ onDone }) {
  useEffect(() => {
    (async () => {
      try {
        await logout();
      } catch {}
      onDone?.();
      location.href = "/"; // full reload to clear state
    })();
  }, []);
  return <div className="min-h-screen grid place-items-center text-neutral-600">Signing out…</div>;
}
