import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import { fileURLToPath } from "node:url";
import { mobileRewrites } from "./pwa-routing.mjs";

export default function nextConfig(phase) {
  const routes = mobileRewrites({ development: phase === PHASE_DEVELOPMENT_SERVER,
    upstream: process.env.PWA_INTERNAL_ORIGIN, publicOrigin: process.env.APP_ORIGIN });
  return {
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
    distDir: ["pwa-production", "pwa-http"].includes(process.env.IMAJILEARN_TEST_BUILD) ? `.next/${process.env.IMAJILEARN_TEST_BUILD}` : ".next",
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "pdfjs-dist"],
    logging: { incomingRequests: { ignore: [/\/api\/v1\/auth\/google\/(?:pwa\/)?callback(?:[?/]|$)/] } },
    async rewrites() { return { beforeFiles: routes, afterFiles: [], fallback: [] }; },
  };
}
