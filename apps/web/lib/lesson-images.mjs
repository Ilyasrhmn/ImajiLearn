import { apiPath } from "@imajilearn/shared/lib/session.mjs";
export async function preloadLessonImages(path, content, signal) {
  if (!content?.illustrations || typeof window === "undefined") return;
  const urls = content.illustrations.flatMap((status, index) => {
    if (!status.ready) return [];
    if (path.endsWith("/reading")) return [apiPath(`${path}/illustration?section=${index}&imageVersion=0`)];
    if (path.endsWith("/slides")) return [apiPath(`${path}/illustrations/${index}?revision=${encodeURIComponent(content.revision)}&imageVersion=0`)];
    return [];
  });
  await Promise.all(urls.map(src => new Promise((resolve, reject) => {
    const image = new window.Image();
    const finish = error => {
      signal?.removeEventListener("abort", abort);
      image.onload = image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      finish(signal.reason ?? new DOMException("Dibatalkan", "AbortError"));
      image.src = "";
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => image.decode().then(() => finish(), () => finish(new Error("Gambar materi belum bisa dibuka. Coba lagi.")));
    image.onerror = () => finish(new Error("Gambar materi belum bisa dibuka. Coba lagi."));
    image.src = src;
  })));
}
