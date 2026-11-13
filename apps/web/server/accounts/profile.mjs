import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";
import { ApiError } from "../core/errors.mjs";
import { endpoint, readJson } from "../core/http.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { hashPassword, verifyPassword } from "./password.mjs";
import { issueSession } from "./session-issuer.mjs";
import { createSessionHandlers } from "./sessions.mjs";

const profileSelect = { id: true, name: true, email: true, school: true, grade: true, avatarUrl: true };

function parseProfile(body, email) {
  object(body, ["name", "email", "school", "grade"]);
  if (Object.hasOwn(body, "email") && text(body.email, "email", 254).toLowerCase() !== email) {
    throw new ApiError(422, "EMAIL_CHANGE_UNAVAILABLE", "Email akun belum dapat diubah.", { email: "Gunakan email akun saat ini." });
  }
  const data = {};
  for (const [field, max, min] of [["name", 60, 1], ["school", 100, 0], ["grade", 1, 0]]) {
    if (!Object.hasOwn(body, field)) continue;
    const value = text(body[field], field, max, { min });
    if (value.includes("\0")) throw new ContractError("Isian profil tidak valid.", { [field]: "Hapus karakter yang tidak valid." });
    data[field] = value;
  }
  if (data.grade && !/^[1-6]$/.test(data.grade)) {
    throw new ContractError("Kelas tidak valid.", { grade: "Pilih kelas 1–6 atau kosongkan." });
  }
  if (Object.keys(data).length === 0) throw new ContractError("Tidak ada perubahan profil.");
  return data;
}

function parsePasswordChange(body) {
  object(body, ["currentPassword", "newPassword", "confirmPassword"]);
  const current = text(body.currentPassword, "currentPassword", 128, { trim: false });
  const next = text(body.newPassword, "newPassword", 128, { min: 8, trim: false });
  const confirm = text(body.confirmPassword, "confirmPassword", 128, { trim: false });
  if (next !== confirm) throw new ContractError("Kata sandi belum sama.", { confirmPassword: "Kata sandi belum sama." });
  if (next === current) throw new ContractError("Gunakan kata sandi baru.", { newPassword: "Kata sandi baru harus berbeda." });
  return { current, next };
}

export function createProfileHandlers(db, config) {
  const { requireTeacher } = createSessionHandlers(db, config);
  async function account(teacher) {
    const credentials = await db.teacher.findUnique({ where: { id: teacher.id }, select: {
      passwordHash: true, googleIdentity: { select: { sub: true } },
    } });
    const { avatarUrl, ...details } = teacher;
    return { ...details, ...(avatarUrl ? { avatarUrl } : {}), auth: { hasPassword: Boolean(credentials?.passwordHash),
      googleLinked: Boolean(credentials?.googleIdentity), googleEnabled: Boolean(config.googleEnabled) } };
  }
  return {
    get: endpoint(async request => Response.json({ data: await account(await requireTeacher(request)) }), config.origin),
    patch: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const data = parseProfile(await readJson(request), teacher.email);
      const updated = await db.teacher.update({ where: { id: teacher.id }, data, select: profileSelect });
      return Response.json({ data: await account(updated) });
    }, config.origin),
    password: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const { current, next } = parsePasswordChange(await readJson(request));
      await consumeRateLimit(db, `password:${teacher.id}`, 5, 15 * 60 * 1000);
      const credentials = await db.teacher.findUnique({ where: { id: teacher.id }, select: { passwordHash: true } });
      if (credentials && !credentials.passwordHash) throw new ApiError(422, "PASSWORD_UNAVAILABLE", "Akun ini masuk menggunakan Google.");
      if (!credentials || !await verifyPassword(current, credentials.passwordHash)) {
        throw new ContractError("Kata sandi saat ini salah.", { currentPassword: "Kata sandi saat ini salah." });
      }
      const passwordHash = await hashPassword(next);
      const issued = await db.$transaction(async tx => {
        const changed = await tx.teacher.updateMany({
          where: { id: teacher.id, passwordHash: credentials.passwordHash }, data: { passwordHash },
        });
        if (changed.count !== 1) throw new ApiError(409, "PASSWORD_CHANGED", "Kata sandi sudah berubah. Masuk kembali.");
        await createSessionHandlers(tx, config).requireTeacher(request);
        await tx.session.deleteMany({ where: { userId: teacher.id } });
        return issueSession(tx, teacher.id, {
          secure: config.origin.startsWith("https://"), absoluteSeconds: config.sessionAbsoluteSeconds ?? 604800,
        });
      });
      return new Response(null, { status: 204, headers: { "set-cookie": issued.cookie } });
    }, config.origin),
  };
}
