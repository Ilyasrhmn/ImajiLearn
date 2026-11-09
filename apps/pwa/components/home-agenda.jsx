"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listFolders } from "@imajilearn/shared/lib/materials.mjs";
import { currentTerm, nextLesson, readSchedule, weekdays } from "../lib/schedule.mjs";
import { useSession } from "./session-gate";
import { ErrorState, Loading } from "./ui";
export default function HomeAgenda() {
  const { id } = useSession(); const [data, setData] = useState(null), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); const refresh = () => { const period = currentTerm(); Promise.all([readSchedule(id, period.year, period.semester, controller.signal), listFolders(id)]).then(([result, folders]) => { if (!controller.signal.aborted) { setError(""); setData({ slot: nextLesson(result.data.entries), folders }); } }).catch(err => { if (!controller.signal.aborted) setError(err.message); }); }; refresh(); const timer = setInterval(refresh, 60000); return () => { controller.abort(); clearInterval(timer); }; }, [id]);
  return <section className="section"><div className="section-heading"><h2>Agenda minggu ini</h2><Link href="/jadwal">Lihat jadwal</Link></div>{error ? <ErrorState message={error} /> : !data ? <Loading label="Memuat agenda" /> : data.slot ? <Link className="home-agenda" href="/jadwal"><strong>{weekdays[data.slot.day - 1]} · {data.slot.start}–{data.slot.end}</strong><span>{data.folders.find(folder => folder.id === data.slot.folderId)?.name || "Mapel"} · Kelas {data.slot.className}</span></Link> : <p className="meta">Tidak ada agenda tersisa minggu ini.</p>}</section>;
}
