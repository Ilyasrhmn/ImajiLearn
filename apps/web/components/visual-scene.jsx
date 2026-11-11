import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";

export default function VisualScene({ visual, step, fallback }) {
  const figure = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const root = figure.current;
    if (!root) return;
    let live = true;
    let dispose;
    function unavailable() {
      if (live) setFailed(true);
    }
    import("../lib/anatomy/scene-viewer.mjs").then(({ mountVisualScene }) => {
      if (live) dispose = mountVisualScene(root, visual, step, unavailable);
    }).catch(unavailable);
    return () => {
      live = false;
      dispose?.();
    };
  }, [visual, step, failed]);

  if (failed) return fallback;

  return <figure className="visual-specimen visual-photo-specimen visual-scene" ref={figure}>
    <nav className="visual-location" aria-label="Posisi di model" data-scene-location />
    <div className="visual-stage visual-scene-stage" data-scene-stage tabIndex={-1}>
      <svg className="visual-scene-leaders" data-scene-leaders aria-hidden="true" />
      <div className="visual-scene-controls">
        <label className="visual-scene-range" hidden>
          <span>Pisahkan lapisan</span><input type="range" min="0" max="100" defaultValue="0" />
        </label>
        <button type="button" className="source-secondary visual-scene-turn" data-scene-turn aria-label="Putar model">
          <RotateCw size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
    <figcaption className="visual-caption" role="status" aria-atomic="true">
      <div className="visual-caption-copy"><strong>{step?.label ?? visual.title}</strong><p>{step?.detail ?? ""}</p></div>
    </figcaption>
  </figure>;
}
