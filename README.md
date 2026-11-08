# ImajiLearn

Monorepo npm workspaces dengan dua aplikasi Next.js berbasis JavaScript/JSX:

- `apps/web`: web guru di http://localhost:3000.
- `apps/pwa`: fondasi tampilan aplikasi mobile di http://localhost:3002.

## Menjalankan

```sh
npm install
npm run dev
```

Gunakan `npm run dev:web` atau `npm run dev:pwa` untuk menjalankan satu aplikasi. Port harus tersedia.

```sh
npm run lint
npm run build
```

## Fondasi database backend

Gunakan Node.js 24 (minimum 22.12) dan PostgreSQL 17 atau lebih baru dengan
database ber-encoding UTF8 agar nama/password Unicode dapat disimpan. Salin
`.env.example` ke `.env` di root lalu isi koneksi database pengembangan Anda.
Jangan gunakan database produksi untuk pengembangan atau tes.

```sh
npm ci
npm run db:validate
npm run db:migrate
npm test
```

`npm ci` menghasilkan Prisma Client; jalankan `npm run db:generate` setelah
mengubah schema. `npm run db:migrate` menerapkan migrasi SQL yang tersimpan di
Git dan melewati migrasi yang sudah diterapkan. Prisma Client hasil generate
dan file `.env` tidak disimpan di Git.

Modul `apps/web/server/core/database.mjs` menyediakan koneksi PostgreSQL bersama
untuk modular monolit. `database()` memakai `DATABASE_URL` dan mempertahankan
satu Prisma Client per proses. `createDatabase()` menyediakan koneksi terpisah
untuk pengujian dan proses yang mengelola lifecycle sendiri; tutup dengan
`$disconnect()` setelah selesai. Tabel dasar `Teacher` menyimpan UUID, email
unik, nama, hash password, profil awal, dan waktu pembuatan. Modul akun memakai
database yang sama untuk sesi dan pembatasan percobaan.

Secara default, tes database memakai PGlite khusus tes tanpa instalasi
PostgreSQL. Untuk memakai PostgreSQL penuh, set `TEST_DATABASE_URL` ke database
khusus tes sebelum menjalankan `npm test`. Tes membuat dan menghapus schema
acak sehingga role tes memerlukan izin CREATE SCHEMA. Gunakan nilai environment
yang sama pada proses server saat modul database mulai dipakai oleh API.

## Registrasi guru

`POST /api/v1/auth/register` menerima JSON `{name,email,password}`. Nama di-trim
dan dibatasi 1–60 unit UTF-16; email di-trim, dinormalisasi lowercase, maksimal
254 karakter dan unik. Password 8–128 unit UTF-16, tanpa trim atau normalisasi.
Field lain ditolak. Batas body JSON 16 KiB. Password memakai scrypt N=32768,
r=8, p=1, salt acak 16 byte dan output 64 byte.

Salin juga konfigurasi `.env` ke `apps/web/.env.local` untuk menjalankan Next.js
lokal, atau pasang environment variables yang sama di hosting. Semua write
memerlukan header `Origin` persis sama dengan `APP_ORIGIN`; produksi memerlukan
origin HTTPS. Respons sukses 201 berbentuk
`{data:{user:{id,name,email,school,grade},expiresAt}}` dan menyetel cookie sesi.
Akun dan sesi dibuat dalam satu transaksi. Token acak hanya ada pada cookie
HttpOnly, SameSite=Lax, path=/; database menyimpan SHA-256 token. HTTPS memakai
cookie `__Host-imajilearn_session` dengan Secure. Sesi awal berlaku 7 hari,
dapat dikonfigurasi melalui `SESSION_ABSOLUTE_SECONDS`.

Email duplikat menghasilkan 409 `EMAIL_IN_USE`; isian tidak valid 422; Origin
ditolak 403; JSON rusak 400; body terlalu besar 413; media type salah 415.
Error memakai `{error:{code,message,fields?,requestId}}`, tanpa hash, token,
stack, atau detail database. Semua respons memakai Cache-Control:no-store.

Rate limit registrasi disimpan di database, default 5 percobaan per jam pada
bucket IP; `REGISTER_IP_LIMIT` mengatur jumlahnya. Tanpa header proxy tepercaya,
semua request memakai satu bucket bersama. Hanya isi `TRUSTED_CLIENT_IP_HEADER`
jika reverse proxy menghapus dan mengganti header tersebut; header kiriman
client seperti X-Forwarded-For diabaikan secara default. Percobaan dibatasi
sebelum hashing; input yang gagal validasi tidak memakai kuota registrasi.
Batas tercapai menghasilkan 429 dengan Retry-After. Frontend registrasi belum
dihubungkan ke API.

## Sesi guru

- `POST /api/v1/auth/login` menerima `{email,password}`. Email dinormalisasi
  seperti registrasi; password 1–128 unit UTF-16 diterima untuk verifikasi,
  tanpa trim. Kredensial salah selalu 401 `INVALID_CREDENTIALS`, baik email
  ada maupun tidak. Unknown field ditolak. Login sukses 200 memakai bentuk
  `{data:{user:{id,name,email,school,grade},expiresAt}}` dan cookie sesi baru.
- `GET /api/v1/auth/session` mengembalikan identitas guru dan waktu kedaluwarsa
  absolut dalam bentuk yang sama, atau JSON401 `SESSION_REQUIRED`. GET tidak
  memerlukan Origin. Password hash dan token tidak dikirim dalam JSON.
- `POST /api/v1/auth/logout` mencabut sesi dari cookie dan menghapus cookie.
  Respons 204 tanpa body; mengulang logout tetap 204 dan tidak menghapus akun.

Cookie yang dikirim saat login sukses dicabut dalam transaksi yang sama dengan
pembuatan sesi baru. Password salah atau kegagalan pembuatan sesi tidak mencabut
sesi lama. Logout hanya mencabut sesi yang dikirim, bukan seluruh perangkat.
Cookie malformed/duplikat ditolak saat membaca sesi.

Sesi kedaluwarsa setelah 7 hari secara absolut atau 24 jam tanpa aktivitas;
atur `SESSION_ABSOLUTE_SECONDS` dan `SESSION_IDLE_SECONDS` pada server. Membaca
sesi memperbarui waktu aktivitas, tanpa memperpanjang batas absolut. Modul
`createSessionHandlers(database,config).requireTeacher(request)` menyediakan
identitas terverifikasi untuk modul backend berikutnya dan menolak dengan401
bila sesi tidak valid.

Login dibatasi default 5 kegagalan per kombinasi email+IP dan 30 percobaan perIP
dalam 15 menit (`LOGIN_FAILURE_LIMIT`, `LOGIN_IP_LIMIT`). Throttle disimpan di
database dan memberi 429+Retry-After; logout tidak dibatasi throttle login.
Konfigurasi proxy tepercaya sama dengan registrasi. Semua write tetap memerlukan
Origin yang benar dan semua respons auth memakai Cache-Control:no-store.
Integrasi form frontend dan guard halaman privat belum termasuk tahap API ini.

## Materi teks milik guru

Tahap ini menyediakan tiga endpoint dengan sesi guru yang sama:

| Method | Path | Body/ketentuan |
| --- | --- | --- |
| POST | `/api/v1/materials` | JSON `{title,text}` dan header `Idempotency-Key` |
| GET | `/api/v1/materials/:materialId` | Detail materi milik guru |
| PATCH | `/api/v1/materials/:materialId` | JSON `{archived:boolean}` dan header `If-Match` |

Judul di-trim, wajib nonempty, maksimal 120 unit UTF-16. Teks wajib memiliki isi
non-spasi, maksimal 40.000 unit UTF-16; spasi dan baris baru asli dipertahankan.
Karakter NUL ditolak. Body POST dibatasi 256 KiB. Unknown field ditolak;
identitas pemilik, status awal, ID, revisi sumber, dan waktu diterbitkan server.
Materi teks manual langsung memiliki `extractionStatus:ready`, `file:null`,
`folderId:null`, dan `pinned:false`. Hash revisi SHA-256 berasal dari judul dan
teks tersimpan. Arsip/pemulihan tidak mengubah isi atau revisi sumber.

POST sukses 201; GET/PATCH 200. Respons `{data:...}` menyertakan ETag sesuai
`resourceVersion`. Detail memuat teks dan waktu ISO UTC, tanpa owner atau lock
internal. Materi akun lain dan ID hilang sama-sama menghasilkan 404; tanpa sesi
401. PATCH memakai `If-Match: "N"` dari respons terakhir: tanpa versi 428,
format tidak valid 400, versi usang 412. Hanya status arsip yang dapat diubah.

`Idempotency-Key` wajib berupa 1–100 karakter ASCII non-spasi. Ruang key terpisah
per guru dan route. Key sama dengan payload tervalidasi yang sama mengembalikan
respons create asli selama 24 jam; payload berbeda menghasilkan 409. Transaksi
menyimpan materi dan respons idempotensi bersama, sehingga retry bersamaan dan
kegagalan database tidak membuat duplikat atau reservasi setengah jadi.

Modul `createMaterialService(database)` menyediakan pembacaan sumber milik guru,
batch 1–100 sumber dengan ownership seluruhnya, dan `withOwnedMaterial` untuk
operasi yang memerlukan lock materi. Reader transaksi
`getOwnedMaterial(transaction,userId,id)` dapat dipakai modul dokumen dan
mengembalikan snapshot sumber atau null. Transaksi pemanggil harus tetap terbuka
sampai operasi yang memakai sumber selesai. Lock materi tidak mengubah versi
atau waktu pembaruan publik; arsip dan operasi berikutnya memakai lock yang sama.

Upload PDF/TXT, ekstraksi, list/search, folder, file privat, penghapusan, integrasi
frontend, dan penyimpanan preferensi media belum termasuk tahap materi teks ini.

## Penyimpanan internal preferensi media

`createMediaPreferenceStore(database)` di modul `documents/media-preferences`
menyediakan `get(userId,materialId)` dan
`save(userId,materialId,{selectedMedia,songTemplateId},expectedVersion)` untuk
pemanggil backend. `userId` harus berasal dari sesi guru terverifikasi; store
memeriksa kepemilikan materi lagi melalui modul materi. Endpoint baca batch
dijelaskan di bawah; penyimpanan melalui HTTP memakai endpoint PUT terpisah.

Satu materi memiliki paling banyak satu record preferensi. Media yang diizinkan
adalah `reading`, `mindmap`, `slides`, `song`; pilihan harus unik, 0–4 media.
Urutan disimpan sesuai katalog. Array kosong sah. Template lagu adalah
`balonku`, `cicak_dinding`, atau `potong_bebek`; field yang tidak dikirim memakai
default `balonku`. Template yang dikirim tetap tersimpan walaupun `song` tidak
dipilih. Simpan kedua field untuk mempertahankan template pilihan sebelumnya.

Materi tanpa record mengembalikan pilihan kosong, `songTemplateId:balonku`,
`resourceVersion:0`, dan `updatedAt:null` tanpa membuat record baru. Gunakan versi
0 untuk penyimpanan pertama; versi naik pada setiap save yang diterima. Versi
preferensi terpisah dari versi materi. Versi usang menghasilkan 412, tanpa versi
428, dan input tidak valid 422. ID asing/hilang sama-sama 404. ID UUID dengan
huruf besar mengacu ke materi yang sama dan dikembalikan dalam bentuk kanonis.

Store memakai lock transaksi yang sama dengan arsip/pemulihan materi. Materi
arsip tetap dapat dibaca, tetapi save ditolak dengan 409 `MATERIAL_ARCHIVED`.
Preferensi lama tetap utuh untuk dipakai setelah pemulihan. Constraint database
menjaga katalog, keunikan pilihan, template, versi positif, dan kecocokan pemilik
dengan materi melalui foreign key komposit. Save tidak mengubah revisi, versi,
atau waktu pembaruan materi, serta tidak menjalankan AI.

## GET batch preferensi media

`GET /api/v1/media-preferences?materialIds=id1,id2` memerlukan sesi guru. Kirim
tepat satu parameter `materialIds` berisi 1–100 ID unik; parameter lain, ID
berulang, daftar kosong atau lebih dari 100 ID ditolak dengan 422. UUID dipetakan
ke bentuk kanonis sehingga perbedaan huruf besar/kecil tidak membuat preferensi
terbaca sebagai default kosong.

Respons 200 berbentuk `{data:[...],page:{nextCursor:null}}`, mengikuti urutan ID
permintaan. Setiap item memuat `materialId`, `selectedMedia`, `songTemplateId`,
`resourceVersion`, dan `updatedAt`; preferensi belum tersimpan memakai default
versi 0 tanpa membuat record baru. Materi arsip tetap dapat dibaca. Endpoint tidak
mengirim teks sumber atau identitas pemilik dan memakai Cache-Control:no-store.

Semua materi wajib milik guru yang sedang masuk. Jika satu ID hilang/asing,
seluruh batch gagal 404 tanpa hasil parsial; tanpa sesi menghasilkan JSON 401.
Pemeriksaan pemilik dan pembacaan preferensi memakai satu snapshot transaksi,
sehingga hasil tidak mencampur dua keadaan database saat ada save bersamaan.
Pembacaan batch memakai dua query tanpa mengambil teks sumber atau mengunci
baris materi. Integrasi frontend tetap tahap terpisah.

## PUT preferensi media

`PUT /api/v1/media-preferences/:materialId` memerlukan sesi guru, Origin yang
benar, Content-Type application/json, dan `If-Match: "N"` dari versi preferensi
terakhir. Body maksimal 4 KiB berisi `{selectedMedia,songTemplateId}`; aturan
katalog dan penyimpanan internal di atas tetap berlaku. Gunakan `If-Match: "0"`
untuk preferensi yang belum tersimpan. Versi materi tidak dipakai sebagai versi
preferensi.

Respons sukses 200 berbentuk `{data:...}` dengan item preferensi yang sama seperti
GET dan ETag baru. GET berikutnya membaca hasil tersimpan. Array kosong dapat
dipakai untuk “Batalkan semua”; template lagu yang dikirim tetap disimpan meski
media lagu tidak dipilih. Unknown field seperti userId/resourceVersion ditolak.

Tanpa sesi 401; Origin salah 403; materi asing/hilang 404; tanpa If-Match 428;
format If-Match salah 400; versi usang 412; materi arsip 409 MATERIAL_ARCHIVED;
isian tidak valid 422; JSON rusak 400; MIME salah 415; body terlalu besar 413.
Error tidak mengembalikan data parsial, stack atau detail database. Seluruh
respons memakai Cache-Control:no-store dan requestId. Simpan preferensi tidak
mengubah sumber materi, membuat dokumen, atau menjalankan AI.

