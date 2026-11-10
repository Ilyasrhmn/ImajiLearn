"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Music2, RefreshCw } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";
import "./material-song.css";

const labels = { verse: "Bait", chorus: "Refrain", response: "Tanya jawab" };
const pending = song => song && !["ready", "failed", "uncertain"].includes(song.status);
const progress = { writing: "Menyusun lirik dari materi…", submitting: "Mengirim lirik untuk dibuat menjadi lagu…", generating: "Membuat musik dan vokal…" };

export default function MaterialSong({ song: initialSong, teacherId, songPath, revision, onBack }) {
  const [song, setSong] = useState(initialSong);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(0);
  const audio = useRef(null);
  const retrying = useRef(false);

  useEffect(() => {
    const controller = new AbortController(); let timer;
    const deadline = Date.now() + 10 * 60_000;
    async function poll() {
      try {
        const { data } = await studioRequest(teacherId, songPath, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!data) { setError("Lagu belum tersedia. Kembali ke materi untuk membuat lagu."); return; }
        setSong(data); setError("");
        if (pending(data) || data.alignmentPending) {
          if (Date.now() < deadline) timer = setTimeout(poll, 5000);
          else setError("Lagu masih diproses. Kamu bisa kembali dan membukanya lagi nanti.");
        }
      } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [teacherId, songPath, attempt]);

  async function retry() {
    if (retrying.current) return;
    retrying.current = true; setBusy(true); setError("");
    try {
      const { data } = await studioRequest(teacherId, songPath, { method: "POST" });
      setSong(data); setAttempt(value => value + 1);
    } catch (error) { setError(error.message); }
    finally { retrying.current = false; setBusy(false); }
  }

  const cues = song?.cues ?? [];
  const active = cues.find(cue => position >= cue.start && position < cue.end)?.line ?? -1;
  const lines = song?.sections?.flatMap(section => section.lines) ?? [];
  const ready = song?.status === "ready";
  let lineIndex = 0;
  return <article className="format-detail material-song">
    <button type="button" className="source-secondary" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Kembali</button>
    <h2 tabIndex={-1} data-output-heading>{song?.title ?? "Lagu belajar"}</h2>
    {ready ? <>
      <section className="song-player" aria-label="Pemutar lagu belajar">
        {cues.length > 0 && <div className="song-current-line" aria-label="Lirik saat ini"><p>{active >= 0 ? lines[active] : position === 0 ? "Ayo, bersiap bernyanyi!" : "Dengarkan musiknya…"}</p></div>}
        <audio ref={audio} controls preload="metadata" aria-label={song.title}
          src={`/api/v1${songPath}/audio?revision=${encodeURIComponent(revision)}`}
          onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
          onSeeked={event => setPosition(event.currentTarget.currentTime)}
          onError={() => setError("Audio belum bisa diputar. Periksa koneksi lalu buka ulang lagu.")} />
        {song.alignmentPending && !cues.length && <p className="song-sync-note" role="status">Menyiapkan sorotan lirik…</p>}
      </section>
      <div className="song-lyrics" aria-label="Lirik lagu">
        {song.sections.map((section, sectionIndex) => <section className={`song-lyric-section song-${section.type}`} key={sectionIndex}>
          <h3>{labels[section.type]}</h3>
          <ol>{section.lines.map(line => {
            const index = lineIndex++;
            return <li key={index} data-active={active === index} aria-current={active === index ? "true" : undefined}>{line}</li>;
          })}</ol>
        </section>)}
      </div>
      <section className="song-learning"><h3>Yang dipelajari</h3><ul>{song.learningPoints.map(point => <li key={point}>{point}</li>)}</ul></section>
    </> : pending(song) ? <div className="song-progress" role="status"><Music2 size={32} aria-hidden="true" /><h3>{progress[song.status]}</h3><p>Lagu bisa dibuka kembali setelah selesai.</p></div>
      : <div className="song-progress"><h3>Lagu belum siap</h3><p role="status">{song?.error ?? "Kembali ke materi untuk membuat lagu."}</p>
        {song?.status === "failed" && <button className="upload-button" type="button" disabled={busy} onClick={retry}><RefreshCw size={18} aria-hidden="true" />{busy ? "Menyiapkan lagu…" : "Coba buat lagi"}</button>}
      </div>}
    {error && <div className="song-error" role="alert"><p>{error}</p><button className="source-secondary" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Periksa lagi</button></div>}
    <p className="song-attribution"><a href="https://treblo.com" target="_blank" rel="noopener noreferrer">Powered by Treblo</a></p>
  </article>;
}
