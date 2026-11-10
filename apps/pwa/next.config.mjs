const nextConfig = { basePath: "/app", devIndicators: false,
  distDir: process.env.IMAJILEARN_TEST_BUILD === "pwa-production" ? ".next/pwa-production" : ".next",
  async headers() { return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }, { key: "Service-Worker-Allowed", value: "/app/" }] }]; },
};

export default nextConfig;
