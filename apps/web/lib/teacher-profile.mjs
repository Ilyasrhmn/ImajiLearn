export const PROFILE_KEY = "imajilearn-teacher-profile-v1";

export function readProfile(raw, name = "") {
  let profile;
  try { profile = JSON.parse(raw); } catch {}
  const value = key => typeof profile?.[key] === "string" ? profile[key].trim().slice(0, key === "email" ? 254 : 100) : "";
  return { name: value("name") || name, email: value("email"), school: value("school"), grade: /^[1-6]$/.test(value("grade")) ? value("grade") : "" };
}
