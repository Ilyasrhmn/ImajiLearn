// The mobile frontend shares the web origin; API requests never go upstream.
export function mobileRewrites({ development = false, upstream, publicOrigin } = {}) {
  const target = upstream || (development ? "http://127.0.0.1:3002" : "");
  if (!target) return [];
  let url;
  try { url = new URL(target); } catch { throw new Error("PWA_INTERNAL_ORIGIN must be an HTTP(S) origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || url.origin === publicOrigin) {
    throw new Error("PWA_INTERNAL_ORIGIN must be a separate HTTP(S) origin without a path or credentials.");
  }
  return [
    { source: "/app", destination: `${url.origin}/app` },
    { source: "/app/:path*", destination: `${url.origin}/app/:path*` },
  ];
}
