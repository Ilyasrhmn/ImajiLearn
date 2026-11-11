import SessionReload from "../../components/session-reload";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";
import TeachingSchedule from "../../components/teaching-schedule";
export const metadata = { title: "Jadwal mengajar" };
export default async function Page() {
  const teacher = await requirePageTeacher();
  return <><SessionReload /><TeachingSchedule key={teacher.id} teacherId={teacher.id} name={teacher.name} /></>;
}
