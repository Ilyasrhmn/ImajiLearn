import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";
import { ApiError } from "../core/errors.mjs";
import { digest } from "../core/crypto.mjs";
import { withIdempotency } from "../core/idempotency.mjs";
import { canonicalFolderId, requireOwnedFolder } from "../folders/service.mjs";
import { canonicalMaterialId, lockOwnedMaterial, sourceSnapshot } from "./readers.mjs";
import { extractSource } from "./upload.mjs";

const notFound = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const fileMetadata = { select: { materialId: true, name: true, mime: true, size: true } };

function listQuery(params) {
  const invalid = () => new ApiError(400, "INVALID_QUERY", "Parameter daftar materi tidak valid.");
  for (const key of params.keys()) {
    if (!["view", "q", "cursor", "limit", "folderId", "unfiled"].includes(key) || params.getAll(key).length !== 1) throw invalid();
  }
  const view = params.get("view") ?? "active";
  const q = (params.get("q") ?? "").trim();
  const limit = params.get("limit") ?? "50";
  const folder = params.get("folderId");
  const unfiled = params.get("unfiled");
  const folderId = folder === null ? null : canonicalFolderId(folder);
  if ((folder !== null && !folderId) || (unfiled !== null && (unfiled !== "true" || folderId))) throw invalid();
  if (!["active", "archive", "all"].includes(view) || q.length > 120 || q.includes("\0") ||
      !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100) throw invalid();
  const cursor = params.get("cursor");
  let after;
  if (cursor !== null) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) throw invalid();
    const [time, id, pin = "0", ...extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const createdAt = new Date(time);
    if (extra.length || !["0", "1"].includes(pin) || !canonicalMaterialId(id) || !Number.isFinite(createdAt.getTime()) ||
        createdAt.toISOString() !== time) throw invalid();
    const pinned = pin === "1";
    after = { OR: [
      { pinned, createdAt: { lt: createdAt } },
      { pinned, createdAt, id: { lt: id } },
      ...(pinned ? [{ pinned: false }] : []),
    ] };
  }
  return { archived: view === "all" ? undefined : view === "archive", q, limit: Number(limit), after, folderId, unfiled: unfiled === "true" };
}
function dto(row) {
  const file = row.file ? { id: row.file.materialId, name: row.file.name, mime: row.file.mime, size: row.file.size } : null;
  return { id: row.id, title: row.title, folderId: row.folderId, file, text: row.text,
    ...(row.parentId ? { parentId: row.parentId, pageStart: row.pageStart, pageEnd: row.pageEnd, sectionPages: row.sectionPages } : {}),
    extractionStatus: row.extractionStatus, extractionError: row.extractionError, revision: row.revision, pinned: row.pinned, archived: row.archived,
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
      const { archived, q, limit, after, folderId, unfiled } = listQuery(params);
      if (folderId && !await db.folder.findFirst({ where: { id: folderId, userId }, select: { id: true } })) {
        throw new ApiError(404, "FOLDER_NOT_FOUND", "Folder tidak ditemukan.");
      }
      const scope = folderId || (unfiled || (archived === false && !q) ? null : undefined);
      const search = { contains: q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" };
      const rows = await db.material.findMany({
        where: { userId, parentId: null, archived, folderId: scope, AND: [
          ...(q ? [{ OR: [{ title: search }, { file: { is: { name: search } } }] }] : []),
          ...(after ? [after] : []),
        ] },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: { id: true, title: true, revision: true, archived: true, folderId: true, pinned: true,
          resourceVersion: true, createdAt: true, updatedAt: true, extractionStatus: true, extractionError: true, file: fileMetadata },
      });
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      const nextCursor = rows.length > limit
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}|${Number(last.pinned)}`).toString("base64url")
        : null;
      return { data: items.map(dto), page: { nextCursor } };
    },
    async get(userId, id) {
      id = canonicalMaterialId(id);
      const row = id ? await db.material.findFirst({ where: { id, userId }, include: { file: fileMetadata } }) : null;
      if (!row) throw notFound();
      return dto(row);
    },
    async file(userId, id) {
      const materialId = canonicalMaterialId(id);
      const file = materialId ? await db.materialFile.findFirst({ where: { materialId, userId } }) : null;
      if (!file) throw notFound();
      return file;
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
    async create(userId, body, key, file = null) {
      object(body, ["title", "text", "folderId"]);
      const title = text(body.title, "title", 120);
      const source = text(file && body.text === undefined ? "" : body.text, "text", 40000, { trim: false, min: file ? 0 : 1 });
      if ((!file && !source.trim()) || title.includes("\0") || source.includes("\0")) throw new ContractError("Isi judul dan teks materi yang valid.");
      const content = { title, text: source };
      const folderId = body.folderId == null ? null : canonicalFolderId(body.folderId);
      if (body.folderId != null && !folderId) throw new ContractError("Folder tidak valid.");
      const payload = folderId === null ? content : { ...content, folderId };
      if (file) payload.file = { name: file.name, mime: file.mime, hash: digest(file.bytes) };
      const extracted = file && !source.trim() ? await extractSource(file) : { text: source, extractionStatus: "ready", extractionError: null };
      const result = await withIdempotency(db, { userId, route: "POST /materials", key, payload }, async tx => {
        if (folderId) await requireOwnedFolder(tx, userId, folderId);
        const revision = digest(JSON.stringify({ title, text: extracted.text, ...(file ? { file: payload.file } : {}) }));
        return dto(await tx.material.create({ data: {
          userId, title, folderId, revision, ...extracted,
          ...(file ? { file: { create: file } } : {}),
        }, include: { file: fileMetadata } }));
      });
      if (result.deleted) throw notFound();
      return result;
    },
    async patch(userId, id, body, version) {
      object(body, ["archived", "pinned", "folderId"]);
      if (!Object.keys(body).length) throw new ContractError("Kirim perubahan materi.");
      for (const field of ["archived", "pinned"]) {
        if (Object.hasOwn(body, field) && typeof body[field] !== "boolean") {
          throw new ContractError("Status materi tidak valid.", { [field]: "Gunakan boolean." });
        }
      }
      const folderId = body.folderId === null ? null : canonicalFolderId(body.folderId);
      if (Object.hasOwn(body, "folderId") && body.folderId !== null && !folderId) throw new ContractError("Folder tidak valid.");
      return withOwnedMaterial(userId, id, async (tx, row) => {
        if (row.parentId) throw notFound();
        if (row.resourceVersion !== version) throw new ApiError(412, "RESOURCE_CHANGED", "Data sudah berubah. Muat ulang sebelum menyimpan.");
        if (row.resourceVersion >= 2147483647) throw new ApiError(409, "VERSION_EXHAUSTED", "Versi materi sudah mencapai batas.");
        if (folderId) await requireOwnedFolder(tx, userId, folderId);
        if (Object.hasOwn(body, "archived") && !row.parentId) {
          await tx.material.updateMany({ where: { parentId: row.id, userId }, data: { archived: body.archived } });
        }
        return dto(await tx.material.update({ where: { id: row.id }, data: {
          ...(Object.hasOwn(body, "archived") ? { archived: body.archived } : {}),
          ...(Object.hasOwn(body, "pinned") ? { pinned: body.pinned } : {}),
          ...(Object.hasOwn(body, "folderId") ? { folderId } : {}),
          resourceVersion: { increment: 1 }, updatedAt: new Date(),
        }, include: { file: fileMetadata } }));
      });
    },
    async remove(userId, id, version) {
      await withOwnedMaterial(userId, id, async (tx, row) => {
        if (row.parentId) throw notFound();
        if (row.resourceVersion !== version) throw new ApiError(412, "RESOURCE_CHANGED", "Data sudah berubah. Muat ulang sebelum menghapus.");
        await tx.material.delete({ where: { id: row.id } });
        // Keep the idempotency reservation so a late create retry cannot recreate deleted data.
        await tx.idempotency.updateMany({
          where: { userId, route: "POST /materials", response: { path: ["id"], equals: row.id } },
          data: { response: { deleted: true } },
        });
      });
    },
  };
}
