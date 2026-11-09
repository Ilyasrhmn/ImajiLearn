import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";
import { ApiError } from "../core/errors.mjs";
import { digest } from "../core/crypto.mjs";
import { withIdempotency } from "../core/idempotency.mjs";
import { canonicalMaterialId, lockOwnedMaterial, sourceSnapshot } from "./readers.mjs";

const notFound = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");

function listQuery(params) {
  const invalid = () => new ApiError(400, "INVALID_QUERY", "Parameter daftar materi tidak valid.");
  for (const key of params.keys()) {
    if (!["view", "q", "cursor", "limit"].includes(key) || params.getAll(key).length !== 1) throw invalid();
  }
  const view = params.get("view") ?? "active";
  const q = (params.get("q") ?? "").trim();
  const limit = params.get("limit") ?? "50";
  if (!["active", "archive"].includes(view) || q.length > 120 || q.includes("\0") ||
      !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100) throw invalid();
  const cursor = params.get("cursor");
  let after;
  if (cursor !== null) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) throw invalid();
    const [time, id, ...extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const createdAt = new Date(time);
    if (extra.length || !canonicalMaterialId(id) || !Number.isFinite(createdAt.getTime()) ||
        createdAt.toISOString() !== time) throw invalid();
    after = { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
  }
  return { archived: view === "archive", q, limit: Number(limit), after };
}
function dto(row) {
  return { id: row.id, title: row.title, folderId: null, file: null, text: row.text,
    extractionStatus: "ready", revision: row.revision, pinned: false, archived: row.archived,
    resourceVersion: row.resourceVersion, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function createMaterialService(db) {
  async function withOwnedMaterial(userId, id, action) {
    return db.$transaction(async tx => {
      const row = await lockOwnedMaterial(tx, userId, id);
      if (!row) throw notFound();
      return action(tx, row);
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
  }
  return {
    withOwnedMaterial,
    async list(userId, params) {
      const { archived, q, limit, after } = listQuery(params);
      const rows = await db.material.findMany({
        where: { userId, archived, ...(q ? { title: { contains: q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } } : {}), ...after },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: { id: true, title: true, revision: true, archived: true, resourceVersion: true, createdAt: true, updatedAt: true },
      });
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      const nextCursor = rows.length > limit
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url")
        : null;
      return { data: items.map(dto), page: { nextCursor } };
    },
    async get(userId, id) {
      id = canonicalMaterialId(id);
      const row = id ? await db.material.findFirst({ where: { id, userId } }) : null;
      if (!row) throw notFound();
      return dto(row);
    },
    getOwnedMaterial: (userId, id) => withOwnedMaterial(userId, id, (_tx, row) => sourceSnapshot(row)),
    async getOwnedMaterials(userId, ids) {
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) throw new ContractError("Pilih 1–100 materi.");
      const canonical = ids.map(canonicalMaterialId);
      if (canonical.includes(null)) throw notFound();
      if (new Set(canonical).size !== ids.length) throw new ContractError("ID materi tidak boleh berulang.");
      return db.$transaction(async tx => {
        const rows = new Map();
        for (const id of [...canonical].sort()) {
          const row = await lockOwnedMaterial(tx, userId, id);
          if (!row) throw notFound();
          rows.set(id, sourceSnapshot(row));
        }
        return canonical.map(id => rows.get(id));
      }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
    },
    async create(userId, body, key) {
      object(body, ["title", "text"]);
      const title = text(body.title, "title", 120), source = text(body.text, "text", 40000, { trim: false });
      if (!source.trim() || title.includes("\0") || source.includes("\0")) throw new ContractError("Isi judul dan teks materi yang valid.");
      const payload = { title, text: source };
      return withIdempotency(db, { userId, route: "POST /materials", key, payload }, async tx =>
        dto(await tx.material.create({ data: { userId, ...payload, revision: digest(JSON.stringify(payload)) } })));
    },
    async patch(userId, id, body, version) {
      object(body, ["archived"]);
      if (typeof body.archived !== "boolean") throw new ContractError("Status arsip tidak valid.", { archived: "Gunakan boolean." });
      return withOwnedMaterial(userId, id, async (tx, row) => {
        if (row.resourceVersion !== version) throw new ApiError(412, "RESOURCE_CHANGED", "Data sudah berubah. Muat ulang sebelum menyimpan.");
        if (row.resourceVersion >= 2147483647) throw new ApiError(409, "VERSION_EXHAUSTED", "Versi materi sudah mencapai batas.");
        return dto(await tx.material.update({ where: { id: row.id }, data: {
          archived: body.archived, resourceVersion: { increment: 1 }, updatedAt: new Date(),
        } }));
      });
    },
  };
}
