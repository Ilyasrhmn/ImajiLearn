"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Layers3, RotateCcw, RotateCw } from "lucide-react";
import { CubeModel, EarthModel } from "./visual-models";
import PhotosynthesisFigure from "./visual-photosynthesis";
import VisualScene from "./visual-scene";
import { AssemblyFigure } from "./visual-solids";
import VisualDisclosure from "./visual-disclosure";
import { clotParticles, clotStages, orbitBodies, resolveVisualModel } from "../lib/visual-templates.mjs";
import "./material-visual.css";

function PhotosynthesisLesson({ visual }) {
  const [active, setActive] = useState(0);
  const { steps } = visual;
  const step = steps[active];
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
function SolarFallback({ visual }) {
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState(null);
  const step = visual.orbitSteps[active];
  const next = visual.orbitSteps[active + 1];
  const bodies = orbitBodies(step.center);
  return <figure className="visual-specimen visual-photo-specimen">
        <div className="visual-stage">
          <svg className="visual-plate" viewBox="0 0 600 320" role="group" aria-label="Model orbit">
            {bodies.filter(body => body.radius).map(body => <ellipse key={body.label}
              cx="300" cy="160" rx={body.radius * 91} ry={body.radius * 51} fill="none" stroke="#829580" />)}
            {bodies.map(({ label, color, size, radius, angle }) => {
              const x = 300 + radius * 91 * Math.cos(angle);
              const y = 160 + radius * 51 * Math.sin(angle);
              return <g key={label} data-part="" role="button" tabIndex={0} aria-label={label}
                aria-pressed={selected === label}
                onClick={() => setSelected(label)}
                onKeyDown={event => {
                  if (!["Enter", " "].includes(event.key)) return;
                  event.preventDefault();
                  setSelected(label);
                }}>
                <circle cx={x} cy={y} r={size * 61} fill={color} stroke="#345047" />
                <text x={x} y={y - size * 61 - 8} textAnchor="middle" fill="#213b42" fontSize="17" fontWeight="700">{label}</text>
              </g>;
            })}
          </svg>
          <div className="visual-solar-fallback-nav">
            {active > 0 && <button type="button" className="visual-quiet-button" onClick={() => { setSelected(null); setActive(active - 1); }}>Sebelumnya</button>}
            {next && <button type="button" className="visual-quiet-button" onClick={() => { setSelected(null); setActive(active + 1); }}>{next.label} ↗</button>}
          </div>
        </div>
        <figcaption className="visual-caption" role="status"><div className="visual-caption-copy">
          <strong>{selected ?? step.label}</strong>
          <p>{selected && selected !== bodies[0].label
            ? `${selected} mengelilingi ${bodies[0].label}${step.center === "earth" ? " dalam model historis ini" : ""}.`
            : step.detail}</p>
        </div></figcaption>
      </figure>;
}

function ClotFallback() {
  const [active, setActive] = useState(0);
  return <figure className="visual-specimen visual-photo-specimen">
    <div className="visual-stage">
      <svg className="visual-plate" viewBox="0 0 600 320" role="group" aria-label="Pembuluh darah">
        <path d="M75 111Q130 60 506 100Q562 152 519 227Q213 265 82 207Z" fill="#bd6966" stroke="#8f4c52" strokeWidth="3" />
        <path d="M88 119Q212 85 510 112L521 171Q303 220 92 184Z" fill="#e7a299" />
        <ellipse cx="305" cy="173" rx="71" ry="26" fill="#743d46" />
        {clotParticles(active).map(([x,y,z], index) =>
          <ellipse key={index} cx={305 + x * 84} cy={168 + z * 39 - y * 16} rx="11" ry="5" fill="#f0bf67" stroke="#986845" />)}
        {active === 2 && Array.from({ length: 12 }, (_, index) => {
          const y = 144 + index * 3;
          return <path key={index} d={`M240 ${y} Q302 ${177 - index * 3} 374 ${176 - index * 3}`} fill="none" stroke="#ffdfb7" strokeWidth="2" />;
        })}
        {clotStages.slice(0, Math.min(3, active + 2)).map(({ label }, index) => {
          const [x, y, anchorX, anchorY] = [[415, 68, 450, 112], [134, 238, 265, 174], [415, 238, 332, 156]][index];
          return <g key={label}>
            <path d={`M${x + 75} ${y + 18}L${anchorX} ${anchorY}`} stroke="#694a44" fill="none" />
            <circle cx={anchorX} cy={anchorY} r="5" fill="#fff9ef" stroke="#694a44" />
            <foreignObject x={x} y={y} width="150" height="47">
              <button type="button" className="visual-quiet-button" aria-pressed={index === active} onClick={() => setActive(index)}>{label}</button>
            </foreignObject>
          </g>;
        })}
      </svg>
    </div>
    <figcaption className="visual-caption" role="status"><div className="visual-caption-copy">
      <strong>{clotStages[active].label}</strong><p>{clotStages[active].detail}</p>
    </div></figcaption>
  </figure>;
}

export default function MaterialVisual({ visual: savedVisual }) {
  const visual = useMemo(() => resolveVisualModel(savedVisual), [savedVisual]);
  if (!visual) return null;
  return <article className="format-detail material-reading material-visual">
    <h2 tabIndex={-1} data-output-heading>{visual.title}</h2>
    {visual.kind === "earth" && <VisualScene visual={visual} fallback={<EarthModel details={visual.details} />} />}
    {visual.kind === "blood_clot" && <VisualScene visual={visual} fallback={<ClotFallback />} />}
    {visual.kind === "solar_system" && <VisualScene visual={visual} fallback={<SolarFallback visual={visual} />} />}
    {visual.kind === "assembly" && <VisualScene visual={visual} fallback={<AssemblyVisual parts={visual.parts} />} />}
    {visual.kind === "cube_net" && <VisualScene visual={visual} fallback={<CubeModel detail={visual.detail} />} />}
    {visual.kind === "photosynthesis" && <PhotosynthesisLesson visual={visual} />}
  </article>;
}
