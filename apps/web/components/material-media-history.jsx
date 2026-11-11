"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Mascot } from "./mascot";

const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

function pageLabel(item) {
  if (!item.first) return "Seluruh materi";
  const ranges = item.pages?.length ? item.pages.reduce((parts, page) => {
    const last = parts.at(-1);
    if (last?.[1] === page - 1) last[1] = page;
    else parts.push([page, page]);
    return parts;
  }, []) : [[item.first, item.last]];
  return "Hlm. " + ranges.map(([first, last]) => first === last ? first : `${first} - ${last}`).join(", ");
}

export default function MaterialMediaHistory({ format, history, error, loading, creating, archived, onCreate, onOpen, onMore, onRetry }) {
  return <section className="format-detail material-media-history" aria-label={`Riwayat ${format.label}`}>
    <div className="material-history-heading">
      <h2 tabIndex={-1}>Riwayat</h2>
      {!archived && <button type="button" className="upload-button" disabled={creating} onClick={onCreate}>
        <Plus size={18} aria-hidden="true" />Buat {format.action}
      </button>}
    </div>
    {error && <div className="material-history-error"><p role="alert">{error}</p>
      <button type="button" className="source-secondary" onClick={onRetry}>Coba lagi</button></div>}
    {history === null && !error && <div className="material-history-loading" role="status" aria-label="Memuat riwayat">
      {[0, 1, 2].map(index => <div key={index} />)}
    </div>}
    {history?.items.length === 0 && !error && <div className="empty-library" role="status">
      <div aria-hidden="true"><Mascot kind="correction" mood="calm" /></div>
      <h3>Belum ada {format.action}</h3>
    </div>}
    {history?.items.length > 0 && <ul className="material-history-list">
      {history.items.map(item => <li key={item.materialId}>
        <Link href={`/materi/${encodeURIComponent(item.materialId)}/${format.segment}${item.status === "ready" ? "?open=1" : "?resume=1"}`}
          onClick={event => onOpen(event, item)}>
          <span className="material-history-copy"><strong>{item.title}</strong>
            <span className="material-history-meta">{pageLabel(item)}
              {item.generatedAt && <> · <time dateTime={item.generatedAt}>{date.format(new Date(item.generatedAt))}</time></>}
              {item.status !== "ready" && <span className="material-history-status">{item.status === "preparing" ? "Sedang disiapkan" : "Belum selesai"}</span>}
            </span>
          </span>
          <span className="material-history-action">{item.status === "ready" ? "Buka" : "Lanjutkan"}<ArrowRight size={18} aria-hidden="true" /></span>
        </Link>
      </li>)}
    </ul>}
    {history?.nextOffset !== null && history?.nextOffset !== undefined && <button type="button" className="source-secondary"
      disabled={loading} onClick={onMore}>{loading ? "Memuat…" : "Lihat lainnya"}</button>}
  </section>;
}
