"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Mascot } from "./mascot";
import "./landing-install.css";

const seenKey = "imajilearn:install-invitation";

export default function LandingInstall({ href }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) return;
    try {
      if (sessionStorage.getItem(seenKey)) return;
    } catch { /* Storage can be unavailable in private browsing. */ }
    const timer = setTimeout(() => setOpen(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  function remember() {
    try { sessionStorage.setItem(seenKey, "1"); } catch { /* Dismissal still works. */ }
    setOpen(false);
  }

  if (!open) return null;
  return (
    <aside aria-label="Instal ImajiLearn" className="landing-install">
      <Mascot kind="book" />
      <div className="landing-install-intro">
        <h2>Instal ImajiLearn</h2>
        <p>Buka jadwal mengajar dan materi langsung dari layar utama.</p>
      </div>
      <div className="landing-install-actions">
        <a className="landing-button" href={href} onClick={remember}>
          <Download size={16} aria-hidden="true" />Instal
        </a>
        <button type="button" onClick={remember}>Nanti</button>
      </div>
    </aside>
  );
}
