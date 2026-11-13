import { AnnotationMode, getDocument, OPS, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ApiError } from "../core/errors.mjs";
import { sourceTextLimit, sourceTextLimitMessage } from "../../lib/material-limits.mjs";
import { sectionLabel } from "../../lib/material-section-label.mjs";

function openPdf(bytes, options = {}) {
  return getDocument({
    data: new Uint8Array(bytes), stopAtErrors: true, useSystemFonts: false, disableFontFace: true,
    enableXfa: false, isEvalSupported: false, verbosity: 0, ...options,
  });
}

function pdfTextError(error) {
  if (error instanceof ApiError) return error;
  return new ApiError(422, "SOURCE_TEXT_UNREADABLE", "PDF tidak dapat dibaca. Periksa file sumber.");
}

export async function extractPdf(bytes, range) {
  const loading = openPdf(bytes);
  try {
    const document = await loading.promise;
    if (document.numPages > 100) throw new ApiError(422, "SOURCE_TOO_MANY_PAGES", "PDF maksimal 100 halaman.");
    const { first = 1, last = document.numPages } = range ?? {};
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > document.numPages) {
      throw new ApiError(422, "INVALID_PAGE_RANGE", "Rentang halaman tidak valid.");
    }
    let source = "";
    for (const index of range?.pages ?? Array.from({ length: last - first + 1 }, (_, i) => first + i)) {
      const page = await document.getPage(index);
      const reader = page.streamTextContent().getReader();
      let tooLong = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (tooLong) continue;
          for (const item of value.items) {
            if (typeof item.str !== "string") continue;
            source += item.str + (item.hasEOL ? "\n" : " ");
            if (source.length > sourceTextLimit) {
              tooLong = true;
              break;
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        page.cleanup();
      }
      if (tooLong) throw new ApiError(422, "SOURCE_TEXT_TOO_LONG", sourceTextLimitMessage);
      source += "\n";
    }
    return source.trim();
  } catch (error) {
    throw pdfTextError(error);
  } finally {
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

function headingRows(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => b.height - a.height)) {
    const row = rows.find(row => Math.abs(row.y - item.y) <= 2 || (
      item.height > 0 && item.height < row.height * .8 && Math.abs(row.y - item.y) <= row.height * .6 &&
      row.items.some(base => base.x - 2 <= item.x && base.x + base.width + row.height * .35 >= item.x)
    ));
    if (row) row.items.push(item);
    else rows.push({ y: item.y, height: item.height, items: [item] });
  }
  return rows.sort((a, b) => a.y - b.y).map(({ items, height, y }) => {
    items.sort((a, b) => a.x - b.x);
    const text = items.map((item, index) => {
      const previous = items[index - 1];
      const gap = previous ? item.x - previous.x - previous.width : 0;
      const script = item.height < height * .8 && Math.abs(y - item.y) > 2;
      const space = previous && !script && (gap > height * .11 || !/^[,.;:!?)]/u.test(item.text) && gap > height * .065);
      return (space ? " " : "") + item.text;
    }).join("");
    return { height, text };
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
export async function findPdfFigures(bytes, topic, range) {
  const loading = openPdf(bytes, { maxImageSize: 16_000_000 });
  const terms = new Set(topic.toLowerCase().match(/\p{L}{4,}/gu) ?? []);
  const figures = [];
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 100) return figures;
    const candidates = [];
    for (let number = range?.first ?? 1; number <= Math.min(range?.last ?? pdf.numPages, pdf.numPages); number++) {
      if (range?.pages?.length && !range.pages.includes(number)) continue;
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

    for (const { number, items } of candidates) {
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
        for (const figure of bounds) {
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
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "SOURCE_FIGURES_SCAN_FAILED", "Gambar sumber belum dapat diperiksa. Coba lagi.");
  } finally {
    await loading.destroy().catch(() => {});
  }
}

export async function readPdfSourcePage(bytes, number) {
  const loading = openPdf(bytes, { maxImageSize: 16_000_000 });
  try {
    const pdf = await loading.promise;
    if (!Number.isInteger(number) || number < 1 || number > Math.min(pdf.numPages, 100)) {
      throw new ApiError(404, "SOURCE_PAGE_NOT_FOUND", "Halaman sumber tidak ditemukan.");
    }
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
    const surface = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({ canvas: surface.canvas, canvasContext: surface.context, viewport,
        annotationMode: AnnotationMode.DISABLE }).promise;
      const image = surface.canvas.toBuffer("image/jpeg", 88);
      return { page: number, next: number < Math.min(pdf.numPages, 100) ? number + 1 : null,
        preview: `data:image/jpeg;base64,${image.toString("base64")}`,
        width: surface.canvas.width, height: surface.canvas.height };
    } finally { pdf.canvasFactory.destroy(surface); }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "SOURCE_PAGE_UNREADABLE", "Halaman PDF tidak dapat ditampilkan.");
  } finally {
    await loading.destroy().catch(() => {});
  }
}

export async function describePdfSections(bytes) {
  const loading = openPdf(bytes);
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 100) throw new ApiError(422, "SOURCE_TOO_MANY_PAGES", "PDF maksimal 100 halaman.");
    const headings = new Map();
    const outline = await pdf.getOutline() ?? [];
    // A single top-level bookmark commonly names the entire module.
    const queue = [...(outline.length === 1 && outline[0].items?.length ? outline[0].items : outline)];
    for (let index = 0; index < queue.length && index < 200; index++) {
      const item = queue[index];
      if (item.items?.length) queue.push(...item.items.slice(0, 200 - queue.length));
      try {
        const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
        if (!destination?.length || !item.title?.trim()) continue;
        const ref = destination[0];
        const number = (typeof ref === "number" ? ref : await pdf.getPageIndex(ref)) + 1;
        if (number >= 1 && number <= pdf.numPages && !headings.has(number)) headings.set(number, item.title.trim().slice(0, 120));
      } catch { /* A broken bookmark leaves manual selection available. */ }
    }
    const detectHeadings = headings.size < 2;
    const pageLengths = [0];
    const subheadings = new Map();
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const { items } = await page.getTextContent();
        const length = items.reduce((total, item) => total + (typeof item.str === "string" ? item.str.length + 1 : 0), 1);
        pageLengths.push(pageLengths.at(-1) + length);
        const heading = items.slice(0, 16).find(item => /^(?:bab|subbab|pembelajaran|kegiatan belajar)\s+(?:[ivxlcdm]+|\d+)\b/iu.test(item.str?.trim()));
        if (detectHeadings && heading && !headings.has(number)) headings.set(number, heading.str.trim().slice(0, 120));
        const bodyHeights = items.filter(item => item.str?.trim().length >= 30).map(item => item.height).sort((a, b) => a - b);
        const bodyHeight = bodyHeights[Math.floor(bodyHeights.length / 2)] ?? 0;
        const rows = headingRows(pageText(items, page.getViewport({ scale: 1 })));
        const labels = rows.filter(row => row.height > bodyHeight * 1.06 && row.text.length < 100 &&
          /^(?:\d+(?:\.\d+)*[.)]|[A-Z][.)]|\([a-z0-9]+\)|[a-z]\))\s*\p{L}/u.test(row.text));
        if (labels[0]) subheadings.set(number, labels[0].text);
      } finally { page.cleanup(); }
    }
    const ordered = [...headings].sort(([a], [b]) => a - b);
    let sections = ordered.map(([first, title], index) => ({
      first, last: (ordered[index + 1]?.[0] ?? pdf.numPages + 1) - 1, title,
    })).filter(({ first, last }) => first !== 1 || last !== pdf.numPages);
    const lengthOf = (first, last) => pageLengths[last] - pageLengths[first - 1];
    if (!sections.length && pageLengths.at(-1) > sourceTextLimit) {
      sections.push({ first: 1, last: pdf.numPages, title: ordered[0]?.[1] ?? "Halaman", pageGroup: !ordered.length });
    } else if (!sections.length && pdf.numPages > 12) {
      for (let first = 1; first <= pdf.numPages; first += 8) {
        const last = Math.min(first + 7, pdf.numPages);
        sections.push({ first, last, title: `Halaman ${first} - ${last}`, pageGroup: true });
      }
    }
    sections = sections.flatMap(section => {
      if (lengthOf(section.first, section.last) <= sourceTextLimit) return [section];
      const parts = [];
      let first = section.first;
      while (first <= section.last) {
        let last = first;
        while (last < section.last && lengthOf(first, last + 1) <= sourceTextLimit) last++;
        const boundary = [...subheadings.keys()].filter(page => page > first + (last - first) / 2 &&
          page <= last + 1 && page <= section.last).at(-1);
        if (boundary && last < section.last) last = boundary - 1;
        parts.push({ ...section, first, last,
          ...(lengthOf(first, last) > sourceTextLimit ? { unavailable: true } : {}),
        });
        first = last + 1;
      }
      return parts.map((part, index) => ({ ...part,
        title: part.pageGroup ? `Halaman ${part.first} - ${part.last}`
          : subheadings.get(part.first) ?? `${section.title} (${index + 1})`,
      }));
    });
    while (sections.length > 9) {
      let merge = -1;
      for (let index = 0; index < sections.length - 1; index++) {
        const combined = lengthOf(sections[index].first, sections[index + 1].last);
        if (combined <= sourceTextLimit &&
          (merge < 0 || combined < lengthOf(sections[merge].first, sections[merge + 1].last))) merge = index;
      }
      if (merge < 0) break;
      const [first, second] = sections.slice(merge, merge + 2);
      const firstTitle = first.firstTitle ?? first.title;
      const lastTitle = second.lastTitle ?? second.title;
      const title = first.pageGroup ? `Halaman ${first.first} - ${second.last}`
        : sectionLabel(firstTitle, lastTitle);
      sections.splice(merge, 2, { ...first, last: second.last, title, firstTitle, lastTitle });
    }
    return { pages: pdf.numPages, sections: sections.map(({ first, last, title, pageGroup, unavailable }) => ({
      first, last, title: sectionLabel(title), ...(pageGroup ? { pageGroup } : {}), ...(unavailable ? { unavailable } : {}),
    })), maxTextLength: sourceTextLimit };
  } catch (error) {
    throw pdfTextError(error);
  } finally {
    await loading.destroy().catch(() => {});
  }
}
