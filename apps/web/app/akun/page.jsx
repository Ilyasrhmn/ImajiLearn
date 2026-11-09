import SessionReload from "../../components/session-reload";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";
import AccountSettings from "../../components/account-settings";
export const metadata = { title: "Pengaturan akun" };
export default async function Page() {
  const teacher = await requirePageTeacher();
  return <><SessionReload /><AccountSettings key={teacher.id} teacherId={teacher.id} /></>;
}
