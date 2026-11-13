"use client";
import { Minimize2 } from "lucide-react";
import { Mascot } from "./mascot";
import "./media-jobs.css";

export default function MediaGeneration({ onMinimize, compact = false }) {
  return <div className="media-generation">
    <div className="media-generation-animation" role="status" aria-label="Pembuatan media sedang berjalan">
      {!compact && <Mascot kind="book" />}<div className="media-generation-bar" aria-hidden="true" />
    </div>
    <p>Proses bisa memakan beberapa menit. Kamu dapat mengerjakan materi lain sambil menunggu. Biarkan tab ini tetap terbuka.</p>
    <button className="source-secondary" type="button" onClick={onMinimize}><Minimize2 size={18} aria-hidden="true" />Minimalkan</button>
  </div>;
}
