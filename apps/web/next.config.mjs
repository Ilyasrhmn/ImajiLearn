import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import { mobileRewrites } from "./pwa-routing.mjs";

export default function nextConfig(phase) {
  const routes = mobileRewrites({ development: phase === PHASE_DEVELOPMENT_SERVER,
    upstream: process.env.PWA_INTERNAL_ORIGIN, publicOrigin: process.env.APP_ORIGIN });
  return {
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "pdfjs-dist"],
    logging: { incomingRequests: { ignore: [/\/api\/v1\/auth\/google\/callback(?:[?/]|$)/] } },
    async rewrites() { return { beforeFiles: routes, afterFiles: [], fallback: [] }; },
  };
}
