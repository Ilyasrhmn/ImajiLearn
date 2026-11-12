"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { navigateAfterSessionChange, sessionChangeKey } from "@imajilearn/shared/lib/session.mjs";
import { Loading, ErrorState } from "./ui";

const Session = createContext(null);
export const useSession = () => useContext(Session);

export default function SessionGate({ children }) {
  const [user, setUser] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/app/api/v1/auth/session", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (controller.signal.aborted) return;
      if (response.status === 401) { navigateAfterSessionChange("/app/masuk"); return; }
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.data?.user?.id) throw new Error(result?.error?.message || "Sesi belum dapat dimuat.");
      if (!controller.signal.aborted) setUser(result.data.user);
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof TypeError ? "Sesi belum dapat dimuat. Periksa koneksi dan coba lagi." : err.message); });
    const storage = event => { if (event.key === sessionChangeKey) window.location.reload(); };
    const pageshow = event => { if (event.persisted) window.location.reload(); };
    const profileUpdated = () => setAttempt(n => n + 1);
    window.addEventListener("storage", storage); window.addEventListener("pageshow", pageshow);
    window.addEventListener("profile-updated", profileUpdated);
    return () => { controller.abort(); window.removeEventListener("storage", storage); window.removeEventListener("pageshow", pageshow); window.removeEventListener("profile-updated", profileUpdated); };
  }, [attempt]);
  if (error) return <main className="entry-loading"><ErrorState message={error} onRetry={() => { setError(""); setAttempt(n => n + 1); }} /></main>;
  if (!user) return <main className="entry-loading"><Loading label="Memuat sesi" /></main>;
  return <Session.Provider value={user}><div key={user.id}>{children}</div></Session.Provider>;
}
