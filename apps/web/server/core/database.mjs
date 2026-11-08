import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

export function createDatabase(connectionString, { schema, maxConnections = 10 } = {}) {
  let valid = false;
  let url;
  try {
    url = new URL(connectionString);
    valid = ["postgres:", "postgresql:"].includes(url.protocol) && !!url.hostname;
  } catch { /* The error below intentionally omits the supplied connection string. */ }
  if (!valid) {
    const error = new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    error.code = "DATABASE_CONFIGURATION_ERROR";
    throw error;
  }
  const adapter = new PrismaPg(
    { connectionString, max: maxConnections, connectionTimeoutMillis: 5000 },
    { schema: schema ?? url.searchParams.get("schema") ?? "public" },
  );
  return new PrismaClient({ adapter });
}

export function database() {
  if (!globalThis.imajilearnDatabase) {
    globalThis.imajilearnDatabase = createDatabase(process.env.DATABASE_URL);
  }
  return globalThis.imajilearnDatabase;
}
