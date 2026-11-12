"use client";
import { useEffect, useRef, useState } from "react";

export default function PwaControls({ blocked }) {
  const [install, setInstall] = useState(null), [waiting, setWaiting] = useState(null), [error, setError] = useState("");
  const requested = useRef(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext || process.env.NODE_ENV !== "production") return;
    let alive = true, registration;
    const offerInstall = event => { event.preventDefault(); setInstall(event); };
    const installed = () => setInstall(null);
    const updated = () => { if (requested.current) window.location.reload(); };
    const check = () => { if (alive && registration?.waiting) setWaiting(registration.waiting); };
    const found = () => { registration.installing?.addEventListener("statechange", check); };
    window.addEventListener("beforeinstallprompt", offerInstall); window.addEventListener("appinstalled", installed);
    navigator.serviceWorker.addEventListener("controllerchange", updated);
    navigator.serviceWorker.register("/app/sw.js", { scope: "/app/", updateViaCache: "none" }).then(value => { if (!alive) return; registration = value; check(); registration.addEventListener("updatefound", found); }).catch(() => { if (alive) setError("Mode offline belum siap. Muat ulang untuk mencoba lagi."); });
    return () => { alive = false; window.removeEventListener("beforeinstallprompt", offerInstall); window.removeEventListener("appinstalled", installed); navigator.serviceWorker.removeEventListener("controllerchange", updated); registration?.removeEventListener("updatefound", found); };
  }, []);
  return <>{install && <button className="secondary full" disabled={blocked} onClick={async () => { try { await install.prompt(); await install.userChoice; setInstall(null); } catch { setError("Instalasi belum berhasil. Coba melalui menu browser."); } }}>Pasang ImajiLearn</button>}{waiting && <button className="secondary full" disabled={blocked} onClick={() => { requested.current = true; waiting.postMessage({ type: "ACTIVATE_UPDATE" }); }}>Perbarui aplikasi</button>}{error && <p className="feedback error" role="status">{error}</p>}</>;
}
