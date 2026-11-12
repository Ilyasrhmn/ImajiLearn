import SessionReload from "../../components/session-reload";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";
import ExamStudio from "../../components/exam-studio";
export const metadata = { title: "Soal dan ujian" };
export default async function Page() {
  const teacher = await requirePageTeacher();
  return <><SessionReload /><ExamStudio key={teacher.id} teacherId={teacher.id} /></>;
}
