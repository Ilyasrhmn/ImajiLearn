"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";

function ReadingIllustration({ teacherId, path, title }) {
  const [visual, setVisual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const request = useRef(null);
  const generating = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const load = () => studioRequest(teacherId, path + "&view=status", { signal });
    load().then(async ({ data }) => {
      if (data.ready || data.skipped || signal.aborted) return data;
      return (await studioRequest(teacherId, path + "&view=status", { method: "POST", signal })).data;
    }).then(data => {
      if (!signal.aborted) setVisual(data);
    }).catch(error => {
      if (!signal.aborted) setError(error.message);
    }).finally(() => {
      if (!signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [teacherId, path]);

  async function generate() {
    if (generating.current || loading) return;
    const { signal } = request.current;
    generating.current = true;
    setBusy(true);
    setError("");
    try {
      const statusPath = path + "&view=status" + (visual?.ready ? "&replace=1" : "");
      const { data } = await studioRequest(teacherId, statusPath, { method: "POST", signal });
      if (!signal.aborted) {
        setVisual(data);
        setVersion(current => current + 1);
      }
    } catch (error) {
      if (!signal.aborted) setError(error.message);
    } finally {
      generating.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  if (visual?.skipped) return null;
  const url = "/api/v1" + path + "&imageVersion=" + version;
  return <div className="reading-illustration">
    {visual?.ready && <Image src={url} alt={"Ilustrasi " + title} width={1024} height={1024} unoptimized />}
    <button className="source-secondary" type="button" onClick={generate} disabled={loading || busy}>
      <ImagePlus size={18} aria-hidden="true" />
      {busy || loading ? "Menyiapkan ilustrasi…" : visual?.ready ? "Buat ulang ilustrasi" : "Buat ilustrasi"}
    </button>
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
    <h2 tabIndex={-1} data-output-heading>{reading.title}</h2>
    {reading.sections.map((section, index) => (
      <section key={index}>
        <h3>{section.heading}</h3>
        {section.paragraphs.map((paragraph, number) => (
          <div key={number}>
            <p>{paragraph}</p>
            {index === (reading.illustration?.sectionIndex ?? 0) && number === (reading.illustration?.paragraphIndex ?? 0) &&
              <ReadingIllustration key={illustrationPath} teacherId={teacherId} path={`${illustrationPath}?section=${index}`} title={section.heading} />}
          </div>
        ))}
      </section>
    ))}
    <section aria-label="Kuis">
      <h3>Kuis</h3>
      {reading.quiz.map((item, index) => <ReadingQuestion key={index} item={item} />)}
    </section>
  </article>;
}
