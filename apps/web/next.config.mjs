import { fileURLToPath } from "node:url";

const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  distDir: ["pwa-production", "pwa-http"].includes(process.env.IMAJILEARN_TEST_BUILD) ? `.next/${process.env.IMAJILEARN_TEST_BUILD}` : ".next",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "pdfjs-dist"],
  logging: { incomingRequests: { ignore: [/\/api\/v1\/auth\/google\/callback(?:[?/]|$)/] } },
};

export default nextConfig;
