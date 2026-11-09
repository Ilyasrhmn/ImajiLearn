"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";
import "./material-slides.css";

export default function MaterialSlides({ deck, teacherId, illustrationsPath, revision, onBack }) {
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [imageIndexes, setImageIndexes] = useState([]);
  const [imageError, setImageError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const currentSpeech = useRef(null);
  const slide = deck.slides[index];
  const count = deck.slides.length;
  const illustrationQuery = "?revision=" + encodeURIComponent(revision);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const path = illustrationsPath + illustrationQuery;
    async function prepareImages() {
      try {
        const { data: existing } = await studioRequest(teacherId, path, { signal });
        if (signal.aborted) return;
        setImageIndexes(existing);
        const ready = new Set(existing);
        for (let next = 0; next < count && !signal.aborted; next++) {
          if (ready.has(next)) continue;
          await studioRequest(teacherId, path, { method: "POST", body: { index: next }, signal });
          if (!signal.aborted) setImageIndexes(current => [...current, next]);
        }
      } catch (error) {
        if (!signal.aborted) setImageError(error.message);
      }
    }
    prepareImages();
    return () => controller.abort();
  }, [teacherId, illustrationsPath, illustrationQuery, count, attempt]);

  useEffect(() => () => {
    if (!currentSpeech.current) return;
    currentSpeech.current = null;
    window.speechSynthesis.cancel();
  }, []);

  function stop() {
    if (currentSpeech.current) {
      currentSpeech.current = null;
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  function move(step) {
    stop();
    setError("");
    setZoomed(false);
    setIndex(current => Math.min(deck.slides.length - 1, Math.max(0, current + step)));
  }

  function speak() {
    setError("");
    if (currentSpeech.current) { stop(); return; }
    const synthesis = window.speechSynthesis;
    if (!synthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      setError("Browser ini belum bisa membacakan slide.");
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance([slide.title, ...slide.points].join("\n"));
    utterance.lang = "id-ID";
    const voice = synthesis.getVoices().find(item => /^id(?:[-_]|$)/i.test(item.lang));
    if (voice) utterance.voice = voice;
    const finish = message => {
      if (currentSpeech.current !== utterance) return;
      currentSpeech.current = null;
      setSpeaking(false);
      if (message) setError(message);
    };
    utterance.onend = () => finish();
    utterance.onerror = () => finish("Suara belum bisa diputar. Coba lagi.");
    currentSpeech.current = utterance;
    setSpeaking(true);
    try { synthesis.speak(utterance); }
    catch { finish("Suara belum bisa diputar. Coba lagi."); }
  }

  return <article className="format-detail material-reading material-slides">
    <button type="button" className="source-secondary" onClick={() => { stop(); onBack(); }}>
      <ArrowLeft size={18} aria-hidden="true" />Kembali
    </button>
    <h2 tabIndex={-1} data-output-heading>{deck.title}</h2>
    <section className={`material-slide${zoomed ? " material-slide-zoomed" : ""}`} key={index}
      aria-label={`Slide ${index + 1} dari ${deck.slides.length}`}>
      <div className="material-slide-text">
        <h3>{slide.title}</h3>
        <ul>{slide.points.map(point => <li key={point}>{point}</li>)}</ul>
      </div>
      {imageIndexes.includes(index) ? (
        <button className="material-slide-image" type="button" aria-expanded={zoomed}
          aria-label={zoomed ? "Kecilkan ilustrasi" : "Perbesar ilustrasi"} onClick={() => setZoomed(current => !current)}>
          <Image src={"/api/v1" + illustrationsPath + "/" + index + illustrationQuery}
            alt={"Ilustrasi " + slide.title} width={1024} height={1024} unoptimized />
          <span className="material-slide-image-control" aria-hidden="true">
            {zoomed ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </span>
        </button>
      ) : (
        <div className="material-slide-image-placeholder">
          {imageError ? <>
            <p role="alert">{imageError}</p>
            <button type="button" className="source-secondary"
              onClick={() => { setImageError(""); setAttempt(current => current + 1); }}>Coba lagi</button>
          </> : <p role="status">Membuat gambar {Math.min(imageIndexes.length + 1, count)} / {count}…</p>}
        </div>
      )}
    </section>
    <div className="material-slide-controls">
      <div className="material-slide-pagination">
        <button type="button" className="icon-button source-secondary" aria-label="Slide sebelumnya"
          disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <output aria-label="Nomor slide">{index + 1} / {deck.slides.length}</output>
        <button type="button" className="icon-button source-secondary" aria-label="Slide berikutnya"
          disabled={index === deck.slides.length - 1} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      <button type="button" className="source-secondary" onClick={speak}>
        {speaking ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        {speaking ? "Hentikan suara" : "Bacakan slide"}
      </button>
    </div>
    {error && <p className="source-error" role="alert">{error}</p>}
  </article>;
}
