import { ApiError } from "../core/errors.mjs";
import { readJson } from "../core/http.mjs";

const maxFileBytes = 10 * 1024 * 1024;
const maxBodyBytes = maxFileBytes + 256 * 1024;
const maxTextLength = 40000;

export async function readMaterialUpload(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    return { body: await readJson(request, 256 * 1024), file: null };
  }
  const tooLarge = () => new ApiError(413, "BODY_TOO_LARGE", "File maksimal 10 MB.");
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw tooLarge();
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBodyBytes) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  let form;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new ApiError(400, "INVALID_MULTIPART", "Unggahan belum dapat dibaca.");
  }
  const body = {};
  let file = null;
  const seen = new Set();
  for (const [key, value] of form) {
    if (seen.has(key) || !["title", "folderId", "text", "file"].includes(key)) {
      throw new ApiError(422, "INVALID_UPLOAD", "Isian unggahan tidak valid.");
    }
    seen.add(key);
    if (key === "file") file = await readFile(value);
    else {
      if (typeof value !== "string") throw new ApiError(422, "INVALID_UPLOAD", "Isian unggahan tidak valid.");
      body[key] = key === "folderId" && value === "" ? null : value;
    }
  }
  return { body, file };
}

async function readFile(value) {
  if (!(value instanceof File) || !value.size || value.name.length > 255 ||
      /[\u0000-\u001f\u007f/\\]/u.test(value.name)) {
    throw new ApiError(422, "INVALID_FILE", "File belum valid.");
  }
  if (value.size > maxFileBytes) throw new ApiError(413, "FILE_TOO_LARGE", "File maksimal 10 MB.");
  const mime = /\.pdf$/i.test(value.name) ? "application/pdf" : /\.txt$/i.test(value.name) ? "text/plain" : null;
  if (!mime || (value.type && value.type !== mime && value.type !== "application/octet-stream")) {
    throw new ApiError(415, "INVALID_FILE_TYPE", "Pilih file PDF atau TXT.");
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (mime === "application/pdf" && Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
    throw new ApiError(415, "INVALID_FILE_TYPE", "File bukan PDF yang valid.");
  }
  return { name: value.name, mime, size: value.size, bytes };
}

export async function extractSource(file) {
  let source;
  try {
    if (file.mime === "text/plain") source = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    else {
      const { extractPdf } = await import("./pdf.mjs");
      source = await extractPdf(file.bytes);
    }
  } catch (error) {
    return { text: "", extractionStatus: "failed", extractionError: error instanceof ApiError ? error.code : "SOURCE_TEXT_UNREADABLE" };
  }
  if (source.length > maxTextLength) return { text: "", extractionStatus: "failed", extractionError: "SOURCE_TEXT_TOO_LONG" };
  if (!source.trim() || source.includes("\0")) return { text: "", extractionStatus: "failed", extractionError: "SOURCE_TEXT_UNREADABLE" };
  return { text: source, extractionStatus: "ready", extractionError: null };
}
