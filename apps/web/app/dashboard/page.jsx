import SessionReload from "../../components/session-reload";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";
import Dashboard from "../../components/dashboard";

export const metadata = { title: "Materi · ImajiLearn" };

export default async function DashboardPage() {
  const teacher = await requirePageTeacher();
  return <><SessionReload /><Dashboard key={teacher.id} teacherId={teacher.id} /></>;
}
