"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Plus, Upload } from "lucide-react";
import TeacherWorkspace from "./teacher-workspace";
import UploadMaterial from "./upload-material";
import { Mascot } from "./mascot";
import { listFolders, listMaterials } from "../lib/materials";
import { studioRequest } from "../lib/studio-api.mjs";
import { currentTerm, recentMaterials, todayLessons } from "../lib/home-dashboard.mjs";
import "./teacher-home.css";

function LoadingRows({ label }) {
  return <div className="home-loading" role="status" aria-label={label}><span /><span /><span /></div>;
}

export default function TeacherHome({ teacherId, name, account }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [folders, setFolders] = useState([]);
  const [now, setNow] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [schedule, setSchedule] = useState(null);
  const [recent, setRecent] = useState(null);
  const [scheduleError, setScheduleError] = useState(false);
  const [recentError, setRecentError] = useState(false);
  const term = now ? currentTerm(now) : null;
  const termKey = term ? `${term.year}-${term.semester}` : "";

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 30000);
    const refresh = () => { update(); setAttempt(value => value + 1); };
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    if (!termKey) return;
    let active = true;
    const controller = new AbortController();
    const [year, semester] = termKey.split("-");
    const folders = listFolders(teacherId);
    Promise.all([folders, studioRequest(teacherId, `/schedule?${new URLSearchParams({ year, semester })}`, { signal: controller.signal })])
      .then(([subjects, { data }]) => {
        if (active) {
          setFolders(subjects);
          setScheduleError(false);
          setSchedule({ termKey, entries: data.entries, folders: new Map(subjects.map(folder => [folder.id, folder.name])) });
        }
      }).catch(() => { if (active) setScheduleError(true); });
    listMaterials(teacherId).then(items => {
      if (active) { setRecentError(false); setRecent(recentMaterials(teacherId, items)); }
    }).catch(() => { if (active) setRecentError(true); });
    return () => { active = false; controller.abort(); };
  }, [teacherId, termKey, attempt]);

  const hour = now?.getHours();
  const greeting = now ? hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam" : "Halo";
  const scheduleReady = schedule?.termKey === termKey;
  const lessons = now && scheduleReady ? todayLessons(schedule.entries, now) : [];
  const minutes = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const retry = () => {
    if (scheduleError) { setScheduleError(false); setSchedule(null); }
    if (recentError) { setRecentError(false); setRecent(null); }
    setAttempt(value => value + 1);
  };

  return <TeacherWorkspace name={name} account={account} current="/beranda">
    <main id="main" className="teacher-home">
      <section className="home-welcome" aria-labelledby="home-welcome-title">
        <div><p className="home-greeting">{greeting},</p><h1 id="home-welcome-title">{name?.trim()}</h1>{now && <time className="home-welcome-date">{now.toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</time>}<button className="upload-button" type="button" onClick={() => setUploading(true)}><Upload size={20} aria-hidden="true" />Unggah materi</button></div>
        <div className="home-welcome-characters" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div>
      </section>
      <div className="home-columns">
        <section className="home-section" aria-labelledby="home-schedule-title">
          <div className="home-section-heading"><h2 id="home-schedule-title">Jadwal hari ini</h2></div>
          {scheduleError ? <div className="home-error" role="alert"><p>Jadwal belum dapat dimuat.</p><button className="source-secondary" onClick={retry}>Coba lagi</button></div>
            : !scheduleReady || !now ? <LoadingRows label="Memuat jadwal" />
            : lessons.length ? <ul className="home-lessons">{lessons.map(slot => {
              const start = Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3));
              const end = Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3));
              const ongoing = minutes >= start && minutes < end;
              const subject = schedule.folders.get(slot.folderId);
              return <li key={slot.id} className={ongoing ? "is-ongoing" : undefined}>
                <div className="home-lesson-time"><time>{slot.start}</time><span>{slot.end}</span></div>
                <div className="home-lesson-name"><strong>{subject || "Mapel tidak tersedia"}</strong><span>Kelas {slot.className}{ongoing && <span className="home-ongoing">Berlangsung</span>}</span></div>
                {subject && <Link className="home-lesson-open" href={`/buat-media?folder=${encodeURIComponent(slot.folderId)}#materi`} aria-label={`Buka materi ${subject}, kelas ${slot.className}`}>Buka materi<ArrowRight size={17} aria-hidden="true" /></Link>}
              </li>;
            })}</ul> : <div className="home-empty"><div aria-hidden="true"><Mascot kind="correction" mood="calm" /></div><div><p>{schedule.entries.length ? "Tidak ada jadwal hari ini." : "Belum ada jadwal semester ini."}</p>{!schedule.entries.length && <Link className="home-text-link" href="/jadwal?baru=1"><Plus size={17} aria-hidden="true" />Tambah jadwal</Link>}</div></div>}
        </section>
        <section className="home-section" aria-labelledby="home-recent-title">
          <div className="home-section-heading"><h2 id="home-recent-title">Terakhir dibuka</h2></div>
          {recentError ? <div className="home-error" role="alert"><p>Materi belum dapat dimuat.</p><button className="source-secondary" onClick={retry}>Coba lagi</button></div>
            : !recent ? <LoadingRows label="Memuat materi terakhir dibuka" />
            : recent.length ? <ul className="home-recent">{recent.map(material => <li key={material.id}><Link href={`/materi/${encodeURIComponent(material.id)}`}><span className="home-recent-icon"><FileText size={23} aria-hidden="true" /></span><strong>{material.title}</strong><ArrowRight size={18} aria-hidden="true" /></Link></li>)}</ul>
              : <div className="home-empty"><div aria-hidden="true"><Mascot kind="book" mood="calm" /></div><div><p>Belum ada materi yang dibuka.</p><Link className="home-text-link" href="/buat-media#materi">Buka materi<ArrowRight size={17} aria-hidden="true" /></Link></div></div>}
        </section>
      </div>
    </main>
    {uploading && <UploadMaterial teacherId={teacherId} folders={folders} onClose={() => setUploading(false)} onSaved={material => { setUploading(false); router.push(`/materi/${encodeURIComponent(material.id)}`); }} />}
  </TeacherWorkspace>;
}
