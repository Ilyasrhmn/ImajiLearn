const nextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "pdfjs-dist"],
  logging: { incomingRequests: { ignore: [/\/api\/v1\/auth\/google\/callback(?:[?/]|$)/] } },
};

export default nextConfig;
