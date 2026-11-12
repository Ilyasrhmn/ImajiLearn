"use client";
import { apiPath } from "@imajilearn/shared/lib/session.mjs";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";
import "./material-slides.css";

export default function MaterialSlides({ deck, teacherId, illustrationsPath, revision }) {
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [visuals, setVisuals] = useState(() => Object.fromEntries((deck.illustrations ?? []).map((status, index) => [index, status])));
  const [imageError, setImageError] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [imageVersions, setImageVersions] = useState({});
  const [zoomed, setZoomed] = useState(false);
  const currentSpeech = useRef(null);
  const slide = deck.slides[index];
  const illustrationQuery = "?revision=" + encodeURIComponent(revision);

  const visual = visuals[index];
  const imagePath = illustrationsPath + "/" + index + illustrationQuery;
  const statusPath = imagePath + "&view=status";
  const imageUrl = apiPath(imagePath + "&imageVersion=" + (imageVersions[index] ?? 0));

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
    setImageError("");
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
    const narration = [slide.title, ...slide.points].map(text => {
      const sentence = text.trim();
      return /[.!?\u2026]$/.test(sentence) ? sentence : `${sentence}.`;
    }).join("\n\n");
    const utterance = new window.SpeechSynthesisUtterance(narration);
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

  async function replaceImage() {
    if (replacing) return;
    setReplacing(true);
    setImageError("");
    try {
      await studioRequest(teacherId, illustrationsPath + illustrationQuery, {
        method: "POST", body: { index, replace: true },
      });
      const { data } = await studioRequest(teacherId, statusPath);
      setVisuals(current => ({ ...current, [index]: data }));
      setImageVersions(current => ({ ...current, [index]: (current[index] ?? 0) + 1 }));
    } catch (failure) {
      setImageError(failure.message);
    } finally {
      setReplacing(false);
    }
  }

  return <article className="format-detail material-reading material-slides">
    <h2 tabIndex={-1} data-output-heading>{deck.title}</h2>
    <section className={`material-slide${zoomed ? " material-slide-zoomed" : ""}${visual?.skipped ? " material-slide-text-only" : ""}`} key={index}
      aria-label={`Slide ${index + 1} dari ${deck.slides.length}`}>
      <div className="material-slide-text">
        <h3>{slide.title}</h3>
        <ul>{slide.points.map(point => <li key={point}>{point}</li>)}</ul>
      </div>
      {visual?.ready ? (
        <button className="material-slide-image" type="button" aria-expanded={zoomed}
          aria-label={zoomed ? "Kecilkan ilustrasi" : "Perbesar ilustrasi"} onClick={() => setZoomed(current => !current)}>
          <Image loading="eager" src={imageUrl}
            alt={"Ilustrasi " + slide.title} width={1024} height={1024} unoptimized />
          <span className="material-slide-image-control" aria-hidden="true">
            {zoomed ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </span>
        </button>
      ) : null}
    </section>
    <div className="material-slide-controls">
      <div className="material-slide-pagination">
        <button type="button" className="icon-button source-secondary" aria-label="Slide sebelumnya"
          disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <output aria-label="Nomor slide">{index + 1} / {deck.slides.length}</output>
        <button type="button" className="icon-button source-secondary" aria-label="Slide berikutnya"
          disabled={index === deck.slides.length - 1} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      <div className="material-slide-actions">
        <button type="button" className="source-secondary" onClick={speak}>
          {speaking ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          {speaking ? "Hentikan suara" : "Bacakan slide"}
        </button>
        {visual?.ready && <button type="button" className="source-secondary material-slide-regenerate" onClick={replaceImage} disabled={replacing}>
          <RefreshCw size={18} aria-hidden="true" className={replacing ? "is-busy" : undefined} />
          {replacing ? "Membuat ilustrasi\u2026" : "Buat ulang ilustrasi"}
        </button>}
      </div>
    </div>
    {imageError && <p className="source-error" role="alert">{imageError}</p>}
    {error && <p className="source-error" role="alert">{error}</p>}
  </article>;
}
