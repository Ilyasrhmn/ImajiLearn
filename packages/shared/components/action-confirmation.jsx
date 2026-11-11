import { Mascot } from "./mascot";
import "./action-confirmation.css";

export default function ActionConfirmation({
  title, children, error, onCancel, onConfirm, confirmLabel,
  cancelLabel = "Batal", busy = false, mobile = false,
}) {
  return <div className="action-confirmation">
    <div aria-hidden="true"><Mascot kind="eraser" mood="think" /></div>
    <div className="action-confirmation-copy">
      <h2>{title}</h2>
      {children}
      {error && <p className="action-confirmation-error" role="alert">{error}</p>}
      <div className="action-confirmation-actions">
        <button type="button" className={mobile ? "secondary" : "source-secondary"} disabled={busy} onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={mobile ? "danger-button" : "upload-button"} disabled={busy} onClick={onConfirm}>{busy ? "Menghapus…" : confirmLabel}</button>
      </div>
    </div>
  </div>;
}
