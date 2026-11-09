import { randomBytes } from "node:crypto";
import { digest } from "../core/crypto.mjs";
import { sessionCookie } from "./session-cookie.mjs";

export async function issueSession(tx, userId, { secure, absoluteSeconds }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + absoluteSeconds * 1000);
  await tx.session.create({ data: { userId, tokenHash: digest(token), expiresAt } });
  return { expiresAt: expiresAt.toISOString(),
    cookie: sessionCookie(token, secure, absoluteSeconds) };
}
