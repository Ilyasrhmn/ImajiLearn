"use client";
import LkpdStudio from "@imajilearn/shared/components/lkpd-studio.jsx";
import ExamStudio from "@imajilearn/shared/components/exam-studio.jsx";
import { useSession } from "./session-gate";
import { useNavigationGuard } from "./mobile-shell";
import "@imajilearn/shared/components/lkpd.css";
import "@imajilearn/shared/components/exams.css";
import "./documents.css";

function LkpdFrame({ children }) { return <section className="lkpd-main mobile-document">{children}</section>; }
function ExamFrame({ children }) { return <section className="exam-main mobile-document">{children}</section>; }
export function LkpdScreen() {
  const teacher = useSession(), setBlocked = useNavigationGuard();
  return <LkpdStudio teacherId={teacher.id} teacherProfile={teacher} Frame={LkpdFrame} materialsHref="/materi" onNavigationBlock={setBlocked} />;
}
export function ExamScreen() {
  const teacher = useSession(), setBlocked = useNavigationGuard();
  return <ExamStudio compact teacherId={teacher.id} Frame={ExamFrame} onNavigationBlock={setBlocked} />;
}
