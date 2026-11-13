"use client";
import { apiPath } from "@imajilearn/shared/lib/session.mjs";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";
import MaterialProjector from "./material-projector";
import NarrationButton from "./narration-button";
import "./material-slides.css";

export default function MaterialSlides({ deck, teacherId, illustrationsPath, revision, sampleImages }) {
  const [index, setIndex] = useState(0);
  const [visuals, setVisuals] = useState(() => Object.fromEntries((deck.illustrations ?? []).map((status, index) => [index, status])));
  const [imageError, setImageError] = useState("");
  const [replacing, setReplacing] = useState(false);
  const replacementRequest = useRef(false);
  const [replacements, setReplacements] = useState(null);
  const [imageVersions, setImageVersions] = useState({});
  const [zoomed, setZoomed] = useState(false);
  const slide = deck.slides[index];
  const illustrationQuery = "?revision=" + encodeURIComponent(revision);

  const visual = visuals[index];
  const imagePath = illustrationsPath + "/" + index + illustrationQuery;
  const statusPath = imagePath + "&view=status";
  useEffect(() => {
    if (sampleImages) return;
    const controller = new AbortController();
    studioRequest(teacherId, statusPath, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setReplacements(data.replacements);
    }).catch(() => {});
    return () => controller.abort();
  }, [teacherId, statusPath, sampleImages]);
  const imageUrl = sampleImages?.[index] ?? apiPath(imagePath + "&imageVersion=" + (imageVersions[index] ?? 0));

  function move(step) {
    setZoomed(false);
    setImageError("");
    setIndex(current => Math.min(deck.slides.length - 1, Math.max(0, current + step)));
  }

  async function replaceImage() {
    if (replacementRequest.current || replacements?.remaining === 0) return;
    replacementRequest.current = true;
    setReplacing(true);
    setImageError("");
    try {
      await studioRequest(teacherId, illustrationsPath + illustrationQuery, {
        method: "POST", body: { index, replace: true },
      });
      const { data } = await studioRequest(teacherId, statusPath);
      setReplacements(data.replacements);
      setVisuals(current => ({ ...current, [index]: data }));
      setImageVersions(current => ({ ...current, [index]: (current[index] ?? 0) + 1 }));
    } catch (failure) {
      setImageError(failure.message);
    } finally {
      try {
        const { data } = await studioRequest(teacherId, statusPath);
        setReplacements(data.replacements);
      } catch { /* The next status request refreshes the persisted quota. */ }
      replacementRequest.current = false;
      setReplacing(false);
    }
  }

  return <MaterialProjector toolbar={<NarrationButton key={index} title={slide.title} paragraphs={slide.points} label="Bacakan slide" unavailable="Browser ini belum bisa membacakan slide." />}>
  <article className="format-detail material-reading material-slides">
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
          disabled={replacing || index === 0} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <output aria-label="Nomor slide">{index + 1} / {deck.slides.length}</output>
        <button type="button" className="icon-button source-secondary" aria-label="Slide berikutnya"
          disabled={replacing || index === deck.slides.length - 1} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      {visual?.ready && !sampleImages && <div className="material-slide-actions">
        <button type="button" className="source-secondary material-slide-regenerate" onClick={replaceImage} disabled={replacing || replacements?.remaining === 0} aria-busy={replacing}>
          <RefreshCw size={18} aria-hidden="true" className={replacing ? "is-busy" : undefined} />
          {replacing ? "Membuat ilustrasi\u2026" : "Buat ulang ilustrasi"}
        </button>
        <p className="material-slide-regeneration-limit" role="status">{replacements ? `Sisa ${replacements.remaining} dari 3 permintaan buat ulang untuk seluruh slide.` : "Maksimal 3 permintaan buat ulang untuk seluruh slide."}</p>
      </div>}
    </div>
    {imageError && <p className="source-error" role="alert">{imageError}</p>}
  </article>
  </MaterialProjector>;
}
