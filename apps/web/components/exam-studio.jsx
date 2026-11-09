"use client";
import { teacherStorageKey } from "../lib/teacher-storage.mjs";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarDays, ClipboardPenLine, Scissors } from "lucide-react";
import ExamConfiguration from "./exam-configuration";
import ExamDocumentViewer from "./exam-document-viewer";
import Modal, { closeModal } from "./modal";
import Notice from "./notice";
import { Mascot } from "./mascot";
import AccountAvatar from "./account-avatar";
import LogoutButton from "./logout-button";
import { listMaterials, listFolders } from "../lib/materials";
import { PROFILE_KEY, readProfile } from "../lib/teacher-profile.mjs";
import { EXAMS_KEY, EXAM_LIMIT, createExam, parseExams, copyRemedial, duplicateExam } from "../lib/exams.mjs";
import "./exams.css";

export default function ExamStudio({ teacherId }) {
  const [materials, setMaterials] = useState([]), [folders, setFolders] = useState([]), [exams, setExams] = useState([]);
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false), [profile, setProfile] = useState(() => readProfile(null));
  const [openedId, setOpenedId] = useState(null), [deleteId, setDeleteId] = useState(null), [saved, setSaved] = useState(true), [notice, setNotice] = useState(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let active = true;
    const receive = event => setNotice(event.detail);
    window.addEventListener("lkpd-notice", receive);
    Promise.all([listMaterials(teacherId), listFolders(teacherId)]).then(([items, subjects]) => {
      if (!active) return;
      setMaterials(items); setFolders(subjects); setExams(parseExams(localStorage.getItem(teacherStorageKey(teacherId, EXAMS_KEY)))); setProfile(readProfile(localStorage.getItem(teacherStorageKey(teacherId, PROFILE_KEY)))); setReady(true);
    }).catch(() => { if (active) { setLoadError(true); setReady(true); } });
    return () => { active = false; window.removeEventListener("lkpd-notice", receive); };
  }, [teacherId]);
  function persist(next) {
    try { localStorage.setItem(teacherStorageKey(teacherId, EXAMS_KEY), JSON.stringify(next)); setExams(next); setSaved(true); return true; }
    catch { setSaved(false); setNotice({ message: "Naskah belum tersimpan. Periksa penyimpanan browser.", type: "error" }); return false; }
  }
  function open(id) { setOpenedId(id); window.scrollTo({ top: 0 }); }
  function add(exam) {
    if (exams.length >= EXAM_LIMIT) { setNotice({ message: "Penyimpanan naskah penuh. Hapus satu naskah terlebih dahulu.", type: "error" }); return; }
    if (persist([exam, ...exams])) open(exam.id);
  }
  function update(exam) { persist(exams.map(item => item.id === exam.id ? { ...exam, updatedAt: new Date().toISOString() } : item)); }
  const opened = exams.find(item => item.id === openedId);
  return <><a className="skip-link" href="#main">Lewati ke isi</a><header className="workspace-header"><div className="header-inner"><Link className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></Link><div className="account-actions"><AccountAvatar teacherId={teacherId} /><LogoutButton /></div></div></header>
    <main id="main" className="workspace-shell exam-main"><nav className="studio-sections" aria-label="Navigasi studio"><Link href="/dashboard"><BookOpen size={20} />Materi</Link><Link href="/lkpd"><Scissors size={20} />LKPD</Link><Link href="/ujian" aria-current="page"><ClipboardPenLine size={20} />Soal &amp; ujian</Link><a href="/jadwal"><CalendarDays size={20} />Jadwal</a></nav>
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat ujian"><span /><span /></div> : loadError ? <p role="alert">Materi tidak dapat dimuat. Periksa penyimpanan browser.</p> : opened ? <ExamDocumentViewer key={opened.id} exam={opened} saved={saved} onChange={update} onBack={() => open(null)} onRemedial={() => add(copyRemedial(opened))} /> : <ExamConfiguration materials={materials} folders={folders} exams={exams} profile={profile} onCreate={config => add(createExam(config, profile))} onOpen={open} onDelete={setDeleteId} onDuplicate={exam => add(duplicateExam(exam))} onRename={(id, title) => { const item = exams.find(exam => exam.id === id); if (item) update({ ...item, title }); }} />}
    </main>
    {deleteId && <Modal title="Hapus naskah" onClose={() => setDeleteId(null)}><div className="material-confirm"><Mascot kind="eraser" mood="think" /><h2>Hapus naskah ini?</h2><p>Soal, kisi-kisi, dan kunci jawabannya akan dihapus dari perangkat ini.</p><div className="source-actions"><button className="source-secondary" onClick={() => closeModal(() => setDeleteId(null))}>Batal</button><button className="upload-button" onClick={() => { if (persist(exams.filter(exam => exam.id !== deleteId))) { setDeleteId(null); setNotice({ message: "Naskah dihapus", type: "delete" }); } }}>Ya, hapus naskah</button></div></div></Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} />}
  </>;
}
