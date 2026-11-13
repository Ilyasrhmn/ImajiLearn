import { fileURLToPath } from "node:url";

const nextConfig = { basePath: "/app", devIndicators: false,
  logging: { incomingRequests: { ignore: [/\/api\/v1\/auth\/google\/pwa\/callback(?:[?/]|$)/] } },
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  distDir: ["pwa-production", "pwa-http"].includes(process.env.IMAJILEARN_TEST_BUILD) ? `.next/${process.env.IMAJILEARN_TEST_BUILD}` : ".next",
  async headers() { return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }, { key: "Service-Worker-Allowed", value: "/app/" }] }]; },
  async redirects() { return [{ source: "/", destination: "/app", basePath: false, permanent: false }]; },
  async rewrites() {
    const backend = process.env.PWA_BACKEND_ORIGIN || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
    if (!backend) return [];
    const url = new URL(backend);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== backend || url.username || url.password) throw new Error("PWA_BACKEND_ORIGIN must be an HTTP(S) origin.");
    return ["/brand/:path*"].map(source => ({ source, destination: `${backend}${source}`, basePath: false }));
  },
};

export default nextConfig;
