"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download } from "lucide-react";
import "./install-screen.css";

const standaloneQuery = "(display-mode: standalone)";
const serverSnapshot = () => false;
const noSubscription = () => () => {};
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function subscribeToDisplayMode(onChange) {
  const query = window.matchMedia(standaloneQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isStandalone() {
  return window.matchMedia(standaloneQuery).matches || navigator.standalone === true;
}

export default function InstallScreen() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const standalone = useSyncExternalStore(subscribeToDisplayMode, isStandalone, serverSnapshot);
  const ios = useSyncExternalStore(noSubscription, isIos, serverSnapshot);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const offer = event => { event.preventDefault(); setPrompt(event); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    setPrompt(null);
    try {
      const { outcome } = await prompt.prompt();
      if (outcome === "accepted") setInstalled(true);
    } catch {
      // The browser menu remains available if the native prompt fails.
    } finally {
      setBusy(false);
    }
  }

  const ready = installed || standalone;
  return (
    <main className="pwa-install-screen">
      <Image src="/app/icons/imajilearn-192.png" width={72} height={72} alt="" unoptimized priority />
      <h1>{ready ? "ImajiLearn terpasang" : "Instal ImajiLearn"}</h1>
      {!ready && (prompt || busy ? (
        <button className="primary" type="button" onClick={install} disabled={busy}>
          <Download size={18} aria-hidden="true" />{busy ? "Menunggu konfirmasi…" : "Instal"}
        </button>
      ) : (
        <p>{ios
          ? "Di Safari, ketuk Bagikan, lalu pilih Tambah ke Layar Utama."
          : "Buka menu browser, lalu pilih Instal aplikasi atau Tambahkan ke layar utama jika tersedia."}</p>
      ))}
      <Link className={ready ? "primary" : "secondary"} href="/beranda">Buka ImajiLearn</Link>
    </main>
  );
}
