import { scrypt as scryptCallback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  const match = /^scrypt\$32768\$8\$1\$([a-f\d]{32})\$([a-f\d]{128})$/.exec(encoded);
  if (!match) return false;
  const actual = await scrypt(password, match[1], 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(match[2], "hex"));
}
