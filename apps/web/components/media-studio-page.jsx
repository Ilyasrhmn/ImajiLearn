import SessionReload from "./session-reload";
import MediaStudio from "./media-studio";
import { requirePageTeacher } from "../server/accounts/page-session.mjs";
import "./material-detail.css";

export default async function MediaStudioPage({ feature, searchParams }) {
  const teacher = await requirePageTeacher();
  const params = await searchParams;
  return <><SessionReload /><MediaStudio key={feature} teacherId={teacher.id} feature={feature} startCreating={params.create === "1"} /></>;
}
