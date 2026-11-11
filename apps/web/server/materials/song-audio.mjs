export function songAudioResponse(request, { bytes, mime = "audio/mpeg" }) {
  const size = bytes.length;
  const headers = { "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const range = request.headers.get("range");
  if (!range) return new Response(bytes, { headers: { ...headers, "Content-Length": String(size) } });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid = () => new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  if (!match || (!match[1] && !match[2])) return invalid();
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) return invalid();
  end = Math.min(end, size - 1);
  return new Response(bytes.subarray(start, end + 1), { status: 206, headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` } });
}
