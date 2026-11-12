import SessionReload from "../../components/session-reload";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";
import AccountSettings from "../../components/account-settings";
import { googleCallbackNotice } from "../../lib/google-auth-client.mjs";
export const metadata = { title: "Pengaturan akun" };
export default async function Page({ searchParams }) {
  const teacher = await requirePageTeacher();
  const params = await searchParams;
  return <><SessionReload /><AccountSettings key={teacher.id} teacherId={teacher.id} name={teacher.name} googleNotice={googleCallbackNotice(params?.google, "account")} /></>;
}
