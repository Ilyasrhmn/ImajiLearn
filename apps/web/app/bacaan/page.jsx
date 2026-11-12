import MediaStudioPage from "../../components/media-studio-page";

export const metadata = { title: "Bacaan bergambar · ImajiLearn" };

export default function Page({ searchParams }) {
  return <MediaStudioPage feature="reading" searchParams={searchParams} />;
}
