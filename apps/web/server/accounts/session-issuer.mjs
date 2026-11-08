import { randomBytes } from "node:crypto";
import { digest } from "../core/crypto.mjs";

export async function issueSession(tx, userId, { secure, absoluteSeconds }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + absoluteSeconds * 1000);
  await tx.session.create({ data: { userId, tokenHash: digest(token), expiresAt } });
  const name = secure ? "__Host-imajilearn_session" : "imajilearn_session";
  return { expiresAt: expiresAt.toISOString(),
    cookie: `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${absoluteSeconds}${secure ? "; Secure" : ""}` };
}
