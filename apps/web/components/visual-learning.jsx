"use client";

import { useEffect, useState } from "react";
import { learningModels } from "../lib/learning-models.mjs";

// Semantic SVG remains available when the device cannot create a WebGL context.
export default function LearningFallback({ visual }) {
  const [active, setActive] = useState(0);
  const [coast, setCoast] = useState([]);
  const selected = new Set(visual.parts.map(part => part.id));
  useEffect(() => {
    let live = true;
    if (visual.model === "indonesia") import("../lib/anatomy/indonesia-coast.mjs").then(module => { if (live) setCoast(module.indonesiaCoast); });
    return () => { live = false; };
  }, [visual.model]);
  const spec = learningModels[visual.model];
  const positions = {
    respiratory: { trachea: [300, 90], bronchi: [285, 175], lungs: [400, 230], alveoli: [200, 255], diaphragm: [300, 315] },
    angklung: { bamboo: [260, 220], frame: [420, 110], shake: [300, 325], sound: [355, 220] },
    circuit: { battery: [190, 190], wire: [300, 285], switch: [300, 110], bulb: [420, 190] },
    deliberation: { opinion: [195, 100], listen: [405, 100], agreement: [405, 285], responsibility: [195, 285] },
    food_chain: { grass: [120, 210], rabbit: [240, 210], snake: [360, 210], eagle: [480, 210] },
    indonesia: { sumatra: [130, 187], java: [220, 253], kalimantan: [260, 186], sulawesi: [330, 205], papua: [490, 225] },
  }[visual.model];
  return <figure className="visual-figure">
    <svg viewBox="0 0 600 390" role="group" aria-label={spec.label} style={{ width: "100%", maxHeight: "65vh", background: "#e9eee0" }}>
      <g fill="none" stroke="#496359" strokeWidth="4" strokeLinejoin="round">
        {visual.model === "indonesia" && coast.map((ring, i) => <path key={i} fill="#829d65" strokeWidth=".6" d={ring.map(([lng, lat], index) => `${index ? "L" : "M"}${300 + (lng - 118) * 10},${200 - (lat + 2) * 10}`).join(" ") + "Z"} />)}
        {visual.model === "food_chain" && <>
          {selected.has("grass") && <path stroke="#759452" strokeWidth="8" d="M100 255Q80 200 90 170M110 255V155M120 255Q150 200 140 175" />}
          {selected.has("rabbit") && <><ellipse cx="230" cy="230" rx="28" ry="20" fill="#d5c6aa" /><circle cx="250" cy="205" r="16" fill="#d5c6aa" />
            <ellipse cx="245" cy="178" rx="5" ry="19" fill="#d5c6aa" /><ellipse cx="258" cy="178" rx="5" ry="19" fill="#d5c6aa" /></>}
          {selected.has("snake") && <path stroke="#719055" strokeWidth="13" d="M335 250C315 205 390 260 370 222S330 205 372 192" />}
          {selected.has("eagle") && <><path fill="#806749" d="M465 255L453 210L477 194L500 211L489 255Z" /><circle cx="480" cy="192" r="16" fill="#e1d8bd" /><path fill="#c69b47" d="M492 192L510 197L492 201Z" /></>}
        </>}
        {visual.model === "respiratory" && <>
          <path fill="#d88c86" d="M280 140C245 105 178 156 165 273Q173 314 276 295Z M320 140C355 105 422 156 435 273Q427 314 324 295Z" />
          <path stroke="#ecd1b3" strokeWidth="22" d="M300 65V160L255 207M300 160L345 207" />
          {Array.from({ length: 6 }, (_, i) => <path key={i} stroke="#b88e78" d={`M290 ${76 + i * 12}h20`} />)}
          <path stroke="#b96567" strokeWidth="12" d="M165 325Q300 290 435 325" />
        </>}
        {visual.model === "angklung" && <>
          <path stroke="#92713c" strokeWidth="10" d="M180 340V65H425V340M175 335H430" />
          <path stroke="#b99850" strokeWidth="40" d="M260 150V310M355 190V310" />
          <path d="M260 65V130M355 65V170M235 310H285M330 310H380" />
        </>}
        {visual.model === "circuit" && <>
          <path stroke="#b66d55" d="M190 160V110H275M325 110H420V165" />
          <path stroke="#527885" d="M420 215V285H190V215" />
          <rect x="170" y="160" width="40" height="70" rx="10" fill="#527885" />
          <path d="M275 110L325 85" /><circle cx="420" cy="185" r="32" fill="#f2d67c" />
          <path d="M405 220H435M410 230H430" />
        </>}
        {visual.model === "deliberation" && <>
          <ellipse cx="300" cy="200" rx="125" ry="70" fill="#c5a174" />
          {[[195, 100], [405, 100], [405, 285], [195, 285]].map(([x, y], i) => <g key={i}>
            <circle cx={x} cy={y - 18} r="22" fill="#d5ac85" /><path d={`M${x - 30} ${y + 43}v-20q30 -25 60 0v20Z`} fill={i % 2 ? "#527885" : "#b66d55"} />
          </g>)}
        </>}
      </g>
      {visual.parts.map((part, i) => {
        const [x, y] = positions[part.id]; const left = x < 300; const end = left ? 35 : 565;
        return <g key={part.id} role="button" tabIndex={0} aria-label={spec.parts[part.id].label} aria-pressed={i === active}
          onClick={() => setActive(i)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setActive(i); } }}
          style={{ cursor: "pointer" }} fill={i === active ? "#ac482f" : "#365c4c"}>
          <path d={`M${x} ${y}L${left ? end + 110 : end - 110} ${y - 15}H${end}`} fill="none" stroke="currentColor" />
          <circle cx={x} cy={y} r="6" /><text x={end} y={y - 23} textAnchor={left ? "start" : "end"} fontSize="15">{spec.parts[part.id].label}</text>
        </g>;
      })}
    </svg>
    <figcaption className="visual-caption" role="status"><div className="visual-caption-copy">
      <strong>{spec.parts[visual.parts[active].id].label}</strong><p>{visual.parts[active].detail}</p>
    </div></figcaption>
  </figure>;
}
