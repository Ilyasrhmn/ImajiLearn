import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";
import { ApiError } from "../core/errors.mjs";
import { withIdempotency } from "../core/idempotency.mjs";

const notFound = () => new ApiError(404, "FOLDER_NOT_FOUND", "Folder tidak ditemukan.");
const duplicate = () => new ApiError(409, "FOLDER_NAME_EXISTS", "Nama folder sudah digunakan.", { name: "Gunakan nama lain." });
const dto = ({ id, name, resourceVersion, createdAt, updatedAt }) =>
  ({ id, name, resourceVersion, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() });

export function canonicalFolderId(id) {
  return typeof id === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id) ? id.toLowerCase() : null;
}

export function normalizeFolderName(value) {
  const name = text(typeof value === "string" ? value.replace(/\s+/gu, " ") : value, "name", 80);
  if (name.includes("\0")) throw new ContractError("Nama folder tidak valid.", { name: "Gunakan nama yang valid." });
  return name;
}

function parseName(body) {
  object(body, ["name"]);
  return normalizeFolderName(body.name);
}

export async function requireOwnedFolder(tx, userId, id) {
  const canonical = canonicalFolderId(id);
  if (!canonical) throw notFound();
  const rows = await tx.$queryRaw`SELECT "id" FROM "Folder" WHERE "id" = ${canonical}::uuid AND "userId" = ${userId}::uuid FOR KEY SHARE`;
  if (!rows.length) throw notFound();
  return canonical;
}

export async function createFolderRecord(tx, userId, name) {
  await tx.$queryRaw`SELECT "id" FROM "Teacher" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
  if (await tx.folder.count({ where: { userId } }) >= 40) {
    throw new ApiError(409, "FOLDER_LIMIT", "Maksimal 40 folder per akun.");
  }
  return dto(await tx.folder.create({ data: { userId, name, nameKey: name.toLowerCase() } }));
}

export function createFolderService(db) {
  async function mutate(userId, id, version, action) {
    const canonical = canonicalFolderId(id);
    if (!canonical) throw notFound();
    return db.$transaction(async tx => {
      const [folder] = await tx.$queryRaw`SELECT "resourceVersion" FROM "Folder"
        WHERE "id" = ${canonical}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      if (!folder) throw notFound();
      if (folder.resourceVersion !== version) throw new ApiError(412, "RESOURCE_CHANGED", "Folder sudah berubah. Muat ulang sebelum menyimpan.");
      return action(tx, canonical, folder);
    });
  }
  return {
    async list(userId) {
      const rows = await db.folder.findMany({ where: { userId }, orderBy: [{ nameKey: "asc" }, { id: "asc" }] });
      return rows.map(dto);
    },
    async create(userId, body, key) {
      const name = parseName(body);
      try {
        const result = await withIdempotency(db, { userId, route: "POST /folders", key, payload: { name } },
          tx => createFolderRecord(tx, userId, name));
        if (result.deleted) throw notFound();
        return result;
      } catch (error) {
        if (error.code === "P2002") throw duplicate();
        throw error;
      }
    },
    async rename(userId, id, body, version) {
      const name = parseName(body);
      try {
        return await mutate(userId, id, version, async (tx, canonical, folder) => {
          if (folder.resourceVersion >= 2147483647) throw new ApiError(409, "VERSION_EXHAUSTED", "Versi folder sudah mencapai batas.");
          return dto(await tx.folder.update({ where: { id: canonical }, data: {
            name, nameKey: name.toLowerCase(), updatedAt: new Date(), resourceVersion: { increment: 1 },
          } }));
        });
      } catch (error) {
        if (error.code === "P2002") throw duplicate();
        throw error;
      }
    },
    async remove(userId, id, version) {
      try {
        await mutate(userId, id, version, async (tx, canonical) => {
          await tx.folder.delete({ where: { id: canonical } });
          await tx.idempotency.updateMany({
            where: { userId, route: "POST /folders", response: { path: ["id"], equals: canonical } },
            data: { response: { deleted: true } },
          });
        });
      } catch (error) {
        if (error.code === "P2003") throw new ApiError(409, "FOLDER_IN_USE", "Pindahkan materi dan hapus jadwal mapel ini terlebih dahulu.");
        throw error;
      }
    },
  };
}
