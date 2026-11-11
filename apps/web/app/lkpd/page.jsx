import { redirect } from "next/navigation";
import { requirePageTeacher } from "../../server/accounts/page-session.mjs";

export default async function Page() {
  await requirePageTeacher();
  redirect("/buat-media");
}
