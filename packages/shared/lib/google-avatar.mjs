export function googleAvatarUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    const allowed = ["googleusercontent.com", "ggpht.com"].some(host => url.hostname === host || url.hostname.endsWith("." + host));
    return allowed && url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
