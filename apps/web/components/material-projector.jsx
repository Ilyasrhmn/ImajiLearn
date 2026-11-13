"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./icon";

export function ProjectorButton({ active = false, onClick, ref }) {
  return <button className="material-projector-button" type="button" ref={ref} onClick={onClick}>
    <Icon name="full" size={18} />
    {active ? "Keluar proyektor" : "Mode proyektor"}
  </button>;
}

export default function MaterialProjector({ children, enabled = true, toolbar }) {
  const screen = useRef(null);
  const frame = useRef(null);
  const content = useRef(null);
  const control = useRef(null);
  const [active, setActive] = useState(false);

  const exit = useCallback(() => {
    setActive(false);
    control.current?.focus({ preventScroll: true });
    if (document.fullscreenElement === screen.current) void document.exitFullscreen().catch(() => {});
  }, []);

  function enter() {
    setActive(true);
    void screen.current.requestFullscreen?.().catch(() => {});
  }

  useEffect(() => {
    if (!active) return;
    const element = screen.current;
    let native = document.fullscreenElement === element;
    function sync() {
      if (document.fullscreenElement === element) native = true;
      else if (native) exit();
    }
    function key(event) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        exit();
      }
    }
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("keydown", key);
    };
  }, [active, exit]);

  useLayoutEffect(() => {
    if (!active) return;
    const viewport = frame.current;
    const stage = content.current;
    function fit() {
      const scale = Math.min(1, viewport.clientHeight / Math.max(1, stage.offsetHeight), viewport.clientWidth / Math.max(1, stage.scrollWidth));
      stage.style.setProperty("--projector-scale", String(scale));
    }
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(viewport);
    resize.observe(stage);
    control.current?.focus({ preventScroll: true });
    return () => {
      resize.disconnect();
      stage.style.removeProperty("--projector-scale");
    };
  }, [active]);

  return <section ref={screen} className={`material-projector${active ? " is-active" : ""}`} aria-label={active ? "Mode proyektor" : undefined}>
    {enabled && <div className="material-projector-toolbar">
      {toolbar}
      <ProjectorButton active={active} ref={control} onClick={active ? exit : enter} />
    </div>}
    <div className="material-projector-frame" ref={frame}><div className="material-projector-content" ref={content}>{children}</div></div>
  </section>;
}
