import MediaStudioPage from "../../components/media-studio-page";

export const metadata = { title: "Slide · ImajiLearn" };

export default function Page({ searchParams }) {
  return <MediaStudioPage feature="slides" searchParams={searchParams} />;
}
