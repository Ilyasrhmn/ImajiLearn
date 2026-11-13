"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, CircleAlert, LoaderCircle, Maximize2, X, ArrowRight } from "lucide-react";
import { apiPath, sessionChangeKey } from "@imajilearn/shared/lib/session.mjs";
import { mediaJobs, mediaProgressTitle } from "@imajilearn/shared/lib/media-jobs.mjs";
import { useMediaJobs } from "../lib/use-media-jobs.mjs";
import Modal, { closeModal } from "./modal";
import MediaGeneration from "./media-generation";
import "./media-jobs.css";

export default function MediaJobs() {
  const jobs = useMediaJobs(), pathname = usePathname();
  const [selected, setSelected] = useState(null);
  const owner = jobs[0]?.teacherId;
  const publicPage = /^(?:\/app)?\/(?:masuk|daftar)\/?$/.test(pathname);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    fetch(apiPath("/auth/session"), { cache: "no-store", signal: controller.signal }).then(async response => {
      if (controller.signal.aborted) return;
      if (response.status === 401) { mediaJobs.clear(); return; }
      if (!response.ok) return;
      const identity = await response.json();
      if (controller.signal.aborted) return;
      if (identity.data?.user?.id !== owner) mediaJobs.clear();
    }).catch(() => {});
    return () => controller.abort();
  }, [owner, pathname, publicPage]);
  useEffect(() => {
    const onSessionChange = () => mediaJobs.clear();
    const onStorage = event => { if (event.key === sessionChangeKey) mediaJobs.clear(); };
    const onLeave = event => { if (mediaJobs.getSnapshot().some(job => job.status === "running")) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener(sessionChangeKey, onSessionChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener(sessionChangeKey, onSessionChange); window.removeEventListener("storage", onStorage); window.removeEventListener("beforeunload", onLeave); };
  }, []);
  const visible = jobs.filter(job => !job.foreground && job.teacherId === owner);
  const opened = visible.find(job => job.id === selected);
  if (publicPage || !visible.length) return null;
  return <>
    <aside className="media-jobs" aria-label="Proses pembuatan media">
      {visible.map(job => {
        const ready = job.status === "ready", failed = job.status === "failed";
        const Icon = ready ? CheckCircle2 : failed ? CircleAlert : LoaderCircle;
        return <div className={`media-job is-${job.status}`} key={job.id}>
          <Icon className="media-job-icon" size={22} aria-hidden="true" />
          <div className="media-job-copy">
            <strong role={failed ? "alert" : "status"}>{ready ? `${job.label} siap` : failed ? `${job.label} belum selesai` : mediaProgressTitle(job.action, job.progress)}</strong>
            <span title={job.title}>{job.title}</span>
            {failed && <p>{job.error}</p>}
            {ready || failed ? <Link className="media-job-link" href={ready ? job.href : job.resumeHref} onClick={() => mediaJobs.remove(job.id)}>{ready ? "Buka hasil" : "Buka draf"}<ArrowRight size={16} aria-hidden="true" /></Link>
              : <button type="button" className="media-job-link" onClick={() => setSelected(job.id)}><Maximize2 size={15} aria-hidden="true" />Lihat progres</button>}
          </div>
          {(ready || failed) && <button className="media-job-dismiss" type="button" aria-label={`Tutup notifikasi ${job.title}`} onClick={() => mediaJobs.remove(job.id)}><X size={18} aria-hidden="true" /></button>}
        </div>;
      })}
    </aside>
    {opened && <Modal title={opened.status === "running" ? mediaProgressTitle(opened.action, opened.progress) : opened.label} onClose={() => setSelected(null)} className="media-job-dialog">
      <h2>{opened.status === "running" ? mediaProgressTitle(opened.action, opened.progress) : opened.status === "ready" ? `${opened.label} siap` : "Media belum selesai"}</h2>
      <p className="media-job-source">{opened.title}</p>
      {opened.status === "running" ? <MediaGeneration onMinimize={() => closeModal(() => setSelected(null))} />
        : <><p role={opened.status === "failed" ? "alert" : "status"}>{opened.error ?? "Hasil sudah tersimpan dan dapat dibuka."}</p><Link className="upload-button" href={opened.status === "ready" ? opened.href : opened.resumeHref} onClick={() => { mediaJobs.remove(opened.id); setSelected(null); }}><ArrowRight size={18} aria-hidden="true" />{opened.status === "ready" ? "Buka hasil" : "Buka draf"}</Link></>}
    </Modal>}
  </>;
}
