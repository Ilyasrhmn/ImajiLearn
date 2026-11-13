"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import ExamConfiguration from "./exam-configuration";
import ExamDocumentViewer from "./exam-document-viewer";
import Modal, { closeModal } from "./modal";
import Notice from "./notice";
import ActionConfirmation from "@imajilearn/shared/components/action-confirmation.jsx";
import { listMaterials, listFolders } from "../lib/materials";
import { readProfile } from "../lib/teacher-profile.mjs";
import { requestAccount } from "../lib/account-client.mjs";
import { studioRequest } from "../lib/studio-api.mjs";
import { createId } from "../lib/id.mjs";
import { generateExamQuestions } from "@imajilearn/shared/lib/exam-generation.mjs";
import { isBlankExamQuestion } from "../lib/exams.mjs";
import "./exams.css";
import "./material-detail.css";
import "./media-studio.css";

export default function ExamStudio({ teacherId }) {
  const [materials, setMaterials] = useState([]), [folders, setFolders] = useState([]), [exams, setExams] = useState([]);
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false), [profile, setProfile] = useState(() => readProfile(null));
  const [opened, setOpened] = useState(null), [deleteId, setDeleteId] = useState(null), [saved, setSaved] = useState(true), [notice, setNotice] = useState(null);
  const [savingError, setSavingError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [generation, setGeneration] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const draft = useRef(null), persistedVersion = useRef(0), timer = useRef(null), saving = useRef(false), operation = useRef(false), retry = useRef(null);
  const generationRequest = useRef(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let active = true;
    const receive = event => setNotice(event.detail);
    window.addEventListener("studio-notice", receive);
    const controller = new AbortController();
    const signal = controller.signal;
    Promise.all([listMaterials(teacherId), listFolders(teacherId), studioRequest(teacherId, "/exams", { signal }),
      requestAccount(teacherId, { signal })]).then(([items, subjects, library, account]) => {
      if (!active) return;
      setMaterials(items); setFolders(subjects); setExams(library.data); setProfile(account || readProfile(null)); setReady(true);
    }).catch(() => { if (active) { setLoadError(true); setReady(true); } });
    const warn = event => {
      if (draft.current || saving.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      active = false;
      controller.abort();
      generationRequest.current?.abort();
      clearTimeout(timer.current);
      window.removeEventListener("studio-notice", receive);
      window.removeEventListener("beforeunload", warn);
    };
  }, [teacherId]);
  const pathFor = id => `/exams/${encodeURIComponent(id)}`;
  const report = error => setNotice({ message: error.message, type: "error" });
  function remember(exam) {
    setExams(items => [exam, ...items.filter(item => item.id !== exam.id)]);
  }
  function show(exam) {
    persistedVersion.current = exam.resourceVersion;
    setOpened(exam); setSaved(true); setSavingError("");
    window.scrollTo({ top: 0 });
  }
  async function open(id) {
    if (operation.current) return;
    if (id === null) {
      if (saving.current) return;
      if (draft.current && !await flush()) return;
      setOpened(null); return;
    }
    operation.current = true;
    try { show((await studioRequest(teacherId, pathFor(id))).data); }
    catch (error) { report(error); }
    finally { operation.current = false; }
  }
  async function add(path, body) {
    if (operation.current || draft.current || saving.current) return;
    operation.current = true;
    const signature = JSON.stringify([path, body]);
    const key = retry.current?.signature === signature ? retry.current.key : createId();
    retry.current = { signature, key };
    try {
      const { data } = await studioRequest(teacherId, path, { method: "POST", body, key });
      retry.current = null;
      remember(data);
      if (!draft.current && !saving.current) show(data);
    } catch (error) { report(error); }
    finally { operation.current = false; }
  }
  async function flush() {
    clearTimeout(timer.current);
    if (saving.current || !draft.current) return;
    saving.current = true;
    setSavingError("");
    try {
      while (draft.current) {
        const editing = draft.current;
        const { data } = await studioRequest(teacherId, pathFor(editing.id), {
          method: "PATCH", version: persistedVersion.current,
          body: { header: editing.header, questions: editing.questions },
        });
        persistedVersion.current = data.resourceVersion;
        remember(data);
        if (draft.current === editing) {
          draft.current = null;
          setOpened(data); setSaved(true);
        }
      }
    } catch (error) {
      setSavingError(error.message);
      return false;
    } finally {
      saving.current = false;
    }
    return true;
  }
  function update(exam) {
    if (generationRequest.current) return;
    draft.current = exam;
    setOpened(exam); setSaved(false); setSavingError("");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }
  async function generateQuestions() {
    if (!opened || operation.current || draft.current || saving.current) return;
    const total = opened.questions.filter(isBlankExamQuestion).length;
    if (!total) return;
    const controller = new AbortController();
    generationRequest.current = controller;
    operation.current = true;
    setGeneration({ filled: 0, total });
    const path = pathFor(opened.id);
    try {
      await generateExamQuestions(teacherId, { ...opened, resourceVersion: persistedVersion.current }, {
        signal: controller.signal, onProgress: setGeneration,
        onDocument(data) {
          persistedVersion.current = data.resourceVersion;
          remember(data);
          setOpened(data);
        },
      });
    } catch (error) {
      if (controller.signal.aborted || error.status === 412) {
        try {
          const { data } = await studioRequest(teacherId, path);
          persistedVersion.current = data.resourceVersion;
          remember(data);
          setOpened(data);
        } catch (refreshError) {
          if (!controller.signal.aborted) report(refreshError);
        }
      }
      if (!controller.signal.aborted) report(error);
    } finally {
      generationRequest.current = null;
      operation.current = false;
      setGeneration(null);
    }
  }
  async function rename(id, title) {
    if (operation.current) return;
    const item = exams.find(exam => exam.id === id);
    if (!item) return;
    operation.current = true;
    try { remember((await studioRequest(teacherId, pathFor(id), { method: "PATCH", body: { title }, version: item.resourceVersion })).data); }
    catch (error) { report(error); }
    finally { operation.current = false; }
  }
  async function remove() {
    const item = exams.find(exam => exam.id === deleteId);
    if (!item || operation.current) return;
    operation.current = true; setDeleteError(""); setDeleting(true);
    try {
      await studioRequest(teacherId, pathFor(item.id), { method: "DELETE", version: item.resourceVersion });
      setExams(current => current.filter(exam => exam.id !== item.id));
      setDeleteId(null); setNotice({ message: "Naskah dihapus", type: "delete" });
    } catch (error) { setDeleteError(error.message); }
    finally { operation.current = false; setDeleting(false); }
  }
  return <>
    <main id="main" className="media-studio material-page exam-studio">
      <header className="media-studio-header">
        <Link className="material-return" href="/buat-media"><ArrowLeft size={18} aria-hidden="true" />Buat media</Link>
        <div><ClipboardCheck size={28} aria-hidden="true" /><h1>Soal & ujian</h1></div>
      </header>
      <div className="material-panel exam-main">
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat ujian"><span /><span /></div> : loadError ? <p role="alert">Naskah tidak dapat dimuat. Muat ulang untuk mencoba lagi.</p> : opened ? <>{savingError && <p role="alert">{savingError} <button type="button" className="text-button" onClick={flush}>Coba simpan lagi</button></p>}<ExamDocumentViewer key={opened.id} exam={opened} saved={saved}
        generation={generation} onGenerate={generateQuestions} onStop={() => generationRequest.current?.abort()}
        onChange={update} onBack={() => open(null)} onRemedial={() => add(pathFor(opened.id) + "/remedial")} /></> : <ExamConfiguration teacherId={teacherId} showHeading={false} materials={materials} folders={folders} exams={exams} profile={profile} onCreate={config => add("/exams", config)} onOpen={open} onDelete={id => { setDeleteError(""); setDeleteId(id); }} onDuplicate={exam => add(pathFor(exam.id) + "/duplicate")} onRename={rename} />}
      </div>
    </main>
    {deleteId && <Modal title="Hapus naskah" className="action-confirmation-dialog" dismissible={!deleting} onClose={() => setDeleteId(null)}>
      <ActionConfirmation title="Hapus naskah ini?" confirmLabel="Hapus naskah" busy={deleting} error={deleteError} onCancel={() => closeModal(() => setDeleteId(null))} onConfirm={remove}>
        <p>Soal, kisi-kisi, dan kunci jawabannya akan dihapus dari akun Anda.</p>
      </ActionConfirmation>
    </Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} />}
  </>;
}
