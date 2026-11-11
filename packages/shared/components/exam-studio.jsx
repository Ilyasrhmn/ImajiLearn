"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ExamConfiguration from "./exam-configuration";
import ExamDocumentViewer from "./exam-document-viewer";
import Modal, { closeModal } from "./modal";
import Notice from "./notice";
import ActionConfirmation from "./action-confirmation";
import { listMaterials, listFolders } from "../lib/materials.mjs";
import { readProfile } from "../lib/teacher-profile.mjs";
import { requestAccount } from "../lib/account-client.mjs";
import { studioRequest } from "../lib/studio-api.mjs";
import { createId } from "../lib/id.mjs";
import "./exams.css";

export default function ExamStudio({ teacherId, Frame, onNavigationBlock, compact = false }) {
  const [materials, setMaterials] = useState([]), [folders, setFolders] = useState([]), [exams, setExams] = useState([]);
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false), [profile, setProfile] = useState(() => readProfile(null));
  const [opened, setOpened] = useState(null), [deleteId, setDeleteId] = useState(null), [saved, setSaved] = useState(true), [notice, setNotice] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [savingError, setSavingError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const draft = useRef(null), persistedVersion = useRef(0), timer = useRef(null), saving = useRef(false), operation = useRef(false), retry = useRef(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => { onNavigationBlock?.(!saved || processing); return () => onNavigationBlock?.(false); }, [saved, processing, onNavigationBlock]);
  useEffect(() => {
    let active = true;
    const receive = event => setNotice(event.detail);
    window.addEventListener("lkpd-notice", receive);
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
      clearTimeout(timer.current);
      window.removeEventListener("lkpd-notice", receive);
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
    operation.current = true; setProcessing(true);
    try { show((await studioRequest(teacherId, pathFor(id))).data); }
    catch (error) { report(error); }
    finally { operation.current = false; setProcessing(false); }
  }
  async function add(path, body) {
    if (operation.current || draft.current || saving.current) return;
    operation.current = true; setProcessing(true);
    const signature = JSON.stringify([path, body]);
    const key = retry.current?.signature === signature ? retry.current.key : createId();
    retry.current = { signature, key };
    try {
      const { data } = await studioRequest(teacherId, path, { method: "POST", body, key });
      retry.current = null;
      remember(data);
      if (!draft.current && !saving.current) show(data);
    } catch (error) { report(error); }
    finally { operation.current = false; setProcessing(false); }
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
    draft.current = exam;
    setOpened(exam); setSaved(false); setSavingError("");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }
  async function rename(id, title) {
    if (operation.current) return;
    const item = exams.find(exam => exam.id === id);
    if (!item) return;
    operation.current = true; setProcessing(true);
    try { remember((await studioRequest(teacherId, pathFor(id), { method: "PATCH", body: { title }, version: item.resourceVersion })).data); return true; }
    catch (error) { report(error); return { error: error.message }; }
    finally { operation.current = false; setProcessing(false); }
  }
  async function remove() {
    const item = exams.find(exam => exam.id === deleteId);
    if (!item || operation.current) return;
    operation.current = true; setDeleteError(""); setProcessing(true);
    try {
      await studioRequest(teacherId, pathFor(item.id), { method: "DELETE", version: item.resourceVersion });
      setExams(current => current.filter(exam => exam.id !== item.id));
      setDeleteId(null); setNotice({ message: "Naskah dihapus", type: "delete" });
    } catch (error) { setDeleteError(error.message); }
    finally { operation.current = false; setProcessing(false); }
  }
  return <>
    <Frame teacherId={teacherId}>
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat ujian"><span /><span /></div> : loadError ? <p role="alert">Naskah tidak dapat dimuat. Muat ulang untuk mencoba lagi.</p> : opened ? <>{savingError && <p role="alert">{savingError} <button type="button" className="text-button" onClick={flush}>Coba simpan lagi</button></p>}<ExamDocumentViewer key={opened.id} exam={opened} saved={saved} onChange={update} onBack={() => open(null)} onRemedial={() => add(pathFor(opened.id) + "/remedial")} /></> : <ExamConfiguration compact={compact} busy={processing} materials={materials} folders={folders} exams={exams} profile={profile} onCreate={config => add("/exams", config)} onOpen={open} onDelete={id => { setDeleteError(""); setDeleteId(id); }} onDuplicate={exam => add(pathFor(exam.id) + "/duplicate")} onRename={rename} />}
    </Frame>
    {deleteId && <Modal busy={processing} title="Hapus naskah" className="action-confirmation-dialog" onClose={() => setDeleteId(null)}>
      <ActionConfirmation title="Hapus naskah ini?" confirmLabel="Hapus naskah" error={deleteError} busy={processing} onCancel={() => closeModal(() => setDeleteId(null))} onConfirm={remove}>
        <p>Soal, kisi-kisi, dan kunci jawabannya akan dihapus dari akun Anda.</p>
      </ActionConfirmation>
    </Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} />}
  </>;
}
