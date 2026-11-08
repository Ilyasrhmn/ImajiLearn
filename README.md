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

Gunakan Node.js 24 (minimum 22.12) dan PostgreSQL 17 atau lebih baru. Salin
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
unik, nama, hash password, profil awal, dan waktu pembuatan. Registrasi dan
sesi belum diaktifkan pada tahap ini.

Secara default, tes database memakai PGlite khusus tes tanpa instalasi
PostgreSQL. Untuk memakai PostgreSQL penuh, set `TEST_DATABASE_URL` ke database
khusus tes sebelum menjalankan `npm test`. Tes membuat dan menghapus schema
acak sehingga role tes memerlukan izin CREATE SCHEMA. Gunakan nilai environment
yang sama pada proses server saat modul database mulai dipakai oleh API.

