import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ApiError } from "../core/errors.mjs";

export async function extractPdf(bytes) {
  const loading = getDocument({
    data: bytes.slice(), stopAtErrors: true, useSystemFonts: false, disableFontFace: true,
    enableXfa: false, isEvalSupported: false, verbosity: 0,
  });
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void loading.destroy().catch(() => {});
  }, 10000);
  try {
    const document = await loading.promise;
    if (document.numPages > 100) throw new ApiError(422, "SOURCE_TOO_MANY_PAGES", "PDF maksimal 100 halaman.");
    let source = "";
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const reader = page.streamTextContent().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const item of value.items) {
            if (typeof item.str !== "string") continue;
            source += item.str + (item.hasEOL ? "\n" : " ");
            if (source.length > 40000) throw new ApiError(422, "SOURCE_TEXT_TOO_LONG", "Teks materi maksimal 40.000 karakter.");
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        page.cleanup();
      }
      source += "\n";
    }
    return source.trim();
  } catch (error) {
    if (expired) throw new ApiError(422, "SOURCE_EXTRACTION_TIMEOUT", "PDF membutuhkan waktu terlalu lama untuk dibaca.");
    throw error;
  } finally {
    clearTimeout(timer);
    await loading.destroy().catch(() => {});
  }
}
