"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import "./landing-video.css";

export default function LandingVideo() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [source, setSource] = useState(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function formatTime(time) {
    const seconds = Math.floor(Number.isFinite(time) ? time : 0);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  useEffect(() => {
    const video = videoRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = navigator.connection;
    const shouldAutoplay = !reducedMotion.matches && !connection?.saveData;
    let loaded = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loaded) {
        loaded = true;
        setSource(window.matchMedia("(max-width: 720px)").matches
          ? "/videos/imajilearn-demo-mobile.mp4" : "/videos/imajilearn-demo.mp4");
        video.autoplay = shouldAutoplay;
      }
      if (!entry.isIntersecting) video.pause();
      else if (loaded && shouldAutoplay && video.src) video.play().catch(() => {});
    }, { rootMargin: "120px 0px" });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  async function togglePlayback() {
    const video = videoRef.current;
    if (video.paused) {
      try { await video.play(); } catch { setPlaying(false); }
    } else video.pause();
  }

  function toggleSound() {
    const video = videoRef.current;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  return <section className="landing-video-section landing-shell" aria-label="Demo aplikasi ImajiLearn">
    <div className="landing-video" ref={containerRef}>
      <div className="landing-video-controls">
        {error ? <button type="button" onClick={() => {
          setError(false);
          videoRef.current.load();
        }}><RotateCcw size={18} aria-hidden="true" />Coba lagi</button>
          : <button type="button" onClick={togglePlayback} disabled={!source} aria-label={playing ? "Jeda video" : "Putar video"}>
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            {playing ? "Jeda" : "Putar"}
          </button>}
        <button type="button" onClick={toggleSound} disabled={!source} aria-pressed={!muted} aria-label={muted ? "Aktifkan suara" : "Matikan suara"}>
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          {muted ? "Aktifkan suara" : "Matikan suara"}
        </button>
      </div>
      <video
        ref={videoRef}
        src={source || undefined}
        poster="/videos/imajilearn-demo-poster.jpg"
        width="1280"
        height="800"
        muted={muted}
        loop
        playsInline
        preload="none"
        aria-label="Demo ImajiLearn, dari masuk akun hingga membuat media ajar dan soal"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
        onVolumeChange={event => setMuted(event.currentTarget.muted)}
        onError={() => setError(true)}
      />
      <div className="landing-video-progress">
        <span aria-hidden="true">{formatTime(currentTime)}</span>
        <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={!duration} aria-label="Posisi video" aria-valuetext={`${formatTime(currentTime)} dari ${formatTime(duration)}`} onChange={event => { videoRef.current.currentTime = Number(event.target.value); }} />
        <span aria-hidden="true">{formatTime(duration)}</span>
      </div>
      {error && <p role="status">Video gagal dimuat. Periksa koneksi lalu coba lagi.</p>}
    </div>
  </section>;
}
