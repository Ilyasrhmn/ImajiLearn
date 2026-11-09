import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";
import { ApiError } from "../core/errors.mjs";
import { withIdempotency } from "../core/idempotency.mjs";
import { createFolderRecord, normalizeFolderName, requireOwnedFolder } from "../folders/service.mjs";

const slotFields = ["folderId", "className", "day", "start", "end"];
const missingSlot = () => new ApiError(404, "SCHEDULE_NOT_FOUND", "Jadwal tidak ditemukan.");

function invalid(field, message) {
  return new ContractError(message, { [field]: message });
}

function period(year, semester) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw invalid("year", "Isi tahun ajaran 2000–2100.");
  if (semester !== "1" && semester !== "2") throw invalid("semester", "Pilih semester ganjil atau genap.");
  return { year, semester };
}

export function parseScheduleQuery(params) {
  if ([...params.keys()].some(key => !["year", "semester"].includes(key) || params.getAll(key).length !== 1)) {
    throw new ApiError(400, "INVALID_QUERY", "Parameter jadwal tidak valid.");
  }
  const year = params.get("year");
  return period(/^\d{4}$/.test(year ?? "") ? Number(year) : NaN, params.get("semester"));
}

function minutes(value, field) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw invalid(field, "Gunakan format jam HH:mm.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function parseSlot(body) {
  const className = text(body.className, "className", 80);
  if (className.includes("\0")) throw invalid("className", "Isi nama kelas yang valid.");
  const { day } = body;
  if (!Number.isInteger(day) || day < 1 || day > 6) throw invalid("day", "Pilih hari Senin sampai Sabtu.");
  const startMinute = minutes(body.start, "start"), endMinute = minutes(body.end, "end");
  if (startMinute >= endMinute) throw invalid("end", "Jam selesai harus setelah jam mulai.");
  return { className, day, startMinute, endMinute };
}

const clock = value => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const slotDto = row => ({ id: row.id, folderId: row.folderId, className: row.className, day: row.day,
  start: clock(row.startMinute), end: clock(row.endMinute), resourceVersion: row.resourceVersion });

function termDto({ year, semester }, row) {
  return { key: `${year}-${semester}`, year, semester,
    entries: row?.entries.map(slotDto) ?? [], resourceVersion: row?.resourceVersion ?? 0 };
}

async function readTerm(db, userId, selected) {
  const row = await db.scheduleTerm.findUnique({
    where: { userId_year_semester: { userId, ...selected } },
    include: { entries: { orderBy: [{ day: "asc" }, { startMinute: "asc" }, { id: "asc" }] } },
  });
  return termDto(selected, row);
}

// One writer per teacher protects semester and slot quotas and the overlap check.
async function lockOwner(tx, userId) {
  await tx.$queryRaw`SELECT "id" FROM "Teacher" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
}

async function checkOverlap(tx, userId, termId, slot, except) {
  const overlap = await tx.scheduleSlot.findFirst({
    where: { userId, termId, day: slot.day, startMinute: { lt: slot.endMinute }, endMinute: { gt: slot.startMinute },
      ...(except ? { id: { not: except } } : {}) },
    select: { id: true },
  });
  if (overlap) {
    const message = "Jam ini bertabrakan dengan jadwal mengajar lain.";
    throw new ApiError(409, "SCHEDULE_OVERLAP", message, { start: message });
  }
}

async function bumpTerm(tx, term) {
  if (term.resourceVersion >= 2147483647) throw new ApiError(409, "VERSION_EXHAUSTED", "Versi semester sudah mencapai batas.");
  await tx.scheduleTerm.update({ where: { id: term.id }, data: { resourceVersion: { increment: 1 } } });
}

export function createScheduleService(db) {
  async function mutate(userId, id, version, action) {
    if (typeof id !== "string" || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw missingSlot();
    return db.$transaction(async tx => {
      await lockOwner(tx, userId);
      const row = await tx.scheduleSlot.findFirst({ where: { id: id.toLowerCase(), userId }, include: { term: true } });
      if (!row) throw missingSlot();
      if (row.resourceVersion !== version) throw new ApiError(412, "RESOURCE_CHANGED", "Jadwal sudah berubah. Muat ulang sebelum menyimpan.");
      const result = await action(tx, row);
      await bumpTerm(tx, row.term);
      return result === null ? null : readTerm(tx, userId, { year: row.term.year, semester: row.term.semester });
    }, { isolationLevel: "ReadCommitted" });
  }

  return {
    get(userId, selected) {
      return db.$transaction(tx => readTerm(tx, userId, selected), { isolationLevel: "RepeatableRead" });
    },
    async create(userId, body, key) {
      object(body, ["year", "semester", "newSubject", ...slotFields]);
      const selected = period(body.year, body.semester);
      const slot = parseSlot(body);
      const newSubject = Object.hasOwn(body, "newSubject") ? normalizeFolderName(body.newSubject) : null;
      if (newSubject && Object.hasOwn(body, "folderId")) throw invalid("folderId", "Pilih folder atau buat mapel pertama.");
      if (!newSubject && typeof body.folderId !== "string") throw invalid("folderId", "Pilih mapel.");
      const folderId = newSubject ? null : body.folderId;
      return withIdempotency(db, { userId, route: "POST /schedule/slots", key, payload: { ...selected, ...slot, newSubject, folderId } }, async tx => {
        await lockOwner(tx, userId);
        let term = await tx.scheduleTerm.findUnique({ where: { userId_year_semester: { userId, ...selected } } });
        const existing = Boolean(term);
        if (!term) {
          if (await tx.scheduleTerm.count({ where: { userId } }) >= 20) throw new ApiError(409, "SCHEDULE_TERM_LIMIT", "Maksimal 20 semester per akun.");
          term = await tx.scheduleTerm.create({ data: { userId, ...selected } });
        }
        if (await tx.scheduleSlot.count({ where: { userId, termId: term.id } }) >= 100) {
          throw new ApiError(409, "SCHEDULE_SLOT_LIMIT", "Maksimal 100 jadwal per semester.");
        }
        await checkOverlap(tx, userId, term.id, slot);
        let createdFolder = null;
        if (newSubject) {
          if (await tx.folder.count({ where: { userId } })) {
            throw new ApiError(409, "FOLDER_SELECTION_CHANGED", "Daftar mapel sudah berubah. Muat ulang dan pilih mapel.");
          }
          createdFolder = await createFolderRecord(tx, userId, newSubject);
        }
        const ownedFolderId = createdFolder?.id ?? await requireOwnedFolder(tx, userId, folderId);
        await tx.scheduleSlot.create({ data: { ...slot, folderId: ownedFolderId, userId, termId: term.id } });
        if (existing) await bumpTerm(tx, term);
        return { term: await readTerm(tx, userId, selected), createdFolder };
      });
    },
    update(userId, id, body, version) {
      object(body, slotFields);
      if (!Object.keys(body).length) throw new ContractError("Kirim perubahan jadwal.");
      return mutate(userId, id, version, async (tx, row) => {
        const merged = { ...slotDto(row), ...body };
        const slot = parseSlot(merged);
        const folderId = await requireOwnedFolder(tx, userId, merged.folderId);
        await checkOverlap(tx, userId, row.termId, slot, row.id);
        if (row.resourceVersion >= 2147483647) throw new ApiError(409, "VERSION_EXHAUSTED", "Versi jadwal sudah mencapai batas.");
        await tx.scheduleSlot.update({ where: { id: row.id }, data: { ...slot, folderId, resourceVersion: { increment: 1 } } });
      });
    },
    remove(userId, id, version) {
      return mutate(userId, id, version, async (tx, row) => {
        await tx.scheduleSlot.delete({ where: { id: row.id } });
        return null;
      });
    },
  };
}
