import { randomUUID } from "node:crypto";
import { ApiError, errorResponse } from "./errors.mjs";

export function endpoint(handler, origin) {
  return async (request, ...args) => {
    const requestId = randomUUID();
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
          (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site")) {
        throw new ApiError(403, "ORIGIN_REJECTED", "Asal permintaan tidak diizinkan.");
      }
      const response = await handler(request, ...args);
      response.headers.set("cache-control", "no-store");
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) { return errorResponse(error, requestId); }
  };
}

export async function readJson(request, maxBytes = 16 * 1024) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "JSON_REQUIRED", "Gunakan Content-Type application/json.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ApiError(413, "BODY_TOO_LARGE", "Permintaan terlalu besar.");
  const reader = request.body?.getReader(), chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ApiError(413, "BODY_TOO_LARGE", "Permintaan terlalu besar.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new ApiError(400, "INVALID_JSON", "JSON tidak dapat dibaca."); }
}
