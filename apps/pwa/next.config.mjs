const nextConfig = { basePath: "/app", devIndicators: false,
  async headers() { return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }, { key: "Service-Worker-Allowed", value: "/app/" }] }]; },
};

export default nextConfig;
