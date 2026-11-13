import LoadingSkeleton from "@imajilearn/shared/components/loading-skeleton.jsx";
import TeacherWorkspace from "./teacher-workspace";
export default function PageLoading({ variant, current, studio = false }) {
  const content = <main id="main" className={studio ? "media-studio material-page" : "teacher-home"}><LoadingSkeleton variant={variant} label="Memuat halaman" /></main>;
  return studio ? content : <TeacherWorkspace current={current}>{content}</TeacherWorkspace>;
}
