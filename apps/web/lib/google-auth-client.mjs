const fallback = "Google belum dapat dihubungi. Coba lagi.";

export async function requestGoogleAuthorization({ teacherId, currentPassword } = {}, { fetchImpl = fetch } = {}) {
  const linking = Boolean(teacherId);
  const headers = linking ? { "Content-Type": "application/json", "X-Teacher-Id": teacherId } : {};
  let response;
  try {
    response = await fetchImpl(linking ? "/api/v1/me/google/link" : "/api/v1/auth/google", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: linking ? JSON.stringify({ currentPassword }) : undefined,
    });
  } catch {
    throw new Error(fallback);
  }
  if (linking && response.status === 401) return { sessionExpired: true };
  const payload = await response.json().catch(() => null);
  if (linking && payload?.error?.code === "ACCOUNT_CHANGED") return { accountChanged: true };
  if (!response.ok) {
    if (response.status === 429) throw new Error("Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.");
    if (linking && payload?.error?.code === "INVALID_PASSWORD") throw new Error("Kata sandi saat ini belum sesuai. Periksa dan coba lagi.");
    if (linking && payload?.error?.code === "GOOGLE_ALREADY_LINKED") throw new Error("Akun ini sudah terhubung dengan Google. Muat ulang halaman.");
    if (linking && payload?.error?.code === "PASSWORD_UNAVAILABLE") throw new Error("Akun ini masuk menggunakan Google. Muat ulang halaman.");
    if (payload?.error?.code === "GOOGLE_UNAVAILABLE") throw new Error("Google belum tersedia. Silakan coba lagi nanti.");
    throw new Error(fallback);
  }
  let url;
  try { url = new URL(payload?.data?.url); } catch { throw new Error(fallback); }
  if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password) throw new Error(fallback);
  return { url: url.href };
}

export function googleCallbackNotice(code, context = "login") {
  if (typeof code !== "string") return null;
  if (code === "linked") return context === "account" ? { message: "Akun Google terhubung. Anda dapat masuk dengan Google.", type: "success" } : null;
  const messages = {
    cancelled: "Proses Google dibatalkan. Anda dapat mencoba lagi.",
    expired: "Proses Google sudah berakhir. Silakan coba lagi.",
    failed: "Proses Google belum berhasil. Silakan coba lagi.",
    email_exists: "Email ini sudah terdaftar. Masuk dengan kata sandi, lalu hubungkan Google di pengaturan akun.",
    email_mismatch: "Gunakan akun Google dengan email yang sama dengan akun ImajiLearn Anda.",
    conflict: "Akun Google ini sudah terhubung dengan akun lain. Gunakan akun Google yang sesuai.",
    already_linked: "Akun ini sudah terhubung dengan Google.",
  };
  return Object.hasOwn(messages, code) ? { message: messages[code], type: code === "cancelled" ? "info" : "error" } : null;
}
