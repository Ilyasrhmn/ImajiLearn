"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

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

export default function MaterialReading({ reading, onBack }) {
  return <article className="format-detail material-reading">
    <button type="button" className="source-secondary" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Kembali</button>
    <h2 tabIndex={-1} data-reading-heading>{reading.title}</h2>
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
