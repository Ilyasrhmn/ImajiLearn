"use client";
import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { navigateAfterSessionChange } from "./session-reload";

export default function LogoutButton({ label }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  async function logout() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (response.status !== 204) throw new Error("Logout failed");
      navigateAfterSessionChange("/masuk");
    } catch {
      setFailed(true);
      setPending(false);
      submitting.current = false;
    }
  }
  return <>
    <button type="button" className="logout" aria-label="Keluar" title="Keluar" disabled={pending} onClick={logout}><LogOut size={20} aria-hidden="true" />{label && <span>{pending ? "Keluar…" : label}</span>}</button>
    {failed && <span role="alert">Gagal keluar. Coba lagi.</span>}
  </>;
}
