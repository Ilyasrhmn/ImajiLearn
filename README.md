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

