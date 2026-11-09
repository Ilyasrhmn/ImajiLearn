import { validateLkpdContent } from "./lkpd.mjs";

export async function generateLkpd(request, { signal, endpoint = process.env.NEXT_PUBLIC_LKPD_ENDPOINT || "", transport = fetch } = {}) {
  signal?.throwIfAborted();
  if (!endpoint) throw new Error("Pembuatan LKPD belum tersedia.");
  const response = await transport(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
  signal?.throwIfAborted();
  if (!response.ok) throw new Error(response.status === 422 ? "Materi belum dapat dibuat menjadi aktivitas ini." : "LKPD belum berhasil dibuat. Coba lagi.");
  const content = await response.json();
  signal?.throwIfAborted();
  if (JSON.stringify(content).length > 30000 || validateLkpdContent(content, request.templateId)) throw new Error("Hasil LKPD belum sesuai. Coba buat lagi.");
  return content;
}
