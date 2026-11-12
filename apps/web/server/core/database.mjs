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
  const selectedSchema = schema ?? url.searchParams.get("schema") ?? "public";
  // Neon pooling rejects startup search_path; public already uses PostgreSQL's default.
  if (selectedSchema !== "public") {
    const identifier = '"' + selectedSchema.replaceAll('"', '""') + '"';
    const searchPath = "-csearch_path=" + identifier.replace(/[\\\s]/gu, "\\$&");
    const options = url.searchParams.get("options");
    url.searchParams.set("options", options ? `${options} ${searchPath}` : searchPath);
  }
  const adapter = new PrismaPg(
    { connectionString: url.toString(), max: maxConnections, connectionTimeoutMillis: 5000 },
    { schema: selectedSchema },
  );
  return new PrismaClient({ adapter });
}

export function database() {
  if (!globalThis.imajilearnDatabase ||
      (process.env.NODE_ENV === "development" && globalThis.imajilearnDatabaseClient !== PrismaClient)) {
    globalThis.imajilearnDatabase = createDatabase(process.env.DATABASE_URL);
    globalThis.imajilearnDatabaseClient = PrismaClient;
  }
  return globalThis.imajilearnDatabase;
}
