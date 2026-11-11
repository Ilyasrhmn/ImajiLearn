import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { geometryCatalog } from "../lib/geometry-catalog.mjs";

export default function GeometryFallback({ visual }) {
  const [index, setIndex] = useState(0);
  const item = visual.shapes[index];
  const spec = geometryCatalog[item.shape];
  const project = ([x,y,z]) => [300 + (x - z * .45) * 66, 165 - (y + z * .3) * 66];
  return <figure className="visual-specimen">
    <div className="visual-stage">
      <svg className="visual-plate" viewBox="0 0 600 320" role="img" aria-label={spec.label}>
        {spec.vertices ? (spec.faces ?? [spec.vertices.map((_, i) => i)]).map((face, i) =>
          <polygon key={i} points={face.map(vertex => project(spec.vertices[vertex]).join(",")).join(" ")}
            fill={["#a9c78e", "#83a876", "#729b88", "#91b6ad"][i % 4]} fillOpacity=".83" stroke="#37564c" strokeWidth="2" />)
          : item.shape === "circle" || item.shape === "sphere" ? <>
            <circle cx="300" cy="160" r="83" fill="#a9c78e" stroke="#37564c" strokeWidth="2" />
            {item.shape === "sphere" && <ellipse cx="300" cy="160" rx="83" ry="28" fill="none" stroke="#37564c" />}
          </> : <>
            {item.shape === "cone" ? <path d="M224 231L300 70L376 231Z" fill="#a9c78e" stroke="#37564c" strokeWidth="2" />
              : <path d="M224 90V231A76 24 0 0 0 376 231V90Z" fill="#a9c78e" stroke="#37564c" strokeWidth="2" />}
            <ellipse cx="300" cy="231" rx="76" ry="24" fill="#83a876" stroke="#37564c" strokeWidth="2" />
            {item.shape === "cylinder" && <ellipse cx="300" cy="90" rx="76" ry="24" fill="#e3b56f" stroke="#37564c" strokeWidth="2" />}
          </>}
      </svg>
    </div>
    <figcaption className="visual-caption"><div className="visual-caption-copy"><strong>{spec.label}</strong><p>{item.detail}</p></div></figcaption>
    {visual.shapes.length > 1 && <nav className="visual-lesson-nav" aria-label="Pilih bangun">
      <button className="visual-quiet-button" type="button" disabled={!index} onClick={() => setIndex(index - 1)} aria-label="Sebelumnya"><ArrowLeft size={19} /></button>
      <span>{index + 1} / {visual.shapes.length}</span>
      <button className="visual-quiet-button" type="button" disabled={index === visual.shapes.length - 1} onClick={() => setIndex(index + 1)} aria-label="Berikutnya"><ArrowRight size={19} /></button>
    </nav>}
  </figure>;
}
