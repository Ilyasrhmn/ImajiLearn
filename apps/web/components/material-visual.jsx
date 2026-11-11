"use client";

import { useState } from "react";
import { CubeModel, EarthModel, legacyPlantFocus, PhotosynthesisModel } from "./visual-models";
import "./material-visual.css";

function FlowVisual({ steps, plant, legacy }) {
  const [active, setActive] = useState(0);
  return <>
    {plant && <PhotosynthesisModel focus={legacy ? legacyPlantFocus(steps[active]) : steps[active].focus} />}
    <ol className="visual-flow-steps" aria-label="Urutan proses">
      {steps.map((step, index) => <li key={step.label}>
        <button type="button" className="source-secondary" aria-pressed={active === index}
          onClick={() => setActive(index)}>{step.label}</button>
      </li>)}
    </ol>
    <div className="visual-detail" role="status">
      <h3>{steps[active].label}</h3>
      <p>{steps[active].detail}</p>
    </div>
  </>;
}
function MainIdeaVisual({ sentences, answerIndex, detail }) {
  const [answer, setAnswer] = useState(null);
  return <section className="visual-main-idea" aria-label="Kalimat utama">
    <h3>Pilih kalimat utama</h3>
    <div className="visual-sentences">
      {sentences.map((sentence, index) => (
        <button key={sentence} type="button" className="source-secondary"
          aria-pressed={answer === index} onClick={() => setAnswer(index)}>{sentence}</button>
      ))}
    </div>
    {answer !== null && <p role="status">{answer === answerIndex ? detail : "Coba pilih kalimat yang merangkum isi paragraf."}</p>}
  </section>;
}

export default function MaterialVisual({ visual }) {
  return <article className="format-detail material-reading material-visual">
    <h2 tabIndex={-1} data-output-heading>{visual.title}</h2>
    {visual.kind === "earth" && <EarthModel details={visual.details} />}
    {visual.kind === "cube_net" && <CubeModel detail={visual.detail} />}
    {visual.kind === "main_idea" && <MainIdeaVisual {...visual} />}
    {visual.kind === "photosynthesis" && <FlowVisual steps={visual.steps} plant />}
    {visual.kind === "flow" && <FlowVisual steps={visual.steps} legacy plant={/\bfotosintesis\b/iu.test(visual.title)} />}
  </article>;
}
