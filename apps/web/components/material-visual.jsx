"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Layers3, RotateCcw, RotateCw } from "lucide-react";
import { CubeModel, EarthModel, legacyPlantFocus } from "./visual-models";
import PhotosynthesisFigure from "./visual-photosynthesis";
import VisualScene from "./visual-scene";
import { AssemblyFigure } from "./visual-solids";
import VisualDisclosure from "./visual-disclosure";
import "./material-visual.css";

function FlowVisual({ steps, layout }) {
  const [active, setActive] = useState(0);
  const step = steps[active];
  return <>
    <ol className={`visual-flow-steps${layout === "sequence" ? " is-sequence" : ""}`} aria-label={layout === "sequence" ? "Urutan proses" : "Bagian materi"}>
      {steps.map((step, index) => <li key={step.label}>
        <button type="button" className="source-secondary" aria-pressed={active === index}
          onClick={() => setActive(index)}>{step.label}</button>
        {layout === "sequence" && index < steps.length - 1 && <ArrowRight size={18} aria-hidden="true" />}
      </li>)}
    </ol>
    <div className="visual-detail" role="status">
      <h3>{step.label}</h3>
      <p>{step.detail}</p>
    </div>
  </>;
}

function PhotosynthesisLesson({ visual }) {
  const [active, setActive] = useState(0);
  const { steps } = visual;
  const sourceStep = steps[active];
  const step = useMemo(() => visual.kind === "flow" ? { ...sourceStep, focus: legacyPlantFocus(sourceStep) } : sourceStep, [visual.kind, sourceStep]);
  const count = `${active + 1} / ${steps.length}`;
  return <>
    <VisualScene key={active} visual={visual} step={step} fallback={<PhotosynthesisFigure step={step} />} />
    <nav className="visual-lesson-nav" aria-label="Langkah fotosintesis">
      <button type="button" className="visual-quiet-button" disabled={active === 0} aria-label="Sebelumnya" onClick={() => setActive(active - 1)}>
        <ArrowLeft size={19} aria-hidden="true" /><span>Sebelumnya</span>
      </button>
      <VisualDisclosure className="visual-step-picker" dismissOnChoose label={<>
        <span className="visual-sr-only">Pilih langkah. Langkah {active + 1} dari {steps.length}.</span>
        <span aria-hidden="true">{count}</span><ChevronDown size={16} aria-hidden="true" />
      </>}>
        <ol className="visual-step-list" aria-label="Semua langkah">
          {steps.map(({ label }, index) => <li key={index}>
            <button className="visual-quiet-button" type="button" aria-current={index === active ? "step" : undefined}
              onClick={() => setActive(index)}><span>{index + 1}</span>{label}</button>
          </li>)}
        </ol>
      </VisualDisclosure>
      <button type="button" className="visual-quiet-button" disabled={active === steps.length - 1} aria-label="Berikutnya"
        onClick={() => setActive(active + 1)}><span>Berikutnya</span><ArrowRight size={19} aria-hidden="true" /></button>
    </nav>
  </>;
}

function AssemblyVisual({ parts }) {
  const [angle, setAngle] = useState(52);
  const [spread, setSpread] = useState(0);
  const [selected, setSelected] = useState(parts[0].id);
  const drag = useRef(null);
  const selectedPart = parts.find(part => part.id === selected);
  return <>
    <figure className="visual-specimen">
      <div className="visual-stage">
        <svg className="visual-plate visual-orbit" viewBox="0 0 720 380" role="img"
          aria-label={parts.map(part => part.label).join(", ")}
          onPointerDown={event => {
            if (event.isPrimary && event.button === 0) drag.current = { id: event.pointerId, x: event.clientX, angle };
          }}
          onPointerMove={event => {
            if (drag.current?.id !== event.pointerId) return;
            const delta = event.clientX - drag.current.x;
            if (Math.abs(delta) < 5 && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setAngle(drag.current.angle + delta * .55);
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) drag.current = null; }}>
          <AssemblyFigure parts={parts} angle={angle} spread={spread / 100} selected={selected} onSelect={setSelected} />
        </svg>
      </div>
      <div className="visual-tools">
        <div className="visual-turn" role="group" aria-label="Putar model">
          <button className="source-secondary" type="button" onClick={() => setAngle(value => value - 18)} aria-label="Putar kiri"><RotateCcw size={19} aria-hidden="true" /></button>
          <button className="source-secondary" type="button" onClick={() => setAngle(value => value + 18)} aria-label="Putar kanan"><RotateCw size={19} aria-hidden="true" /></button>
        </div>
        <label className="visual-range"><Layers3 size={18} aria-hidden="true" />Pisahkan bagian
          <input type="range" min="0" max="100" value={spread} onChange={event => setSpread(Number(event.target.value))}
            aria-valuetext={spread === 0 ? "Dirakit" : spread === 100 ? "Terurai" : `${spread}%`} />
        </label>
      </div>
    </figure>
    <div className="visual-layer-buttons visual-scene-steps" role="group" aria-label="Bagian model">
      {parts.map(part => <button key={part.id} className="source-secondary" type="button" aria-pressed={part.id === selected}
        onClick={() => setSelected(part.id)}>{part.label}</button>)}
    </div>
    <div className="visual-scene-note" role="status"><p>{selectedPart.detail}</p></div>
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

function isPhotosynthesisVisual(visual) {
  return visual.kind === "photosynthesis" || (visual.kind === "flow" && !visual.layout && /\bfotosintesis\b/iu.test(visual.title));
}

export default function MaterialVisual({ visual }) {
  const plant = isPhotosynthesisVisual(visual);
  return <article className="format-detail material-reading material-visual">
    <h2 tabIndex={-1} data-output-heading>{visual.title}</h2>
    {visual.kind === "earth" && <VisualScene visual={visual} fallback={<EarthModel details={visual.details} />} />}
    {visual.kind === "assembly" && <VisualScene visual={visual} fallback={<AssemblyVisual parts={visual.parts} />} />}
    {visual.kind === "cube_net" && <CubeModel detail={visual.detail} />}
    {visual.kind === "main_idea" && <MainIdeaVisual {...visual} />}
    {plant && <PhotosynthesisLesson visual={visual} />}
    {visual.kind === "flow" && !plant && <FlowVisual steps={visual.steps} layout={visual.layout} />}
  </article>;
}
