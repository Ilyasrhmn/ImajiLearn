import SessionReload from "../../components/session-reload";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";
import LkpdStudio from "../../components/lkpd-studio";
export const metadata = { title: "LKPD" };
export default async function Page() {
  const teacher = await requirePageTeacher();
  return <><SessionReload /><LkpdStudio key={teacher.id} teacherId={teacher.id} /></>;
}
