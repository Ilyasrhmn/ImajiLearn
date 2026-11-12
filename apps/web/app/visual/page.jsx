import MediaStudioPage from "../../components/media-studio-page";

export const metadata = { title: "Visual interaktif · ImajiLearn" };

export default function Page({ searchParams }) {
  return <MediaStudioPage feature="mindmap" searchParams={searchParams} />;
}
