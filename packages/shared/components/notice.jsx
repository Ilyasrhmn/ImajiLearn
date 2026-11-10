"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Mascot } from "./mascot";

export default function Notice({ notice, onDismiss, insideDialog = false }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!notice || paused) return;
    const timer = setTimeout(onDismiss, notice.type === "error" ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss, paused]);
  if (!notice) return null;
  const target = insideDialog ? document.querySelector("dialog[open]") : null;
  const content = <div className={`studio-toast ${notice.type || "success"}`} role={notice.type === "error" ? "alert" : "status"} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <span className="studio-toast-mascot" aria-hidden="true"><Mascot kind={notice.type === "delete" ? "eraser" : notice.type === "error" ? "correction" : "book"} mood={notice.type === "error" ? "think" : "happy"} /></span>
    <span className="studio-toast-message">{notice.message}</span>
    <button type="button" aria-label="Tutup notifikasi" onClick={onDismiss}><X size={18} /></button>
  </div>;
  return target ? createPortal(content, target) : content;
}
