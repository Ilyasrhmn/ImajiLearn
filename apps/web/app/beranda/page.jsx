import SessionReload from "../../components/session-reload";
import TeacherHome from "../../components/teacher-home";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";

export const metadata = { title: "Beranda · ImajiLearn" };

export default async function HomePage() {
  const teacher = await requirePageTeacher();
  return <><SessionReload /><TeacherHome key={teacher.id} teacherId={teacher.id} name={teacher.name} account={{ email: teacher.email, avatarUrl: teacher.avatarUrl }} /></>;
}
