const messages = {
  MUSIC_CREDITS_REQUIRED: "Kuota pembuatan lagu habis. Periksa saldo layanan musik.",
  MUSIC_REQUEST_UNKNOWN: "Status pengiriman lagu belum dapat dipastikan. Jangan membuat ulang agar kuota tidak terpotong dua kali.",
  INVALID_AI_FEATURE: "Fitur AI tidak tersedia.",
  AI_NOT_CONFIGURED: "Layanan AI belum dikonfigurasi.",
  INVALID_AI_CONFIG: "Konfigurasi layanan AI tidak sesuai.",
  INVALID_AI_INPUT: "Permintaan AI tidak sesuai.",
  INPUT_TOO_LARGE: "Materi terlalu panjang untuk satu permintaan.",
  UNSUPPORTED_MODALITY: "Layanan ini hanya menerima pembuatan teks.",
  PROVIDER_AUTH_ERROR: "Kredensial layanan AI belum dapat digunakan.",
  RATE_LIMITED: "Layanan AI sedang membatasi permintaan. Coba lagi nanti.",
  PROVIDER_UNAVAILABLE: "Layanan AI belum dapat dihubungi.",
  PROVIDER_REQUEST_REJECTED: "Layanan AI menolak konfigurasi permintaan.",
  PROVIDER_TIMEOUT: "Waktu tunggu layanan AI habis.",
  CANCELED: "Pembuatan dibatalkan.",
  PROVIDER_REFUSAL: "Materi belum dapat diproses oleh layanan AI.",
  INCOMPLETE_OUTPUT: "Hasil AI belum lengkap.",
  INVALID_PROVIDER_RESPONSE: "Hasil AI belum sesuai format.",
  RESPONSE_TOO_LARGE: "Hasil AI melebihi batas ukuran.",
};

export class AIError extends Error {
  constructor(code, { field, status, usage } = {}) {
    super(messages[code] || messages.PROVIDER_UNAVAILABLE);
    this.name = "AIError";
    this.code = code;
    if (field) this.field = field;
    if (status) this.status = status;
    if (usage) this.usage = usage;
  }
}
