"use client";

import Link from "next/link";
import { ArrowRight, BookOpenText, CalendarDays, ChevronRight, FileText, Files, Folder, History, Plus, Search } from "lucide-react";
import { Mascot } from "./mascot";
import { NO_SUBJECT_LABEL } from "../lib/materials";
import "./material-media-history.css";

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

export default function MaterialMediaHistory({ format, history, error, loading, creating, archived, onCreate, onOpen, onMore, onRetry, hrefFor, resumeInDialog = false, hideHeading = false, emptyLabel, listLabel, query = "", onSearch }) {
  return <section className="format-detail material-media-history" aria-label={listLabel ?? `Riwayat ${format.label}`}>
    {!hideHeading && <div className="material-history-heading">
      <h2 tabIndex={-1}><History size={24} aria-hidden="true" />Riwayat</h2>
      {!archived && <button type="button" className="upload-button" disabled={creating} onClick={onCreate}>
        <Plus size={18} aria-hidden="true" />Buat {format.action}
      </button>}
    </div>}
    {onSearch && <label className="material-history-search">
      <Search size={20} aria-hidden="true" />
      <input aria-label={`Cari nama materi atau ${format.action}`} placeholder={`Cari nama materi atau ${format.action}`}
        value={query} maxLength={200} onChange={event => onSearch(event.target.value)} />
    </label>}
    {error && <div className="material-history-error"><p role="alert">{error}</p>
      <button type="button" className="source-secondary" onClick={onRetry}>Coba lagi</button></div>}
    {history === null && !error && <div className="material-history-loading" role="status" aria-label="Memuat riwayat">
      {[0, 1, 2].map(index => <div key={index} />)}
    </div>}
    {history?.items.length === 0 && !error && <div className="empty-library" role="status">
      <div aria-hidden="true"><Mascot kind="correction" mood="calm" /></div>
      <h3>{query.trim() ? "Tidak ada hasil pencarian" : emptyLabel ?? `Belum ada ${format.action}`}</h3>
    </div>}
    {history?.items.length > 0 && <ul className="material-history-list material-history-cards">
      {history.items.map(item => {
        const draft = resumeInDialog && item.status !== "ready";
        const Card = draft ? "button" : Link;
        return <li key={item.materialId}>
        <Card {...(draft ? { type: "button", disabled: creating } : { href: hrefFor ? hrefFor(item) : `/materi/${encodeURIComponent(item.materialId)}/${format.segment}${item.status === "ready" ? "?open=1" : "?resume=1"}` })}
          onClick={event => onOpen(event, item)}>
          <span className="material-file-icon" aria-hidden="true">{item.sourceMime === "application/pdf" ? <FileText size={30} /> : <BookOpenText size={30} />}</span>
          <span className="material-history-copy"><strong>{item.title}</strong>
            <span className="material-history-origin">
              <span className="material-history-folder"><Folder size={16} aria-hidden="true" />{item.folderName ?? NO_SUBJECT_LABEL}</span>
              <ChevronRight size={14} aria-hidden="true" />
              <span>{item.sourceName ?? item.sourceTitle}</span>
            </span>
            <span className="material-history-meta">
              <span><Files size={15} aria-hidden="true" />{pageLabel(item)}</span>
              {item.generatedAt && <time dateTime={item.generatedAt}><CalendarDays size={15} aria-hidden="true" />{date.format(new Date(item.generatedAt))}</time>}
              {item.status !== "ready" && <span className="material-history-status">{item.status === "draft" ? "Belum dibuat" : item.status === "preparing" ? "Sedang disiapkan" : "Belum selesai"}</span>}
            </span>
          </span>
          <span className="material-history-action">{item.status === "ready" ? "Buka" : "Lanjutkan"}<ArrowRight size={18} aria-hidden="true" /></span>
        </Card>
      </li>;
      })}
    </ul>}
    {history?.nextOffset !== null && history?.nextOffset !== undefined && <button type="button" className="source-secondary"
      disabled={loading} onClick={onMore}>{loading ? "Memuat…" : "Lihat lainnya"}</button>}
  </section>;
}
