"use client";
import { useEffect, useRef, useState, useId, useImperativeHandle } from "react";
import { AlertCircle, LoaderCircle, X } from "lucide-react";
import ActionConfirmation from "@imajilearn/shared/components/action-confirmation.jsx";

export function Loading({ label = "Memuat" }) { return <div className="loading" role="status"><LoaderCircle size={22} className="spinner" /><span>{label}</span></div>; }
export function ErrorState({ message, onRetry }) { return <div className="error-state"><p role="alert"><AlertCircle size={18} />{message}</p>{onRetry && <button className="secondary" onClick={onRetry}>Coba lagi</button>}</div>; }
export function Feedback({ children, error = false }) { return children && <p className={error ? "feedback error" : "feedback"} role={error ? "alert" : "status"}>{children}</p>; }
export function Empty({ title, children }) { return <div className="empty-state"><h2>{title}</h2>{children}</div>; }
export function PageTitle({ title, action }) { return <div className="page-title"><h1>{title}</h1>{action}</div>; }
export function PasswordInput({ label, name, ...props }) {
  const [visible, setVisible] = useState(false);
  return <label className="field">{label}<span className="password-input"><input {...props} name={name} type={visible ? "text" : "password"} /><button type="button" aria-label={visible ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? "Sembunyikan" : "Lihat"}</button></span></label>;
}

export function Sheet({ title, children, onClose, busy = false, dirty = false, closeRef, confirmation = false }) {
  const ref = useRef(null), timer = useRef(null), closingRef = useRef(false);
  const [closing, setClosing] = useState(false), [discard, setDiscard] = useState(false);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current, previousFocus = document.activeElement;
    dialog.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { clearTimeout(timer.current); dialog.close(); document.body.style.overflow = previous; queueMicrotask(() => { if (previousFocus?.isConnected) previousFocus.focus?.(); }); };
  }, []);
  useEffect(() => {
    function warn(event) { if (dirty && !closingRef.current) { event.preventDefault(); event.returnValue = ""; } }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function finish(after) {
    if (closingRef.current) return;
    closingRef.current = true; setClosing(true);
    timer.current = setTimeout(() => { onClose(); if (typeof after === "function") after(); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  }
  useImperativeHandle(closeRef, () => ({ close: finish }));
  function requestClose() { if (busy || closingRef.current) return; if (dirty) setDiscard(true); else finish(); }
  const showConfirmation = discard || confirmation;
  return <dialog ref={ref} className={`sheet${closing ? " is-closing" : ""}`}
    aria-label={showConfirmation ? discard ? "Buang perubahan?" : title : undefined}
    aria-labelledby={showConfirmation ? undefined : id}
    onCancel={event => { event.preventDefault(); requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div className={`sheet-body${showConfirmation ? " sheet-confirmation" : ""}`}>
      <div className="sheet-grip" />
      <div className="sheet-heading">
        {!showConfirmation && <h2 id={id}>{title}</h2>}
        <button type="button" className="icon-button" disabled={busy || closing} onClick={requestClose} aria-label="Tutup"><X size={22} /></button>
      </div>
      {discard && <ActionConfirmation mobile title="Buang perubahan?" cancelLabel="Lanjutkan edit" confirmLabel="Buang perubahan"
        onCancel={() => setDiscard(false)} onConfirm={() => finish()}>
        <p>Perubahan yang belum disimpan akan hilang.</p>
      </ActionConfirmation>}
      <div hidden={discard} inert={closing}>{children}</div>
    </div>
  </dialog>;
}
