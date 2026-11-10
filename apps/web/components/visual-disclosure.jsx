import { useEffect, useRef } from "react";

export default function VisualDisclosure({ label, children, className, dismissOnChoose = false }) {
  const details = useRef(null);
  const summary = useRef(null);

  useEffect(() => {
    function dismiss(event) {
      const element = details.current;
      if (element?.open && !element.contains(event.target)) element.open = false;
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function close() {
    summary.current.focus({ preventScroll: true });
    details.current.open = false;
  }

  return <details ref={details} className={`visual-disclosure ${className}`}
    onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}
    onKeyDown={event => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.preventDefault();
        close();
      }
    }}>
    <summary ref={summary}>{label}</summary>
    <div className="visual-disclosure-panel" onClick={event => {
      if (dismissOnChoose && event.target.closest("button:enabled")) close();
    }}>{children}</div>
  </details>;
}
