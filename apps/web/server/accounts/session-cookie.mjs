export const sessionCookieName = secure => secure ? "__Host-imajilearn_session" : "imajilearn_session";

export function sessionToken(request, secure) {
  const name = sessionCookieName(secure);
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  const token = cookies.length === 1 ? cookies[0].slice(name.length + 1) : "";
  return /^[a-f\d]{64}$/.test(token) ? token : null;
}

export function sessionCookie(token, secure, maxAge) {
  return `${sessionCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
