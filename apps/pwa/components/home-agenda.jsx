"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, UsersRound } from "lucide-react";
import { listFolders } from "@imajilearn/shared/lib/materials.mjs";
import { currentTerm, readSchedule } from "../lib/schedule.mjs";
import { useSession } from "./session-gate";
import { Mascot } from "@imajilearn/shared/components/mascot.jsx";
import { ErrorState, Loading } from "./ui";
export default function HomeAgenda() {
  const { id }=useSession();
  const [data,setData]=useState(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=async()=>{
      const now=new Date(),period=currentTerm(now);
      try { const [result,folders]=await Promise.all([readSchedule(id,period.year,period.semester,controller.signal),listFolders(id)]);
        if(controller.signal.aborted)return;
        setError("");setData({slots:result.data.entries.filter(slot=>slot.day===now.getDay()).sort((a,b)=>a.start.localeCompare(b.start)),folders});
      }catch(err){if(!controller.signal.aborted)setError(err.message);}
    };
    refresh();const timer=setInterval(refresh,60000);return()=>{controller.abort();clearInterval(timer);};
  },[id,attempt]);
  return <section className="pwa-today" aria-labelledby="today-title"><h2 id="today-title">Jadwal hari ini</h2>{error?<ErrorState message={error} onRetry={()=>{setError("");setAttempt(n=>n+1);}}/>:!data?<Loading label="Memuat jadwal"/>:data.slots.length?<div className="pwa-schedule-track">{data.slots.map(slot=><Link key={slot.id} href="/jadwal" className="pwa-schedule-card"><span className="pwa-class"><UsersRound size={14} aria-hidden="true"/>Kelas {slot.className}</span><Mascot kind="pen" mood="calm"/><h3>{data.folders.find(folder=>folder.id===slot.folderId)?.name||"Mata pelajaran"}</h3><span className="pwa-lesson-hours"><Clock3 size={18} aria-hidden="true"/><time>{slot.start} - {slot.end}</time></span></Link>)}</div>:<div className="pwa-schedule-empty"><Mascot kind="correction" mood="calm"/><div><p>Belum ada jadwal hari ini</p><Link href="/jadwal">Tambah jadwal</Link></div></div>}</section>;
}
