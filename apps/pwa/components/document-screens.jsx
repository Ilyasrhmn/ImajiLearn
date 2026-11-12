"use client";
import { useRef, useState } from "react";
import { Copy, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { Sheet } from "./ui";
import ExamStudio from "@imajilearn/shared/components/exam-studio.jsx";
import { useSession } from "./session-gate";
import { useNavigationGuard } from "./mobile-shell";
import "@imajilearn/shared/components/exams.css";
import "./documents.css";
function ExamFrame({ children }) { return <section className="exam-main mobile-document">{children}</section>; }
export function ExamScreen() {
  const teacher = useSession(), setBlocked = useNavigationGuard();
  return <ExamStudio ActionMenu={ExamActionSheet} compact teacherId={teacher.id} Frame={ExamFrame} onNavigationBlock={setBlocked} />;
}

function ExamActionSheet({ title, onEdit, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const act = callback => closeRef.current.close(callback);
  return <div className="exam-card-menu">
    <button className="icon-button" aria-label={`Kelola ${title}`} onClick={() => setOpen(true)}><MoreHorizontal size={22} aria-hidden="true" /></button>
    {open && <Sheet title={title} closeRef={closeRef} onClose={() => setOpen(false)}>
      <div className="material-menu">
        <button onClick={() => act(onDuplicate)}><Copy size={20} aria-hidden="true" />Duplikat</button>
        <button onClick={() => act(onEdit)}><PencilLine size={20} aria-hidden="true" />Edit</button>
        <button className="danger-text" onClick={() => act(onDelete)}><Trash2 size={20} aria-hidden="true" />Hapus soal</button>
      </div>
    </Sheet>}
  </div>;
}
