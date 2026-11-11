import SessionReload from "../../components/session-reload";
import CreateMedia from "../../components/create-media";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";

export const metadata = { title: "Buat media · ImajiLearn" };

export default async function Page({ searchParams }) {
  const teacher = await requirePageTeacher();
  const { jenis } = await searchParams;
  return <><SessionReload /><CreateMedia teacherId={teacher.id} name={teacher.name} kind={jenis} /></>;
}
