"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";

function ReadingIllustration({ teacherId, path, title }) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  const objectUrl = useRef(null);
  const generating = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    studioRequest(teacherId, path, { binary: true, signal: controller.signal }).then(blob => {
      if (controller.signal.aborted || !blob?.size) return;
      objectUrl.current = URL.createObjectURL(blob);
      setImage(objectUrl.current);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [teacherId, path]);

  async function generate() {
    if (generating.current || loading || image) return;
    const signal = request.current.signal;
    generating.current = true;
    setBusy(true);
    setError("");
    try {
      const blob = await studioRequest(teacherId, path, { method: "POST", binary: true, signal });
      if (signal.aborted) return;
      objectUrl.current = URL.createObjectURL(blob);
      setImage(objectUrl.current);
    } catch (error) {
      if (!signal.aborted) setError(error.message);
    } finally {
      generating.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  return <div className="reading-illustration">
    {image ? <Image src={image} alt={"Ilustrasi " + title} width={1024} height={1024} unoptimized /> :
      <button className="source-secondary" type="button" onClick={generate} disabled={loading || busy}>
        <ImagePlus size={18} aria-hidden="true" />
        {busy ? "Membuat ilustrasi…" : "Buat ilustrasi"}
      </button>}
    {error && <p className="source-error" role="alert">{error}</p>}
  </div>;
}

function ReadingQuestion({ item }) {
  const [answer, setAnswer] = useState(null);
  return <fieldset className="reading-question">
    <legend>{item.question}</legend>
    {item.options.map((option, index) => (
      <button type="button" className="source-secondary" key={option}
        aria-pressed={answer === index} onClick={() => setAnswer(index)}>{option}</button>
    ))}
    {answer !== null && <p role="status">
      {answer === item.answerIndex ? item.explanation : "Coba jawaban lain."}
    </p>}
  </fieldset>;
}

export default function MaterialReading({ reading, teacherId, illustrationPath, onBack }) {
  return <article className="format-detail material-reading">
    <button type="button" className="source-secondary" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Kembali</button>
    <h2 tabIndex={-1} data-reading-heading>{reading.title}</h2>
    <ReadingIllustration teacherId={teacherId} path={illustrationPath} title={reading.title} />
    {reading.sections.map((section, index) => (
      <section key={index}>
        <h3>{section.heading}</h3>
        {section.paragraphs.map((paragraph, number) => <p key={number}>{paragraph}</p>)}
      </section>
    ))}
    <section aria-label="Kuis">
      <h3>Kuis</h3>
      {reading.quiz.map((item, index) => <ReadingQuestion key={index} item={item} />)}
    </section>
  </article>;
}
