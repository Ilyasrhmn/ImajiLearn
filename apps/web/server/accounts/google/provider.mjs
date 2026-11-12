import { createRemoteJWKSet, jwtVerify } from "jose";
import { digest } from "../../core/crypto.mjs";
import { parseEmail } from "../registration-contract.mjs";
import { googleAvatarUrl } from "@imajilearn/shared/lib/google-avatar.mjs";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 });
const failure = () => new Error("Google verification failed");

async function boundedJson(response) {
  if (!response.ok || Number(response.headers.get("content-length")) > 65536) throw failure();
  const reader = response.body?.getReader();
  if (!reader) throw failure();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw failure(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
}

// Dependency injection is only available to server code; routes always use the fixed Google endpoints and keys.
export function createGoogleProvider(config, { fetch: transport = fetch, keys = googleKeys } = {}) {
  return {
    async exchange({ code, verifier, nonceHash }) {
      const response = await transport("https://oauth2.googleapis.com/token", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret,
          redirect_uri: `${config.origin}/api/v1/auth/google/callback`, grant_type: "authorization_code", code_verifier: verifier }),
      });
      const result = await boundedJson(response);
      if (typeof result.id_token !== "string" || result.id_token.length > 16384) throw failure();
      const { payload } = await jwtVerify(result.id_token, keys, {
        algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"], audience: config.clientId,
        requiredClaims: ["sub", "iss", "aud", "exp", "iat", "nonce", "email", "email_verified"],
        maxTokenAge: "10m", clockTolerance: 30,
      });
      if (typeof payload.nonce !== "string" || digest(payload.nonce) !== nonceHash ||
          typeof payload.sub !== "string" || !payload.sub.trim() || payload.sub.length > 255 || /[\u0000-\u0020\u007f]/.test(payload.sub) ||
          payload.email_verified !== true || (payload.azp !== undefined && payload.azp !== config.clientId) ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId)) throw failure();
      const email = parseEmail(payload.email);
      const name = (typeof payload.name === "string" ? payload.name.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "").slice(0, 60) || email.split("@")[0].slice(0, 60);
      return { sub: payload.sub, email, name, avatarUrl: googleAvatarUrl(payload.picture) };
    },
  };
}
