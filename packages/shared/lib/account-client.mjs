import { apiPath, navigateAfterSessionChange, sessionLoginPath } from "./session.mjs";
import { PROFILE_KEY } from "./teacher-profile.mjs";
import { teacherStorageKey } from "./teacher-storage.mjs";

export async function requestAccount(teacherId, { method = "GET", body, signal, password = false } = {}) {
  const fallback = "Layanan akun belum dapat dihubungi. Coba lagi.";
  const headers = { "X-Teacher-Id": teacherId };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(apiPath(password ? "/me/password" : "/me"), {
    method, headers, signal, cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(error => {
    if (signal?.aborted) throw error;
    throw new Error(fallback);
  });
  if (signal?.aborted) return null;
  if (response.status === 401) {
    navigateAfterSessionChange(sessionLoginPath());
    return null;
  }
  if (password && response.status === 204) return true;
  const payload = await response.json().catch(() => null);
  if (signal?.aborted) return null;
  if (payload?.error?.code === "ACCOUNT_CHANGED") {
    window.location.reload();
    return null;
  }
  if (!response.ok || !payload?.data) throw new Error(payload?.error?.message || fallback);
  if (payload.data.id !== teacherId) {
    window.location.reload();
    return null;
  }
  const { name, school, grade } = payload.data;
  try {
    localStorage.setItem(teacherStorageKey(teacherId, PROFILE_KEY), JSON.stringify({ name, school, grade }));
  } catch {
    // The server remains authoritative if the browser cannot keep the profile cache.
  }
  if (method === "PATCH") window.dispatchEvent(new Event("profile-updated"));
  return payload.data;
}
