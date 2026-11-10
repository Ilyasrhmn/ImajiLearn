import { AnnotationMode, getDocument, OPS, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ApiError } from "../core/errors.mjs";
import { sourceBlocks, sourceFormulas, sourceRows } from "./pdf-source-layout.mjs";

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

function imageBounds(imageCoordinates, width, height, minWidth, minHeight) {
  const bounds = [];
  for (let i = 0; i + 5 < (imageCoordinates?.length ?? 0); i += 6) {
    const [ax, ay, bx, by, cx, cy] = imageCoordinates.slice(i, i + 6);
    const left = Math.max(0, Math.min(ax, bx, cx, bx + cx - ax) * width);
    const right = Math.min(width, Math.max(ax, bx, cx, bx + cx - ax) * width);
    const top = Math.max(0, Math.min(ay, by, cy, by + cy - ay) * height);
    const bottom = Math.min(height, Math.max(ay, by, cy, by + cy - ay) * height);
    if (right - left >= minWidth && bottom - top >= minHeight) bounds.push({ left, right, top, bottom });

  }
  return bounds;
}

function figuresOnPage(imageCoordinates, items, width, height) {
  const figures = [];
  for (const { left, right, top, bottom } of imageBounds(imageCoordinates, width, height, width * .16, height * .08)) {
    if (bottom - top > height * .75) continue;

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

const imageOperations = new Set([
  OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintInlineImageXObjectGroup, OPS.paintImageXObjectRepeat,
]);

export async function readPdfSourcePage(bytes, number) {
  const loading = openPdf(bytes, { maxImageSize: 16_000_000, fontExtraProperties: true });
  const timer = setTimeout(() => { void loading.destroy().catch(() => {}); }, 8000);
  try {
    const pdf = await loading.promise;
    if (number > pdf.numPages || number > 100) throw new ApiError(404, "SOURCE_PAGE_NOT_FOUND", "Halaman sumber tidak ditemukan.");
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1300 / Math.max(base.width, base.height) });
    const [{ items }, operations] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const fonts = new Map();
    const rows = sourceRows(items.filter(item => item.str?.trim()).map(item => {
      if (!fonts.has(item.fontName)) {
        const name = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName)?.name ?? "" : "";
        fonts.set(item.fontName, { bold: /bold|heavy|black|demi/i.test(name), italic: /italic|oblique/i.test(name) });
      }
      const [, , , , x, y] = Util.transform(viewport.transform, item.transform);
      return { x, y, text: item.str.trim(), width: item.width * viewport.scale, height: item.height * viewport.scale, ...fonts.get(item.fontName) };
    }));
    const formulas = sourceFormulas(rows);
    const illustrations = [];
    const croppedRows = new Set();
    const hasImages = operations.fnArray.some(op => imageOperations.has(op));
    if (hasImages || formulas.length) {
      const factory = pdf.canvasFactory;
      const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        const task = page.render({ canvas, canvasContext: context, viewport, recordImages: hasImages, annotationMode: AnnotationMode.DISABLE });
        await task.promise;
        const bounds = hasImages ? imageBounds(task.imageCoordinates, canvas.width, canvas.height, 48, 48) : [];
        const regions = [
          ...formulas.map(group => ({
            group,
            left: Math.max(0, Math.floor(Math.min(...group.map(row => row.x)) - 5)),
            right: Math.min(canvas.width, Math.ceil(Math.max(...group.map(row => row.right)) + 5)),
            top: Math.max(0, Math.floor(Math.min(...group.map(row => row.top)) - 2)),
            bottom: Math.min(canvas.height, Math.ceil(group.at(-1).y + group.at(-1).height * .35)),
          })),
          ...bounds,
        ];
        let imageBytes = 0;
        for (const box of regions) {
          const width = Math.floor(box.right - box.left), height = Math.floor(box.bottom - box.top);
          if (width < 1 || height < 1) continue;
          const crop = factory.create(width, height);
          try {
            crop.context.drawImage(canvas, box.left, box.top, width, height, 0, 0, width, height);
            const mime = box.group ? "image/png" : "image/jpeg";
            const image = box.group ? crop.canvas.toBuffer("image/png") : crop.canvas.toBuffer("image/jpeg", 84);
            if (imageBytes + image.length > 2 * 1024 * 1024) continue;
            imageBytes += image.length;
            illustrations.push({ y: box.top, kind: box.group ? "formula" : "image", src: `data:${mime};base64,${image.toString("base64")}`, width, height,
              lines: box.group?.filter(row => !/^_{4,}$/u.test(row.text)).map(row => row.text) });
            for (const row of box.group ?? []) croppedRows.add(row);
          } finally { factory.destroy(crop); }
        }
      } finally { factory.destroy({ canvas, context }); }
    }

    const blocks = sourceBlocks(rows.filter(row => !croppedRows.has(row)), illustrations, viewport.height);
    return { blocks, page: number, next: number < Math.min(pdf.numPages, 100) ? number + 1 : null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "SOURCE_PAGE_UNREADABLE", "Halaman PDF tidak dapat ditampilkan.");
  } finally {
    clearTimeout(timer);
    await loading.destroy().catch(() => {});
  }
}
