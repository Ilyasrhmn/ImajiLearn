"use client";
import { useEffect, useRef, useState } from "react";

export default function Disclosure({ title, children, className = "" }) {
  const root = useRef(null), body = useRef(null), animation = useRef(null), desired = useRef(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => () => animation.current?.cancel(), []);

  function toggle(event) {
    event.preventDefault();
    const next = !desired.current;
    desired.current = next;
    setExpanded(next);
    const element = root.current, content = body.current;
    const height = element.open ? content.getBoundingClientRect().height : 0;
    animation.current?.cancel();
    content.inert = !next;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.open = next;
      return;
    }
    element.open = true;
    const motion = content.animate([
      { height: `${height}px`, opacity: height ? 1 : 0 },
      { height: `${next ? content.scrollHeight : 0}px`, opacity: next ? 1 : 0 },
    ], { duration: next ? 260 : 180, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
    animation.current = motion;
    motion.finished.then(() => {
      if (animation.current !== motion) return;
      element.open = next;
      motion.cancel();
      animation.current = null;
    }).catch(() => {});
  }

  return <details ref={root} className={`disclosure ${className}`}>
    <summary onClick={toggle} aria-expanded={expanded}>{title}</summary>
    <div ref={body} className="disclosure-body"><div className="disclosure-content">{children}</div></div>
  </details>;
}
