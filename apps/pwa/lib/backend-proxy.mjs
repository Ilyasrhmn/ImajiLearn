function origin(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value || url.username || url.password) throw new Error("Invalid origin");
  return url.origin;
}

export async function proxyBackend(request, { params }, env = process.env, send = fetch) {
  const error = (status, message) => Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
  let backend, publicBackend, publicPwa;
  try {
    const development = env.NODE_ENV !== "production";
    backend = origin(env.PWA_BACKEND_ORIGIN || (development ? "http://localhost:3000" : ""));
    publicBackend = origin(env.PWA_BACKEND_PUBLIC_ORIGIN || backend);
    publicPwa = origin(env.PWA_PUBLIC_ORIGIN || (development ? "http://localhost:3002" : ""));
    if (!development && (!publicPwa.startsWith("https://") || !publicBackend.startsWith("https://"))) throw new Error("HTTPS required");
    if (backend === publicPwa) throw new Error("Proxy loop");
  } catch { return error(503, "Koneksi layanan belum dikonfigurasi."); }
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (unsafe && (![publicPwa, publicBackend].includes(request.headers.get("origin")) || request.headers.get("sec-fetch-site") === "cross-site")) {
    return error(403, "Asal permintaan tidak diizinkan.");
  }
  const { path } = await params;
  if (!path?.length || path.some(segment => segment === "." || segment === ".." || /[\\/]/.test(segment))) return error(400, "Alamat layanan tidak valid.");
  const url = new URL(`/api/v1/${path.map(encodeURIComponent).join("/")}`, backend);
  url.search = new URL(request.url).search;
  const headers = new Headers();
  for (const key of ["content-type", "cookie", "if-match", "idempotency-key", "x-teacher-id", "range"]) {
    if (request.headers.has(key)) headers.set(key, request.headers.get(key));
  }
  if (unsafe) headers.set("origin", path.join("/") === "auth/google/pwa" ? publicPwa : publicBackend);
  try {
    const response = await send(url, { method: request.method, headers, cache: "no-store", redirect: "manual",
      ...(request.body ? { body: request.body, duplex: "half" } : {}),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(300000)]) });
    const outgoing = new Headers(response.headers);
    for (const key of ["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"]) outgoing.delete(key);
    for (const cookie of response.headers.getSetCookie()) outgoing.append("set-cookie", cookie);
    outgoing.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch (failure) {
    if (failure.name === "TimeoutError") return error(504, "Proses belum selesai. Buka kembali hasil untuk memeriksa progresnya.");
    return error(502, "Layanan belum dapat dihubungi. Coba lagi.");
  }
}
