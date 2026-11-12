import MediaStudioPage from "../../components/media-studio-page";

export const metadata = { title: "Lagu belajar · ImajiLearn" };

export default function Page({ searchParams }) {
  return <MediaStudioPage feature="song" searchParams={searchParams} />;
}
