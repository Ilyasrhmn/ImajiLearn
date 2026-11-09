"use client";

import { useId, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { earthLayers } from "../lib/visual-templates.mjs";
import FlowObject from "./flow-scene";
import "./material-visual.css";

function ellipsePath(radius) {
  const x = radius * .52;
  const y = radius * .82;
  return `M 0 ${-y} A ${x} ${y} 0 1 1 0 ${y} A ${x} ${y} 0 1 1 0 ${-y} Z`;
}

function ModelSpread({ label, spread, onChange }) {
  return <label className="visual-spread">
    <span>{label}</span>
    <input type="range" min={0} max={100} value={spread}
      aria-valuetext={spread + "%"} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

function GlobeArtwork({ id }) {
  return <defs>
    <radialGradient id={id + "-ocean"} cx="32%" cy="25%" r="77%">
      <stop stopColor="#aac9cb" />
      <stop offset=".57" stopColor="#719da5" />
      <stop offset="1" stopColor="#3d6974" />
    </radialGradient>
    <clipPath id={id + "-round"}><circle cx="235" cy="185" r="141" /></clipPath>
    <clipPath id={id + "-left"}><rect x="94" y="44" width="141" height="282" /></clipPath>
    <clipPath id={id + "-right"}><rect x="235" y="44" width="141" height="282" /></clipPath>
    <g id={id + "-globe"}>
      <circle cx="235" cy="185" r="141" fill={`url(#${id}-ocean)`} stroke="#315460" strokeWidth="2" />
      <g clipPath={`url(#${id}-round)`}>
        <path fill="#96b68c" stroke="#567a6c" strokeWidth="1.5"
          d="m104 128 26-30 41-18 35 8 17 18-8 16-22 4-8 16-23 2-3 19 12 15-8 14-18-16-11-24-24-5zm76 56 22-5 29 23 5 19-14 14-9 27-23 30-12-8 5-25-10-20 4-18-11-16zm60-76 25-25 28 3 16 12 38-2 26 17 17 25-21 18-23-6-15 16-20-3-15 14-19-5-17-18-20-6-12-20zm16 61 30 4 19 18-8 22-16 8-9 25-18-9-9-21-16-20 10-18zm68 65 29-12 22 13 9 19-21 16-31-5-14-13z" />
        <path d="M110 133q118-56 252 0M97 186q138-59 277 0M109 243q132-41 249 4M235 45q-112 141 0 281m0-281q112 141 0 281"
          fill="none" stroke="#e4efdb" strokeOpacity=".32" strokeWidth="1" />
      </g>
    </g>
  </defs>;
}

function EarthVisual({ details }) {
  const [spread, setSpread] = useState(0);
  const [active, setActive] = useState(earthLayers[0]);
  const id = useId();
  const opened = Math.min(1, spread / 46);
  const separated = Math.max(0, (spread - 46) / 54);
  return <>
    <svg className="visual-earth" viewBox="0 0 720 370" aria-hidden="true">
      <GlobeArtwork id={id} />
      <g transform={`translate(${125 * (1 - opened)} 0)`}>
        <ellipse cx="264" cy="337" rx="180" ry="14" fill="#a8b9a1" opacity=".36" />
        <use href={"#" + id + "-globe"} clipPath={`url(#${id}-left)`} />
        {separated > 0 && <path d={`M235 185H${235 + earthLayers.at(-1).offset * separated}`}
          fill="none" stroke="#7e9381" strokeDasharray="5 6" />}
        {earthLayers.map(layer => {
          const shape = ellipsePath(layer.radius) + (layer.inner ? ellipsePath(layer.inner) : "");
          return <g key={layer.id} className="visual-earth-layer" data-layer={layer.id}
            transform={`translate(${235 + layer.offset * separated} 185)`}
            pointerEvents={opened === 0 ? "none" : undefined}
            onClick={() => setActive(layer)}>
            <path d={shape} fill={layer.side} fillRule="evenodd" transform="translate(-9 0)" />
            <path d={shape} fill={layer.fill} fillRule="evenodd"
              stroke={active.id === layer.id ? "#243e43" : layer.side} strokeWidth="1.6" />
          </g>;
        })}
        {spread > 0 && separated < .35 && <g transform={`translate(${160 * opened} 0)`}
          opacity={1 - separated / .35} pointerEvents="none">
          <use href={"#" + id + "-globe"} clipPath={`url(#${id}-right)`} />
        </g>}
        {opened < 1 && <use href={"#" + id + "-globe"} opacity={1 - opened} pointerEvents="none" />}
      </g>
    </svg>
    <ModelSpread label="Buka penampang" spread={spread} onChange={setSpread} />
    <div className="visual-layer-buttons" role="group" aria-label="Lapisan Bumi">
      {earthLayers.map(layer => <button key={layer.id} type="button" className="source-secondary"
        aria-pressed={active.id === layer.id} onClick={() => setActive(layer)}>{layer.label}</button>)}
    </div>
    <div className="visual-detail" role="status">
      <h3>{active.label}</h3>
      <p>{details[active.id] ?? "Bagian ini belum dijelaskan di materi."}</p>
    </div>
  </>;
}

function FlowVisual({ steps }) {
  const [active, setActive] = useState(0);
  const [spread, setSpread] = useState(0);
  const parts = steps.map((step, index) => {
    const progress = index / (steps.length - 1);
    return {
      step,
      x: 143 + 432 * progress,
      y: 192 - 34 * progress + (index % 2 ? -22 : 18),
      lift: spread * (index % 2 ? .72 : .55),
      shift: spread * (progress - .5) * .55,
    };
  });
  return <>
    <svg className="visual-diorama" viewBox="0 0 720 300" aria-hidden="true">
      <path d="M38 177 455 86 681 182v18L264 292 38 195Z" fill="#a6b69e" stroke="#738575" />
      <path d="M38 177 455 86 681 182 264 274Z" fill="#dce5cc" stroke="#738575" />
      <path d="M70 180 454 96 650 182 264 263Z" fill="#e8ecd9" stroke="#b8c5a9" />
      {parts.slice(1).map(({ x, y, step }, index) => {
        const previous = parts[index];
        const middle = (x + previous.x) / 2;
        return <path key={step.label} className={index === active - 1 ? "visual-route-active" : undefined}
          d={`M${previous.x} ${previous.y} Q${middle} ${previous.y} ${middle} ${(y + previous.y) / 2} T${x} ${y}`}
          fill="none" stroke={index === active - 1 ? "#b64f38" : "#8ba18b"} strokeWidth="3" strokeDasharray="5 5" />;
      })}
      {parts.map(({ step, x, y, lift, shift }, index) => <g key={step.label}>
        <ellipse cx={x} cy={y} rx={46} ry={16} fill={active === index ? "#eed2ae" : "#bdccb0"}
          stroke={active === index ? "#b64f38" : "#879e87"} />
        {spread > 0 && <path d={`M${x} ${y} ${x + shift} ${y - lift}`}
          fill="none" stroke="#879e87" strokeDasharray="4 4" />}
        <g className="visual-model-part" data-active={active === index}
          transform={`translate(${x + shift - 64} ${y - lift - 76})`} onClick={() => setActive(index)}>
          <rect x="20" y="14" width="92" height="70" fill="transparent" />
          <FlowObject step={step} />
        </g>
      </g>)}
    </svg>
    <ModelSpread label="Pisahkan bagian" spread={spread} onChange={setSpread} />
    <div className="visual-layer-buttons" role="group" aria-label="Bagian alur">
      {steps.map((step, index) => <button key={step.label} type="button" className="source-secondary"
        aria-pressed={active === index} onClick={() => setActive(index)}>{step.label}</button>)}
    </div>
    <div className="visual-detail" role="status">
      <h3>{steps[active].label}</h3>
      <p>{steps[active].detail}</p>
    </div>
  </>;
}

export default function MaterialVisual({ visual, onBack }) {
  return <article className="format-detail material-reading material-visual">
    <button type="button" className="source-secondary" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Kembali</button>
    <h2 tabIndex={-1} data-output-heading>{visual.title}</h2>
    {visual.kind === "earth" ? <EarthVisual details={visual.details} /> : <FlowVisual steps={visual.steps} />}
  </article>;
}
