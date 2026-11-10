# Audit lokal PWA

Lingkup: branch `pwa`, sebelum deployment HTTPS. Audit ini mencakup telaah
kode frontend, seluruh tes otomatis lokal, integrasi build produksi dan
pemeriksaan browser pada viewport 390 × 844. Ini bukan persetujuan rilis.

## Perbaikan

- Kontrol instalasi/pembaruan dipertahankan pada shell ketika halaman berganti.
  Hanya konten halaman yang diberi key berdasarkan path; event instalasi yang
  sudah ditangkap tidak ikut hilang karena kontrol dibuat ulang.
- Status pembukaan tautan materi baru ditandai selesai setelah detail berhasil
  dimuat. Jika request gagal, Coba lagi menjalankan pembukaan detail kembali.

## Bukti pemeriksaan

| Pemeriksaan | Hasil |
| --- | --- |
| `npm test` | 217 kasus: 201 lulus, 16 skip, 0 gagal |
| `npm run lint` | Lulus |
| `npm run test:pwa:production` | Build kedua aplikasi dan integrasi HTTP lulus |
| Masuk akun sintetis, buka materi dari Beranda | Berhasil di browser lokal |
| Ubah pilihan media, tutup, lalu Lanjutkan edit | Peringatan muncul; pilihan tetap ada |
| Kembalikan pilihan dan tutup panel | Panel tertutup tanpa menyimpan perubahan |
| Navigasi Materi → Jadwal → Akun | Berhasil; formulir tambah jadwal dapat dibuka/ditutup |
| Lebar halaman Materi dan Akun | Tidak melampaui viewport 390 px |

Tes otomatis mencakup kontrak akun/sesi, kepemilikan materi dan folder,
preferensi media, jadwal, ujian, validasi provider LKPD, penyimpanan dokumen,
serta aturan cache offline. Ini tidak berarti semua skenario tersebut diulang
melalui UI dalam audit ini. Perubahan masa hidup kontrol PWA dan retry detail
ditelaah pada kode; event instalasi asli dan kegagalan detail yang disengaja
belum diuji melalui browser.

## Temuan terbuka dan pemeriksaan akhir

- Pratinjau dengan database PGlite sementara sesekali merespons HTTP 500 pada
  pembacaan materi/folder/jadwal. Retry daftar materi berhasil. Penyebab belum
  terisolasi; ulangi alur dan permintaan bersamaan pada PostgreSQL penuh,
  kemudian selidiki log server bila masih terjadi. Jangan menandainya lulus.
- Ke-16 tes skip membutuhkan PostgreSQL penuh melalui `TEST_DATABASE_URL`.
- Cetak/PDF LKPD siswa/panduan guru dan soal/kisi-kisi/kunci masih memerlukan
  hasil keluaran browser: ukuran A4, pemisahan halaman dan teks/gambar utuh.
- Instalasi, pembaruan worker, retensi tawaran instalasi saat navigasi, serta
  perilaku offline di HP memerlukan staging HTTPS dan perangkat nyata.
- Database dan provider LKPD lingkungan tujuan belum dikonfigurasi. Generator
  LKPD belum diuji ulang dengan provider nyata dalam audit ini.

Deployment HTTPS ditunda sesuai permintaan pengguna. Tidak ada deployment,
migrasi database aplikasi, perubahan provider, atau push dalam tahap audit ini.
