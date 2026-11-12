import SessionReload from "../../components/session-reload";
import CreateMedia from "../../components/create-media";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";
import { redirect } from "next/navigation";
import { mediaStudio } from "../../lib/media-studios.mjs";

export const metadata = { title: "Buat media · ImajiLearn" };

export default async function Page({ searchParams }) {
  const teacher = await requirePageTeacher();
  const { jenis } = await searchParams;
  const studio = mediaStudio(jenis === "visual" ? "mindmap" : jenis);
  if (studio) redirect(`${studio.route}?create=1`);
  return <><SessionReload /><CreateMedia teacherId={teacher.id} name={teacher.name} account={{ email: teacher.email, avatarUrl: teacher.avatarUrl }} /></>;
}
