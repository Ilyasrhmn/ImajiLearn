"use client";
import { apiPath } from "@imajilearn/shared/lib/session.mjs";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, Music2, Pause, Play, RefreshCw, Repeat2, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";
import MaterialProjector from "./material-projector";
import { Mascot } from "./mascot";
import "./material-song.css";

const pending = song => song && !["ready", "failed", "uncertain"].includes(song.status);
const progress = { writing: "Menyusun lirik dari materi…", submitting: "Mengirim lirik untuk dibuat menjadi lagu…", generating: "Membuat musik dan vokal…" };
const clock = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;

function SongLyrics({ sections }) {
  return sections.map((section, index) => <div key={index} className="karaoke-stanza">
    {section.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
  </div>);
}

function Karaoke({ song, audioUrl }) {
  const audio = useRef(null);
  const lyricsId = useId();
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [audioError, setAudioError] = useState("");
  const cues = song.cues ?? [];
  const lines = song.sections.flatMap(section => section.lines);
  const active = cues.find(cue => position >= cue.start && position < cue.end)?.line ?? -1;
  const next = cues.find(cue => cue.start > position)?.line;
  const focus = cues.length ? (active >= 0 ? active : (next ?? lines.length - 1)) : 0;
  const finished = cues.length > 0 && position >= cues.at(-1).end;
  const countdown = playing && cues[0]?.start > position ? Math.ceil(cues[0].start - position) : 0;

  async function togglePlay() {
    const element = audio.current;
    if (!element.paused) { element.pause(); return; }
    setStarting(true);
    setAudioError("");
    try {
      if (element.ended) element.currentTime = 0;
      await element.play();
    } catch {
      setAudioError("Audio belum bisa diputar. Coba muat ulang.");
    } finally {
      setStarting(false);
    }
  }

  function seek(time) {
    const element = audio.current;
    if (!Number.isFinite(element.duration)) return;
    element.currentTime = time;
    setPosition(element.currentTime);
  }

  function syncDuration({ currentTarget }) {
    setDuration(Number.isFinite(currentTarget.duration) ? currentTarget.duration : 0);
  }

  function reloadAudio() {
    setAudioError("");
    setPosition(0);
    setDuration(0);
    setPlaying(false);
    audio.current.load();
  }

  return <>
    <section className="karaoke-stage" aria-label="Lirik karaoke">
      <p className="karaoke-cue" role="status">{finished ? "Selesai" : countdown ? `Mulai dalam ${countdown}…` : song.alignmentPending && !cues.length ? "Menyiapkan sorotan lirik…" : ""}</p>
      <div className="karaoke-lyric-window">
        {lines.map((line, index) => Math.abs(index - focus) <= 1 && <p key={index}
          className={`karaoke-line${active === index ? " is-current" : ""}${index < focus ? " is-past" : ""}`}
          aria-current={active === index ? "true" : undefined}>{line}</p>)}
      </div>
      <div className={`karaoke-buddy${playing ? " is-singing" : ""}`} aria-hidden="true"><Mascot kind="pencil" mood="happy" /></div>
    </section>
    <audio ref={audio} src={audioUrl} preload="metadata" muted={muted} loop={loop}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
      onSeeked={event => setPosition(event.currentTarget.currentTime)}
      onDurationChange={syncDuration}
      onError={() => { setPlaying(false); setAudioError("Audio tidak dapat dimuat. Coba muat ulang."); }} />
    <div className="karaoke-progress">
      <span aria-hidden="true">{clock(position)}</span>
      <input type="range" min="0" max={duration} step="0.05" value={Math.min(position, duration)}
        disabled={!duration} onChange={event => seek(Number(event.target.value))} aria-label="Posisi lagu"
        aria-valuetext={`${clock(position)} dari ${clock(duration)}`} />
      <span aria-hidden="true">{clock(duration)}</span>
    </div>
    <div className="karaoke-controls">
      <button type="button" className="icon-button" aria-label="Ulangi dari awal" title="Ulangi dari awal" disabled={!duration} onClick={() => seek(0)}><RotateCcw size={21} aria-hidden="true" /></button>
      <button type="button" className="upload-button karaoke-play" disabled={starting || Boolean(audioError)} onClick={togglePlay}>
        {playing ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
        {starting ? "Menyiapkan…" : playing ? "Jeda lagu" : "Putar lagu"}
      </button>
      <button type="button" className="icon-button" aria-label={muted ? "Aktifkan suara lagu" : "Matikan suara lagu"}
        title={muted ? "Aktifkan suara" : "Matikan suara"} aria-pressed={muted} onClick={() => setMuted(value => !value)}>
        {muted ? <VolumeX size={21} aria-hidden="true" /> : <Volume2 size={21} aria-hidden="true" />}
      </button>
      <button type="button" className="icon-button" aria-label="Ulang otomatis" title="Ulang otomatis" aria-pressed={loop} onClick={() => setLoop(value => !value)}><Repeat2 size={21} aria-hidden="true" /></button>
    </div>
    {audioError && <div className="song-error" role="alert"><p>{audioError}</p><button type="button" className="source-secondary" onClick={reloadAudio}>Coba muat ulang</button></div>}
    {lines.length > 0 && <div className="karaoke-all-lyrics">
      <button type="button" className="karaoke-lyrics-toggle" aria-expanded={expanded} aria-controls={lyricsId} onClick={() => setExpanded(value => !value)}>
        <FileText size={18} aria-hidden="true" />
        {expanded ? "Sembunyikan lirik" : "Lihat seluruh lirik"}
      </button>
      <div className="karaoke-lyrics-panel" id={lyricsId} data-expanded={expanded} inert={!expanded}>
        <div className="karaoke-lyrics-text"><SongLyrics sections={song.sections} /></div>
      </div>
    </div>}
  </>;
}

export default function MaterialSong({ song: initialSong, teacherId, songPath, revision }) {
  const [song, setSong] = useState(initialSong);
  const [versionId, setVersionId] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
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

  const ready = song?.status === "ready";
  const versions = song?.versions ?? [];
  const selected = versions.find(version => version.id === versionId) ?? versions[0];
  const audioUrl = apiPath(`${songPath}/audio?revision=${encodeURIComponent(revision)}${selected ? `&version=${encodeURIComponent(selected.id)}` : ""}`);
  return <MaterialProjector enabled={ready}><article className="format-detail material-song">
    <h2 tabIndex={-1} data-output-heading>{song?.title ?? "Lagu belajar"}</h2>
    {ready && versions.length > 1 && <div className="song-versions" role="group" aria-label="Versi lagu">
      {versions.map(version => <button key={version.id} type="button" className="source-secondary"
        aria-pressed={selected?.id === version.id} onClick={() => setVersionId(version.id)}>
        <Music2 size={18} aria-hidden="true" />Versi {version.number}
      </button>)}
    </div>}
    {ready ? <Karaoke key={selected?.id ?? "original"} song={selected ? { ...song, cues: selected.cues } : song} audioUrl={audioUrl} />
      : pending(song) ? <div className="song-progress" role="status"><Music2 size={32} aria-hidden="true" /><h3>{progress[song.status]}</h3></div>
      : <div className="song-progress"><h3>Lagu belum siap</h3><p role="status">{song?.error ?? "Kembali ke materi untuk membuat lagu."}</p>
        {song?.status === "failed" && <button className="upload-button" type="button" disabled={busy} onClick={retry}><RefreshCw size={18} aria-hidden="true" />{busy ? "Menyiapkan lagu…" : "Coba buat lagi"}</button>}
      </div>}
    {error && <div className="song-error" role="alert"><p>{error}</p><button className="source-secondary" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Periksa lagi</button></div>}
  </article></MaterialProjector>;
}
