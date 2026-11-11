import { redirect } from "next/navigation";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";

export default async function DashboardPage({ searchParams }) {
  await requirePageTeacher();
  const { folder } = await searchParams;
  redirect(`/buat-media${typeof folder === "string" ? `?folder=${encodeURIComponent(folder)}` : ""}#materi`);
}
