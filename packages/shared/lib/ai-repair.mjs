export const aiRepairHeader = "X-AI-Repair";

const corrections = {
  INVALID_PROVIDER_RESPONSE: "Respons sebelumnya bukan objek JSON yang valid. Kembalikan hanya satu objek JSON lengkap sesuai kontrak asli, tanpa markdown atau teks di luar JSON.",
  INCOMPLETE_OUTPUT: "Respons sebelumnya terpotong. Gunakan JSON padat, patuhi batas panjang setiap kolom dan jumlah item yang diminta. Tetap cakup fakta penting dalam bagian sumber ini, tanpa pengulangan atau pengantar tambahan.",
  RESPONSE_TOO_LARGE: "Respons sebelumnya melebihi batas ukuran. Kembalikan JSON padat tanpa pengulangan, patuhi batas panjang setiap kolom dan jumlah item yang diminta. Gunakan hanya bagian sumber yang diberikan dan tetap cakup fakta pentingnya.",
  INVALID_READING: "Bacaan sebelumnya ditolak validasi. Periksa title, sections dengan heading dan paragraphs yang tidak kosong, serta quiz: opsi berbeda, answerIndex dalam rentang opsi, sectionIndex merujuk bagian yang ada. Patuhi jumlah item dan panjang kolom pada instruksi asli.",
  INVALID_SLIDES: "Slide sebelumnya ditolak validasi. Pastikan title dan slides terisi. Tiap slide memiliki title dan 1–4 points berbeda. Patuhi batas karakter judul, poin, dan scene pada instruksi asli.",
  INVALID_VISUAL: "Visual sebelumnya ditolak validasi. Gunakan model yang didukung, rujukan sumber yang benar-benar ada, identitas bagian unik, ukuran dan posisi valid tanpa benturan. Patuhi kontrak geometri dan interaksi asli; jangan mengarang model atau bukti sumber.",
  INVALID_SONG_LYRICS: "Lirik sebelumnya ditolak validasi. Periksa title, learningPoints dan sections; gunakan jenis verse, chorus, response yang diizinkan, jumlah bagian/baris/kata dan panjang kolom sesuai instruksi asli. Gunakan bahasa Indonesia alami, tanpa petunjuk aransemen di dalam lirik.",
  INVALID_ILLUSTRATION_PLAN: "Rencana gambar sebelumnya tidak valid. Jika diminta sections, sertakan setiap index tepat satu kali, complexity simple/complex dan priority bilangan bulat 0–100. Jika diminta keputusan gambar, generate harus boolean; figureId harus kandidat yang ada; jika generate true lengkapi subject, composition, details dalam batas karakter asli. Jangan mengarang gambar sumber.",
  INVALID_EXAM_OUTPUT: "Soal sebelumnya ditolak validasi. Isi semua slot tepat satu kali dengan number dan jenis yang diminta. Jumlah opsi harus tepat, berbeda dan tanpa label ganda; jawaban pilihan ganda satu huruf yang tersedia. Lengkapi pembahasan, indikator, materi, capaian dan cognitiveLevel C1–C4 serta rubric uraian. Jangan mengubah soal yang sudah diisi guru.",
};

export function aiCorrection(code) {
  return typeof code === "string" && Object.hasOwn(corrections, code) ? corrections[code] : null;
}
