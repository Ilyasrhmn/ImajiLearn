import { AnnotationMode, getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ApiError } from "../core/errors.mjs";

function openPdf(bytes, options = {}) {
  return getDocument({
    data: new Uint8Array(bytes), stopAtErrors: true, useSystemFonts: false, disableFontFace: true,
    enableXfa: false, isEvalSupported: false, verbosity: 0, ...options,
  });
}

export async function extractPdf(bytes) {
  const loading = openPdf(bytes);
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

const captionPattern = /^(?:gambar|figure|fig\.?|diagram|ilustrasi)\s+\d/iu;

function pageText(items, viewport) {
  return items.filter(item => typeof item.str === "string" && item.str.trim()).map(item => {
    const [, , , , x, y] = Util.transform(viewport.transform, item.transform);
    return { text: item.str.trim(), x, y, width: item.width * viewport.scale, height: item.height * viewport.scale };
  });
}

function figuresOnPage(imageCoordinates, items, width, height) {
  const figures = [];
  for (let i = 0; i + 5 < (imageCoordinates?.length ?? 0); i += 6) {
    const [ax, ay, bx, by, cx, cy] = imageCoordinates.slice(i, i + 6);
    const left = Math.max(0, Math.min(ax, bx, cx, bx + cx - ax) * width);
    const right = Math.min(width, Math.max(ax, bx, cx, bx + cx - ax) * width);
    const top = Math.max(0, Math.min(ay, by, cy, by + cy - ay) * height);
    const bottom = Math.min(height, Math.max(ay, by, cy, by + cy - ay) * height);
    if (right - left < width * .16 || bottom - top < height * .08 || bottom - top > height * .75) continue;

    const below = items.filter(line => line.y >= bottom && line.y - bottom <= height * .09 &&
      line.x < right && line.x + line.width > left).sort((a, b) => a.y - b.y || a.x - b.x);
    const first = below[0];
    if (!first) continue;
    const overlapsFigure = line => line.x < right && line.x + line.width > left;
    const captionLines = items.filter(line => overlapsFigure(line) &&
      Math.abs(line.y - first.y) <= 2).sort((a, b) => a.x - b.x);
    const caption = captionLines.map(line => line.text).join(" ");
    if (!captionPattern.test(caption)) continue;
    const continuation = items.filter(line => overlapsFigure(line) && line.y > first.y + 2 && line.y <= first.y + first.height * 1.65 &&
      /^(?:sumber|source|credit|kredit|\(credit|\(sumber)\b/iu.test(line.text));
    const lines = [...captionLines, ...continuation];
    const bounds = {
      left: Math.max(0, Math.floor(Math.min(left, ...lines.map(line => line.x)) - 3)),
      right: Math.min(width, Math.ceil(Math.max(right, ...lines.map(line => line.x + line.width)) + 3)),
      top: Math.max(0, Math.floor(top - 3)),
      bottom: Math.min(height, Math.ceil(Math.max(bottom, ...lines.map(line => line.y + line.height * .35)) + 3)),
    };
    figures.push({ caption: [caption, ...continuation.map(line => line.text)].join(" ").slice(0, 440), ...bounds });
  }
  return figures;
}

// Prefer captioned figures. Large backgrounds and unlabelled decorative images are poor evidence.
export async function findPdfFigures(bytes, topic) {
  const loading = openPdf(bytes, { maxImageSize: 16_000_000 });
  const timer = setTimeout(() => { void loading.destroy().catch(() => {}); }, 8000);
  const terms = new Set(topic.toLowerCase().match(/\p{L}{4,}/gu) ?? []);
  const figures = [];
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 100) return figures;
    const candidates = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const { items } = await page.getTextContent();
        const lines = items.map(item => item.str ?? "");
        if (!lines.some(line => /^(?:gambar|figure|fig\.?|diagram|ilustrasi)\b/iu.test(line.trim()))) continue;
        const words = new Set(lines.join(" ").toLowerCase().match(/\p{L}{4,}/gu) ?? []);
        const score = [...terms].filter(word => words.has(word)).length;
        candidates.push({ number, items, score });
      } finally { page.cleanup(); }
    }
    candidates.sort((a, b) => b.score - a.score);

    for (const { number, items } of candidates.slice(0, 4)) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 1300 / Math.max(base.width, base.height) });
      const factory = pdf.canvasFactory;
      const pageCanvas = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        const { canvas, context } = pageCanvas;
        const task = page.render({ canvas, canvasContext: context, viewport, recordImages: true, annotationMode: AnnotationMode.DISABLE });
        await task.promise;
        const bounds = figuresOnPage(task.imageCoordinates, pageText(items, viewport), canvas.width, canvas.height);
        for (const figure of bounds.slice(0, 4)) {
          const width = figure.right - figure.left, height = figure.bottom - figure.top;
          const crop = factory.create(width, height);
          try {
            crop.context.drawImage(canvas, figure.left, figure.top, width, height, 0, 0, width, height);
            const image = crop.canvas.toBuffer("image/jpeg", 88);
            if (image.length <= 2 * 1024 * 1024) figures.push({ page: number, caption: figure.caption, bytes: image });
          } finally { factory.destroy(crop); }
        }
      } finally {
        factory.destroy(pageCanvas);
        page.cleanup();
      }
    }
    return figures;
  } catch {
    return figures;
  } finally {
    clearTimeout(timer);
    await loading.destroy().catch(() => {});
  }
}
