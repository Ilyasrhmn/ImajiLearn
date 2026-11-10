"use client";

import { startTransition, useEffect, useId, useLayoutEffect, useRef, useState, ViewTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import Icon from "./icon";
import { ProjectorButton } from "./material-projector";
import Modal, { closeModal } from "./modal";
import { Mascot } from "./mascot";
import "./material-reading.css";
import { ImagePlus } from "lucide-react";
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

function ReadingQuestion({ item, onClose }) {
  const [choice, setChoice] = useState(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(false);
  const correct = choice === item.answerIndex;
  const questionId = useId();

  return <Modal title="Pertanyaan kelas" onClose={onClose} wide className="immersive-quiz">
    <div className="quiz-layout">
      <div className="quiz-character"><Mascot kind={checked && !correct ? "eraser" : "pencil"} mood={checked && !correct ? "think" : "happy"} /></div>
      <div className="quiz-content">
        <h2 id={questionId}>{item.question}</h2>
        <fieldset className="answers" aria-labelledby={questionId}>
          {item.options.map((option, i) => <label key={i} className={`answer${choice === i ? " chosen" : ""}${checked && i === item.answerIndex ? " correct" : ""}`}>
            <input type="radio" name="answer" checked={choice === i} onChange={() => { setChoice(i); setChecked(false); }} />
            <span className="answer-letter">{String.fromCharCode(65 + i)}</span>
            <span>{option}</span>
            {checked && i === item.answerIndex && <Icon name="check" />}
          </label>)}
        </fieldset>
        <div aria-live="polite">
          {checked && <div className={`answer-feedback ${correct ? "is-correct" : "is-retry"}`}>
            <strong>{correct ? "Betul!" : "Belum tepat."}</strong>
            <p>{item.explanation}</p>
          </div>}
          {hint && !checked && <p className="hint">{item.hint}</p>}
        </div>
        <div className="quiz-actions">
          {checked ? <button className="button" type="button" onClick={() => closeModal(onClose)}>Lanjut belajar<Icon name="arrow" /></button>
            : <button className="button" type="button" disabled={choice === null} onClick={() => setChecked(true)}>Kunci jawaban<Icon name="check" /></button>}
          {(checked || item.hint) && <button className="text-button" type="button" onClick={() => {
            if (checked) { setChoice(null); setChecked(false); setHint(false); }
            else setHint(!hint);
          }}>{checked ? "Coba lagi" : hint ? "Tutup petunjuk" : "Minta petunjuk"}</button>}
        </div>
      </div>
    </div>
  </Modal>;
}

function ReadingFooter({ index, total, canGoBack, canGoNext, previous, next, finish, sourceHref }) {
  return <div className="reading-footer">
      <div className="lesson-progress" role="progressbar" aria-label="Bagian bacaan" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1}>
        <span style={{ width: `${(index + 1) / total * 100}%` }} />
      </div>
      <div className="lesson-pagination">
        <button className="text-button" type="button" disabled={!canGoBack} onClick={previous}><Icon name="back" />Sebelumnya</button>
        <span aria-live="polite">{index + 1} / {total}</span>
        {canGoNext ? <button className="button" type="button" onClick={next}>Berikutnya<Icon name="arrow" /></button>
          : sourceHref ? <Link className="button" href={sourceHref}>Kembali ke sumber<Icon name="arrow" /></Link>
          : <button className="button" type="button" onClick={finish}>Keluar proyektor<Icon name="arrow" /></button>}
      </div>
    </div>;
}

function QuestionTriggers({ questions, onQuestion }) {
  return <div className="question-triggers">
                {questions.map((item, q) => <button className="question-trigger" type="button" key={q} aria-label={questions.length === 1 ? "Buka pertanyaan untuk kelas" : `Buka pertanyaan ${q + 1} untuk kelas`} onClick={() => onQuestion(item)}>?</button>)}
              </div>;
}

function Projector({ section, index, total, change, exit, illustration, questions, onQuestion }) {
  const viewport = useRef(null);
  const columns = useRef(null);
  useLayoutEffect(() => {
    const frame = viewport.current;
    const text = columns.current;
    let active = true;
    function fit() {
      if (!active || !frame.clientHeight) return;
      text.style.fontSize = "";
      const max = parseFloat(getComputedStyle(text).fontSize);
      let low = 1;
      let high = max;
      while (high - low > .1) {
        const size = (low + high) / 2;
        text.style.fontSize = size + "px";
        if (text.getBoundingClientRect().height <= frame.clientHeight) low = size;
        else high = size;
      }
      text.style.fontSize = (high === max ? max : low) + "px";
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    document.fonts?.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [section]);

  function move(direction) {
    const next = index + direction;
    if (next >= 0 && next < total) change(next);
  }

  useEffect(() => {
    function key(event) {
      if (event.defaultPrevented || document.querySelector("dialog[open]") || event.target.closest("input, textarea, select")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        exit();
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "Home" || event.key === "End") {
          change(event.key === "Home" ? 0 : total - 1);
        } else {
          move(["ArrowRight", "ArrowDown", "PageDown"].includes(event.key) ? 1 : -1);
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return <>
    <header className="lesson-toolbar projector-toolbar">
      <ProjectorButton active onClick={exit} />
    </header>
    <h2 className="projector-title">{section.heading}</h2>
    <div className={`projector-stage${illustration ? " with-illustration" : ""}`}>
      <div className={"projector-text" + (questions.length ? " has-questions" : "")}>
      <div className="projector-viewport" ref={viewport}>
        <div className="projector-columns" ref={columns}>
          {section.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </div>
      </div>
        {questions.length > 0 && <QuestionTriggers questions={questions} onQuestion={onQuestion} />}
      </div>
      {illustration}
    </div>
    <ReadingFooter index={index} total={total} canGoBack={index > 0} canGoNext={index < total - 1}
      previous={() => move(-1)} next={() => move(1)} finish={exit} />
  </>;
}

export default function MaterialReading({ reading, teacherId, illustrationPath, sourceHref }) {
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [classroom, setClassroom] = useState(false);
  const lesson = useRef(null);
  const heading = useRef(null);
  const previousIndex = useRef(0);
  const { sections, quiz } = reading;
  const section = sections[index];
  const total = sections.length;
  const chapterIllustration = `${illustrationPath}?section=${index}`;
  const questions = quiz.some(item => item.sectionIndex !== undefined)
    ? quiz.filter((item, position) => (item.sectionIndex ?? Math.min(position, total - 1)) === index)
    : index === total - 1 ? quiz.slice(index) : quiz.slice(index, index + 1);

  function change(next) {
    startTransition(() => setIndex(next));
  }

  useEffect(() => {
    if (index === previousIndex.current) return;
    previousIndex.current = index;
    if (!classroom) heading.current?.scrollIntoView({ block: "nearest" });
  }, [classroom, index]);

  useEffect(() => {
    const sync = () => setClassroom(document.fullscreenElement === lesson.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleProjector() {
    if (classroom) {
      setClassroom(false);
      if (document.fullscreenElement === lesson.current) await document.exitFullscreen().catch(() => {});
    } else {
      setClassroom(true);
      try { await lesson.current.requestFullscreen?.(); } catch {}
    }
  }

  return <article ref={lesson} className={`immersive-reading lesson-page${classroom ? " classroom-mode" : ""}`} aria-label={reading.title}>
    {classroom ? <Projector section={section} index={index} total={total} change={setIndex} exit={toggleProjector}
      questions={questions} onQuestion={setQuestion} illustration={<ReadingIllustration key={chapterIllustration} teacherId={teacherId} path={chapterIllustration} title={section.heading} />} /> : <>
    <div className="lesson-toolbar">
      <ProjectorButton onClick={toggleProjector} />
    </div>
    <ViewTransition update="immersive-page" default="none">
      <div className="reading-content">
        <h2 ref={heading} tabIndex={-1}>{section.heading}</h2>
        <div className="reading-columns">
          <div className="reading-paragraphs">
            {section.paragraphs.map((paragraph, i) => <div className="paragraph-wrap" key={i}>
              <p>{paragraph}</p>
              {i === Math.min(1, section.paragraphs.length - 1) && questions.length > 0 && <QuestionTriggers questions={questions} onQuestion={setQuestion} />}
            </div>)}
          </div>
          <ReadingIllustration key={chapterIllustration} teacherId={teacherId} path={chapterIllustration} title={section.heading} />
        </div>
      </div>
    </ViewTransition>
    <ReadingFooter index={index} total={total} canGoBack={index > 0} canGoNext={index < total - 1}
      previous={() => change(index - 1)} next={() => change(index + 1)} sourceHref={sourceHref} />
    </>}
    {question && <ReadingQuestion item={question} onClose={() => setQuestion(null)} />}
  </article>;
}
