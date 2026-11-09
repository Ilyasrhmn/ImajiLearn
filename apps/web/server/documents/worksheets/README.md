# Worksheet document API

Modul ini menyimpan dokumen LKPD yang telah disetujui oleh pemanggil server.
Autentikasi memakai sesi guru dari `accounts/sessions.mjs`; koneksi memakai
database Prisma bersama. Konfigurasi `APP_ORIGIN` dan `DATABASE_URL` mengikuti
README root. Modul ini tidak menyediakan provider, job, pemeriksaan layout,
atau endpoint publik untuk membuat dokumen dari content client.

## Endpoint

Semua path memakai prefix `/api/v1`, memerlukan sesi guru, dan mengirim
`Cache-Control: no-store` serta `X-Request-Id`.

| Method dan path | Permintaan | Respons sukses |
| --- | --- | --- |
| `GET /worksheets` | `limit` opsional 1–100, default 50; `cursor` opsional | `200 {data: [...], page: {nextCursor}}` |
| `GET /worksheets/{id}` | ID dokumen | `200 {data: document}` dan `ETag` |
| `PATCH /worksheets/{id}` | JSON `{content?, theme?}`; `If-Match` wajib | `200 {data: document}` dan ETag baru |
| `DELETE /worksheets/{id}` | `If-Match` wajib | `204`, tanpa body |

Pagination memakai `updatedAt DESC, id DESC`, dengan filter pemilik sebelum
limit. Kirim cursor respons tanpa mengubahnya; `nextCursor: null` berarti
halaman terakhir. Parameter berulang atau di luar `limit`/`cursor` ditolak.

Write harus mengirim `Origin` sesuai `APP_ORIGIN`. PATCH harus memakai
`Content-Type: application/json` dan sekurangnya satu dari `content`/`theme`.
Field lain ditolak. Tema hanya `ink` atau `color`. Batas body PATCH 256 KiB;
content dibatasi 30.000 unit UTF-16 setelah `JSON.stringify(content)`.

## Versi dan DTO

ETag adalah satu angka dalam tanda kutip. Contoh setelah GET mengirim
`ETag: "3"`, gunakan `If-Match: "3"` saat PATCH/DELETE. Jangan memakai
`schemaVersion`, wildcard atau weak ETag sebagai versi penyimpanan.

Document memuat:

```text
id, source: {id, title, revision}, schemaVersion, resourceVersion,
templateId, templateVersion, assetVersion, grade, theme, content,
displayOrder, createdAt, updatedAt, cacheKey
```

`schemaVersion`, `templateVersion` dan `assetVersion` bernilai 1;
`resourceVersion` naik pada edit. Grade adalah string kosong atau `1`–`6`.
Tanggal berupa ISO8601 UTC. Tema awal `ink`. ID/urutan kartu, snapshot sumber,
grade, template, dan cacheKey tidak dapat diganti melalui editor.

`source` adalah snapshot historis. `source.id` tetap ada setelah materi asli
dihapus dan tidak membuktikan sumber masih bisa diakses. Foreign key komposit
menjamin relasi sumber aktif dimiliki guru yang sama. Hapus sumber mengosongkan
relasi aktif, tanpa menghapus dokumen, content, cache atau snapshot historis.

Adapter FE memetakan `schemaVersion: 1` ke `version: 1` milik viewer bila
diperlukan, menyimpan resourceVersion/ETag secara terpisah, dan mempertahankan
revisi sumber utuh. Jangan memotong revision ke batas parser storage browser
lama, membuat ID baru, atau mengacak ulang displayOrder saat membaca respons.
Simpan baru dianggap sukses setelah respons server diterima; 412 memerlukan
penanganan konflik tanpa membuang edit lokal.

## Penyimpanan internal

Pemanggil server menggunakan `createWorksheetStorage` dari `storage.mjs`:

```js
const storage = createWorksheetStorage({ database: db, requireTeacher });
const document = await storage.storeDocument(
  request,
  { materialId, templateId, content: approvedServerContent },
  serverSourceSnapshot.revision,
);
```

`requireTeacher` harus berasal dari identitas yang diverifikasi core. Snapshot
revisi dan content adalah hasil pipeline server, bukan field publik yang
dipercayai dari browser. Sumber dibaca ulang melalui pembaca materi BE1 yang
mengunci baris selama transaksi. Sumber asing/hilang, arsip, belum ready atau
berubah revisi tidak disimpan. Grade berasal dari profil terautentikasi saat
command dimulai; perubahan profil kemudian tidak mengubah dokumen lama.

Schema lima template serta whitelist aset diperiksa server melalui
`validateWorksheetContent`; string NUL dan Unicode dengan surrogate tidak
berpasangan ditolak agar tidak gagal saat disimpan sebagai PostgreSQL JSONB.

Transaksi memakai lock per guru pada WorksheetLibrary. Maksimal 20 dokumen
tersimpan. Constraint menjaga ID serta owner+cacheKey tetap unik. Modul job
yang kelak menambah reservasi kapasitas harus berkoordinasi dengan lock yang
sama; modul dokumen ini tidak membuat atau mengelola reservasi/job.

Cache mencakup identitas guru dan sumber, revision, template, templateVersion,
assetVersion, grade, serta bahasa `id`. Dua materi dengan judul dan isi identik
tetap mempunyai cache terpisah. Cache hit mengembalikan dokumen existing,
termasuk edit guru, versi dan urutan kartu. Key lama tetap dapat dibaca hanya
jika identitas sumber cocok; edit lama tidak ditimpa atau dipindahkan ke sumber
lain. Delete dokumen mengeluarkannya dari cache; hanya command penyimpanan baru
yang dapat menghasilkan dokumen baru.

Command internal dapat melempar `WORKSHEET_LIMIT_REACHED`, `SOURCE_CHANGED`,
`SOURCE_NOT_READY`, `MATERIAL_NOT_FOUND` atau `INVALID_WORKSHEET`. Pemanggil
bertanggung jawab atas persetujuan hasil dan lifecycle-nya sebelum menyimpan;
tidak boleh melakukan insert langsung yang melewati validasi, lock dan kuota.

## Respons gagal HTTP

Format: `{error: {code, message, fields?, requestId}}`. ID dokumen asing dan
hilang sama-sama 404; tidak ada respons parsial atau detail database.

| Status | Kondisi |
| --- | --- |
| 400 | JSON, query atau format If-Match salah |
| 401 | Sesi tidak ada, dicabut atau kedaluwarsa |
| 403 | Origin ditolak |
| 404 | Dokumen tidak ditemukan untuk guru tersebut |
| 409 | ResourceVersion mencapai batas INTEGER PostgreSQL (`2147483647`) saat edit |
| 412 | ResourceVersion sudah berubah |
| 413 | Body terlalu besar |
| 415 | Content-Type PATCH bukan JSON |
| 422 | Content/tema/field/pagination tidak valid |
| 428 | If-Match tidak dikirim |
| 500/503 | Kegagalan internal/layanan database atau konfigurasi belum tersedia |

## Pengujian

```sh
npm run db:generate
npm run db:validate
npm test
npm run lint
npm run build
node tests/worksheets-http-smoke.mjs
```

Tanpa `TEST_DATABASE_URL`, tes database memakai PGlite. Set variabel tersebut
ke PostgreSQL khusus tes untuk menjalankan seluruh tes konkurensi tanpa skip.
Tes membuat schema acak dan menghapusnya setelah selesai; role tes memerlukan
izin CREATE SCHEMA. Smoke test menjalankan Next.js di port loopback sementara,
menggunakan schema tes dan fixture sintetis, kemudian menghentikan server.
