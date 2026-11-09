// Server-rendered pages expose only availability, never the credential values.
export function isGoogleSignInConfigured(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}
